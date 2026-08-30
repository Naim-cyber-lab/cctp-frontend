// Electron main process. Explicit .cjs extension because package.json sets
// "type": "module" for the rest of the project (Vite/React), but Electron's main
// process is simplest and most compatible as plain CommonJS.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

// Serving the build over http://localhost instead of file:// gives the page a real,
// specific origin (http://localhost:PORT) that the remote API's CORS policy can
// allowlist precisely. Loading via file:// would send `Origin: null` on cross-origin
// fetches, which the server would then have to accept from *any* local file content,
// not just this app — a weaker CORS policy we'd rather not ask the server to run.
const PORT = 51823;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const MIME_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const requestedPath = decodeURIComponent(req.url.split('?')[0]);
      let filePath = path.join(DIST_DIR, requestedPath === '/' ? 'index.html' : requestedPath);
      if (!filePath.startsWith(DIST_DIR)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (error, content) => {
        if (error) {
          // SPA fallback: unknown paths (client-side routes) serve index.html.
          fs.readFile(path.join(DIST_DIR, 'index.html'), (fallbackError, fallbackContent) => {
            if (fallbackError) { res.writeHead(404); res.end('Not found'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(fallbackContent);
          });
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
        res.end(content);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Calepin — CCTP Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(async () => {
  await startStaticServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
