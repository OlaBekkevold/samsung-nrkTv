#!/usr/bin/env node
/*
 * Development server: serves the app and proxies NRK hosts, because PSAPI sends no CORS headers.
 * Only needed for testing in a desktop browser; the TV app talks to NRK directly.
 *
 *   node dev/server.js        then open http://localhost:8000 (best in a 1920x1080 window)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = +process.env.PORT || 8000;
const ROOT = path.resolve(__dirname, '..');
const PROXY_HOSTS = new Set(['psapi.nrk.no', 'undertekst.nrk.no']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

async function proxy(req, res, host, rest) {
  if (!PROXY_HOSTS.has(host)) { res.writeHead(403); res.end('host not allowed'); return; }
  try {
    const upstream = await fetch('https://' + host + rest, { headers: { Accept: req.headers.accept || '*/*' } });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(502); res.end(String(e));
  }
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url);
  const m = /^\/proxy\/([^/]+)(\/.*)$/.exec(req.url);
  if (m) return proxy(req, res, m[1], m[2]);

  let file = path.normalize(path.join(ROOT, url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('NRK TV dev server on http://localhost:' + PORT));
