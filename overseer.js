/* Overseer — KI-Assistent für Daily Tracker */
(function () {
  'use strict';

  const API_KEY_KEY = 'overseer-api-key';
  const MODEL = 'claude-haiku-4-5-20251001';
  const MAX_HIST = 6;

  const EMOJI_MAP = {
    laufen:'🏃',running:'🏃',joggen:'🏃',
    radfahren:'🚴',cycling:'🚴',fahrrad:'🚴',
    schwimmen:'🏊',swimming:'🏊',
    krafttraining:'🏋️',strength:'🏋️',gym:'🏋️',
    yoga:'🧘',hiit:'⚡',
    fußball:'⚽',football:'⚽',soccer:'⚽',
    basketball:'🏀',tennis:'🎾',
    wandern:'🥾',hiking:'🥾',
    boxen:'🥊',boxing:'🥊',
    klettern:'🧗',climbing:'🧗',
    triathlon:'🏊',ironman:'🏊',
    default:'💪'
  };

  function sportEmoji(name) {
    const k = (name || '').toLowerCase();
    for (const [key, em] of Object.entries(EMOJI_MAP)) {
      if (k.includes(key)) return em;
    }
    return EMOJI_MAP.default;
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  const Overseer = {
    _page: null,
    _actions: {},
    _history: [],
    _loading: false,

    // ── Public API ────────────────────────────────────────────

    init(config) {
      this._page = config.page;
      this._injectCSS();
      if (config.page === 'tracker') {
        this._buildTrackerBar(config.mount);
      } else {
        this._buildLandingWidget(config.mount);
      }
    },

    registerActions(map) {
      Object.assign(this._actions, map);
    },

    openPanel() {
      const dlg = document.getElementById('ovs-dialog');
      if (dlg) { dlg.showModal(); document.getElementById('ovs-input-landing').focus(); }
    },

    saveKey(key) {
      if (!key.trim()) return;
      localStorage.setItem(API_KEY_KEY, key.trim());
      const row = document.getElementById('ovs-key-row');
      if (row) row.style.display = 'none';
      this._appendMsg('assistant', '✓ API-Key gespeichert');
    },

    async send(userMsg) {
      if (!userMsg.trim() || this._loading) return;
      const apiKey = localStorage.getItem(API_KEY_KEY);
      if (!apiKey) {
        this._appendMsg('assistant', 'Kein API-Key — bitte eintragen:');
        this._showKeyInput();
        return;
      }
      this._loading = true;
      this._appendMsg('user', userMsg);
      this._setLoading(true);
      try {
        const snap = this._buildSnapshot();
        const lang = localStorage.getItem('dt-lang') || 'de';
        const today = todayISO();
        const systemPrompt = `Du bist der Overseer — persönlicher KI-Coach für die Daily-Tracker-App.
NUTZERDATEN (Snapshot):
${JSON.stringify(snap)}
HEUTE: ${today} | SPRACHE: ${lang}

Antworte NUR mit gültigem JSON ohne Markdown-Wrapper. Exaktes Format:
{"reply":"...", "actions":[{"type":"<action-type>","params":{...}}, ...]}
Beispiel für add_todo: {"type":"add_todo","params":{"name":"Morgenroutine","frequency":"regular","start_time":"08:30","duration_min":60}}
Beispiel für log_activity: {"type":"log_activity","params":{"sport":"Laufen","duration_min":45,"intensity":"low"}}
Wenn keine Aktion: {"reply":"...","actions":[]}

Erlaubte action types und ihre params:
add_todo: name, type (boolean|count), target, frequency, color, start_time (HH:MM), duration_min
  frequency: "regular"=täglich wiederholen/Habit (STANDARD!), "daily"=nur heute, "weekly"=diese Woche
  Für "tägliches To-Do"/"Habit"/"Gewohnheit" → IMMER frequency="regular"
log_activity: sport, duration_min, intensity (low|medium|high), date, notes, exercises[]
complete_todo: name_contains, date
log_health: date, weight_kg, sleep_h, kcal, hr, sleep_quality, recovery, steps, protein, carbs, fat, kcal_burned, notes
log_score: wake_time (HH:MM), sleep_h, sleep_quality (1-10), recovery (1-10)
add_day_block: name, start (HH:MM), duration_min, category, date
set_plan_session: date, title, description, duration_min, intensity, details
Bei Fragen: actions=[]. Bei fehlenden Infos: kurze Rückfrage, actions=[].
Erfinde keine Daten.`;

        const messages = [
          ...this._history.slice(-MAX_HIST),
          { role: 'user', content: userMsg }
        ];
        const result = await this._callClaude(apiKey, systemPrompt, messages);
        this._history.push({ role: 'user', content: userMsg });
        this._history.push({ role: 'assistant', content: result.reply || '' });
        if (this._history.length > MAX_HIST + 2) this._history = this._history.slice(-(MAX_HIST + 2));
        const actionsRun = this._executeActions(result.actions || []);
        this._appendMsg('assistant', result.reply || '—');
        if (actionsRun > 0) this._appendMsg('system', `✓ ${actionsRun} Aktion${actionsRun > 1 ? 'en' : ''} ausgeführt`);
      } catch (err) {
        this._appendMsg('assistant', `Fehler: ${err.message}`);
      } finally {
        this._loading = false;
        this._setLoading(false);
      }
    },

    // ── Core Logic ────────────────────────────────────────────

    async _callClaude(apiKey, systemPrompt, messages, isRetry) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt, messages })
      });
      if (resp.status === 401) throw new Error('Ungültiger API-Key');
      if (!resp.ok) throw new Error(`API-Fehler ${resp.status}`);
      const data = await resp.json();
      const text = (data.content?.[0]?.text || '').trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) {
        if (!isRetry) {
          const retryMsgs = [...messages,
            { role: 'assistant', content: text },
            { role: 'user', content: 'Antworte NUR mit JSON: {"reply":"...","actions":[]}' }
          ];
          return this._callClaude(apiKey, systemPrompt, retryMsgs, true);
        }
        throw new Error('Kein JSON in Antwort');
      }
      try { return JSON.parse(m[0]); } catch { throw new Error('JSON-Parse-Fehler'); }
    },

    _buildSnapshot() {
      const today = todayISO();
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const snap = { today, lang: localStorage.getItem('dt-lang') || 'de' };

      try {
        const d = JSON.parse(localStorage.getItem('daily-tracker-v2')) || {};
        const comp = (d.completions || {})[today] || {};
        snap.todos = (d.todos || []).filter(t => t.active !== false).map(t => ({
          name: t.name, type: t.type, target: t.target,
          done_today: t.type === 'boolean' ? !!comp[t.id] : (comp[t.id] || 0)
        }));
        snap.activities_14d = (d.activities || [])
          .filter(a => a.date >= cutoffStr)
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(a => ({ date: a.date, sport: a.type, duration_min: a.duration, intensity: a.intensity }));
      } catch {}

      try {
        const h = JSON.parse(localStorage.getItem('daily-tracker-health')) || {};
        snap.health_last5 = (h.entries || [])
          .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
          .map(e => ({ date: e.date, weight: e.weight, sleep_h: e.sleepH, kcal: e.kcal }));
        const p = h.profile || {};
        if (p.targetWeight || p.height || p.kcalGoal)
          snap.profile = { targetWeight: p.targetWeight, height: p.height, kcalGoal: p.kcalGoal };
      } catch {}

      try {
        const pl = JSON.parse(localStorage.getItem('daily-tracker-plan')) || {};
        const active = (pl.plans || []).find(p => p.id === pl.activePlanId);
        if (active) snap.active_plan = {
          name: active.name || active.sport, sport: active.sport,
          fitness: active.fitness, totalWeeks: active.weeks?.length, startDate: active.startDate
        };
      } catch {}

      try {
        const dp = JSON.parse(localStorage.getItem('daily-tracker-dayplan')) || {};
        snap.wake = dp.wakeTime || '07:00';
        snap.sleep_time = dp.sleepTime || '22:30';
        snap.today_blocks = ((dp.byDate || {})[today] || [])
          .map(b => ({ name: b.name, start: b.start, duration_min: b.duration, category: b.category }));
      } catch {}

      try {
        const sc = JSON.parse(localStorage.getItem('daily-tracker-scores')) || {};
        const sd = (sc.byDate || {})[today];
        if (sd?.total != null) snap.score_today = sd.total;
      } catch {}

      return snap;
    },

    _executeActions(actions) {
      let count = 0;
      for (const action of (actions || [])) {
        if (action.type === 'answer_only') continue;
        try {
          const handler = this._actions[action.type] || this._actions['_fallback'];
          if (handler) {
            // Support both {type, params:{...}} and flat {type, name, ...} structures
            const {type: _t, ...flat} = action;
            const p = (action.params && typeof action.params === 'object') ? action.params : flat;
            console.log('[Overseer] executing', action.type, p);
            handler(p);
            count++;
          }
        } catch (err) { console.warn('[Overseer] Action error:', action.type, err); }
      }
      return count;
    },

    // ── UI Helpers ────────────────────────────────────────────

    _appendMsg(role, text) {
      const hist = this._page === 'landing'
        ? document.getElementById('ovs-history-landing')
        : document.getElementById('ovs-history');
      if (!hist) return;
      const div = document.createElement('div');
      div.className = `ovs-msg ovs-msg-${role}`;
      div.textContent = text;
      hist.appendChild(div);
      hist.scrollTop = hist.scrollHeight;
    },

    _setLoading(on) {
      ['ovs-send','ovs-send-landing'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = on;
      });
      ['ovs-input','ovs-input-landing'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) inp.disabled = on;
      });
      const dot = document.getElementById('ovs-status-dot');
      if (dot) dot.classList.toggle('active', on);
      if (on) {
        this._appendMsg('assistant', '…');
      } else {
        const hist = this._page === 'landing'
          ? document.getElementById('ovs-history-landing')
          : document.getElementById('ovs-history');
        if (hist) {
          const dots = hist.querySelector('.ovs-msg-assistant:last-child');
          if (dots && dots.textContent === '…') dots.remove();
        }
      }
    },

    _showKeyInput() {
      const row = document.getElementById('ovs-key-row');
      if (row) row.style.display = 'flex';
      // Also open panel if collapsed
      const panel = document.getElementById('ovs-panel');
      if (panel && panel.style.display === 'none') this._togglePanel();
    },

    // ── UI Builders ───────────────────────────────────────────

    _buildTrackerBar(mount) {
      if (!mount) return;
      const ph = (localStorage.getItem('dt-lang') === 'en') ? 'Ask or command…' : 'Fragen oder Befehle…';
      mount.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
  <div style="display:flex;align-items:center;gap:8px">
    <span id="ovs-status-dot" class="ovs-status-dot"></span>
    <span class="ovs-logo" style="font-size:1rem">◈ Overseer</span><span style="font-size:.72rem;color:var(--muted,#6b7280);margin-left:6px">(KI-Berater)</span>
  </div>
  <button id="ovs-toggle" class="ovs-btn-toggle" onclick="Overseer._togglePanel()">▾ Verlauf</button>
</div>
<div style="display:flex;gap:8px">
  <input id="ovs-input" type="text" class="ovs-input" placeholder="${ph}" autocomplete="off">
  <button id="ovs-send" class="ovs-btn-send" onclick="Overseer._handleSend()">Senden</button>
</div>
<div id="ovs-panel" style="display:none;margin-top:14px">
  <div id="ovs-history" class="ovs-history"></div>
  <div id="ovs-key-row" class="ovs-key-row" style="display:none;margin-top:8px">
    <input id="ovs-key-input" type="password" class="ovs-input" placeholder="sk-ant-api03-…" style="font-size:.8rem;">
    <button class="ovs-btn-send" onclick="Overseer.saveKey(document.getElementById('ovs-key-input').value)">Speichern</button>
  </div>
</div>`;
      document.getElementById('ovs-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') this._handleSend();
      });
    },

    _buildLandingWidget(mountEl) {
      if (mountEl) {
        mountEl.className = 'ovs-fab';
        mountEl.innerHTML = '◈';
        mountEl.onclick = () => this.openPanel();
      }
      const dlg = document.createElement('dialog');
      dlg.id = 'ovs-dialog';
      dlg.className = 'ovs-dialog';
      dlg.innerHTML = `
<div class="ovs-dialog-header">
  <span class="ovs-logo">◈ Overseer</span><span style="font-size:.72rem;color:var(--muted,#6b7280);margin-left:6px">(KI-Berater)</span>
  <button class="ovs-btn-toggle" onclick="document.getElementById('ovs-dialog').close()" style="padding:4px 10px">✕</button>
</div>
<div id="ovs-history-landing" class="ovs-history ovs-history-landing"></div>
<div id="ovs-key-row" class="ovs-key-row" style="display:none;padding:8px 18px;">
  <input id="ovs-key-input" type="password" class="ovs-input" placeholder="sk-ant-api03-…" style="font-size:.8rem;">
  <button class="ovs-btn-send" onclick="Overseer.saveKey(document.getElementById('ovs-key-input').value)">OK</button>
</div>
<div class="ovs-input-row">
  <input id="ovs-input-landing" type="text" class="ovs-input" placeholder="Fragen oder Befehle…" autocomplete="off">
  <button id="ovs-send-landing" class="ovs-btn-send" onclick="Overseer._handleSendLanding()">↵</button>
</div>`;
      document.body.appendChild(dlg);
      dlg.querySelector('#ovs-input-landing').addEventListener('keydown', e => {
        if (e.key === 'Enter') this._handleSendLanding();
      });
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    },

    _handleSend() {
      const input = document.getElementById('ovs-input');
      if (!input) return;
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      const panel = document.getElementById('ovs-panel');
      if (panel && panel.style.display === 'none') this._togglePanel();
      this.send(val);
    },

    _handleSendLanding() {
      const input = document.getElementById('ovs-input-landing');
      if (!input) return;
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      this.send(val);
    },

    _togglePanel() {
      const panel = document.getElementById('ovs-panel');
      const toggle = document.getElementById('ovs-toggle');
      if (!panel) return;
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      if (toggle) toggle.textContent = open ? '▾' : '▴';
    },

    // ── CSS Injection ─────────────────────────────────────────

    _injectCSS() {
      if (document.getElementById('ovs-css')) return;
      const s = document.createElement('style');
      s.id = 'ovs-css';
      s.textContent = `
.ovs-status-dot{width:8px;height:8px;border-radius:50%;background:var(--primary,#5eead4);flex-shrink:0;opacity:.3;transition:opacity .3s;}
.ovs-status-dot.active{opacity:1;animation:ovs-pulse 1.2s ease-in-out infinite;}
@keyframes ovs-pulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(.55);opacity:.3;}}
.ovs-logo{font-size:.78rem;font-weight:700;color:var(--primary,#5eead4);white-space:nowrap;flex-shrink:0;letter-spacing:.04em;}
.ovs-input{flex:1;min-width:0;background:var(--bg,#0a0a0a);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:8px;color:var(--text,#f5f5f5);font-family:inherit;font-size:.85rem;padding:8px 14px;outline:none;transition:border-color .15s;}
.ovs-input:focus{border-color:var(--primary,#5eead4);}
.ovs-input:disabled{opacity:.5;}
.ovs-btn-send{background:var(--primary,#5eead4);color:#0a0a0a;border:none;border-radius:8px;padding:8px 18px;font-size:.85rem;font-weight:700;cursor:pointer;flex-shrink:0;font-family:inherit;transition:opacity .15s;}
.ovs-btn-send:disabled{opacity:.45;cursor:default;}
.ovs-btn-toggle{background:transparent;border:1px solid var(--border,rgba(255,255,255,.08));border-radius:8px;color:var(--muted,#6b7280);padding:5px 12px;cursor:pointer;font-size:.78rem;flex-shrink:0;font-family:inherit;}
.ovs-history{overflow-y:auto;display:flex;flex-direction:column;gap:6px;max-height:220px;padding-right:2px;scrollbar-width:thin;scrollbar-color:var(--border,rgba(255,255,255,.08)) transparent;}
.ovs-msg{padding:8px 12px;border-radius:8px;font-size:.82rem;line-height:1.5;word-wrap:break-word;max-width:92%;}
.ovs-msg-user{background:var(--surface2,#1c1c1c);color:var(--text,#f5f5f5);align-self:flex-end;border-radius:8px 8px 2px 8px;}
.ovs-msg-assistant{background:rgba(94,234,212,.07);color:var(--text,#f5f5f5);border-left:2px solid var(--primary,#5eead4);align-self:flex-start;border-radius:2px 8px 8px 8px;}
.ovs-msg-system{font-size:.72rem;color:var(--primary,#5eead4);align-self:center;opacity:.75;padding:2px 8px;}
.ovs-key-row{display:flex;gap:6px;align-items:center;}
/* Landing FAB */
.ovs-fab{position:fixed;bottom:28px;right:28px;z-index:999;width:52px;height:52px;border-radius:50%;background:var(--primary,#5eead4);color:#0a0a0a;font-size:1.25rem;font-weight:700;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(94,234,212,.35);transition:transform .2s,box-shadow .2s;font-family:var(--font,'Outfit',sans-serif);display:flex;align-items:center;justify-content:center;}
.ovs-fab:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(94,234,212,.5);}
/* Dialog */
.ovs-dialog{background:var(--surface,#141414);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:16px;padding:0;width:min(480px,95vw);color:var(--text,#f5f5f5);font-family:var(--font,'Outfit',sans-serif);box-shadow:0 20px 60px rgba(0,0,0,.65);}
.ovs-dialog::backdrop{background:rgba(0,0,0,.55);backdrop-filter:blur(4px);}
.ovs-dialog-header{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));}
.ovs-history-landing{max-height:320px;min-height:80px;padding:12px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:7px;scrollbar-width:thin;scrollbar-color:var(--border,rgba(255,255,255,.08)) transparent;}
.ovs-dialog .ovs-input-row{display:flex;gap:8px;padding:12px 18px;border-top:1px solid var(--border,rgba(255,255,255,.08));}
      `;
      document.head.appendChild(s);
    }
  };

  window.Overseer = Overseer;
  window._ovsEmoji = sportEmoji;
  window._ovsId = genId;
})();
