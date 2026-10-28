// Tiny static server for tests and local preview: node scripts/serve.mjs <dir> <port>
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
export function serve(dir, port = 0) {
  const srv = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(dir, p.endsWith('/') ? p + 'index.html' : p);
    try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
if (process.argv[1]?.endsWith('serve.mjs')) {
  const s = await serve(process.argv[2] || 'dist', Number(process.argv[3] || 5173));
  console.log(`http://127.0.0.1:${s.address().port}/`);
}
