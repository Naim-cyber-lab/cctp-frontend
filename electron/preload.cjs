// Runs in an isolated context with access to Node APIs, and exposes only this one
// flag to the page (contextIsolation stays on — no direct Node/Electron access for
// the renderer). The frontend uses this flag exactly like it uses the Tauri one: to
// switch from cookie-based auth to a Bearer token, since a remote HTTPS API's
// SameSite cookie never reaches a page loaded from file://.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('cctpDesktop', true);
