@echo off
echo Server startet auf http://localhost:3000
echo Dieses Fenster offen lassen — mit Strg+C beenden.
echo.
node -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{const p=req.url.split('?')[0];let f=path.join(__dirname,p==='/'?'index.html':p);try{const d=fs.readFileSync(f);const ext=path.extname(f);const mime={'html':'text/html','css':'text/css','js':'text/javascript','json':'application/json'}[ext.slice(1)]||'text/plain';res.writeHead(200,{'Content-Type':mime});res.end(d)}catch{res.writeHead(404);res.end('Not found')}}).listen(3000,()=>{console.log('Lauft! http://localhost:3000/daily-tracker.html');})"
pause
