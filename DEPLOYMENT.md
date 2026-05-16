# Deployment

## Netlify automatisch aktualisieren

1. Projekt in ein GitHub-Repository pushen.
2. In Netlify `Add new site` -> `Import an existing project` wählen.
3. GitHub-Repository verbinden.
4. Build settings:
   - Build command: leer lassen
   - Publish directory: `.`
5. Danach aktualisiert Netlify die Website automatisch bei jedem Push auf `main`.

## Supabase automatisch aktualisieren

Die Datenbank-Migrationen liegen in `supabase/migrations`.

Damit GitHub Supabase automatisch aktualisiert:

1. In GitHub zu `Settings` -> `Secrets and variables` -> `Actions` gehen.
2. Secret `SUPABASE_DB_URL` anlegen.
3. Wert aus Supabase kopieren: `Project Settings` -> `Database` -> `Connection string` -> URI.
4. Passwort in der URI einsetzen.
5. Danach läuft `.github/workflows/supabase-migrations.yml` bei jedem Push auf `main`, wenn Migrationen geändert wurden.

Die aktuelle Auth-/RLS-Migration ist:

`supabase/migrations/20260516180700_daily_tracker_user_state.sql`
