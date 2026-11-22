'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server = http.createServer((req,res) => {
  let target;
  try {target = path.resolve(base, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));} catch {res.writeHead(400);res.end('Bad request');return;}
  if(target !== base && !target.startsWith(base + path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  if(target === base)target=path.join(base,'index.html');
  fs.readFile(target,(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
server.listen(Number(process.env.PORT)||8743,'127.0.0.1',()=>console.log(`Bell lab: http://127.0.0.1:${server.address().port}`));
