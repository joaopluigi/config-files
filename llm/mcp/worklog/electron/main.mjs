import { app, BrowserWindow, shell } from 'electron';
import { startServer, shutdown } from './server.mjs';
import { classifyNavigation, openLocalFile } from './navigation.mjs';
// Security policy is explicit: contextIsolation: true and nodeIntegration: false; external URLs use shell.openExternal.

let window;
let baseUrl;

function handleNavigation(url) {
  const kind = classifyNavigation(baseUrl, url);
  if (kind === 'external') return shell.openExternal(url);
  if (kind === 'local-file') return openLocalFile(url, (path) => shell.openPath(path));
  return undefined;
}

function createWindow() {
  window = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    handleNavigation(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (classifyNavigation(baseUrl, url) !== 'app') {
      event.preventDefault();
      handleNavigation(url);
    }
  });
  window.loadURL(`${baseUrl}/`);
  window.on('closed', () => {
    window = undefined;
  });
}

app.whenReady().then(async () => {
  const started = await startServer();
  baseUrl = `http://127.0.0.1:${started.port}`;
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', async (event) => {
  event.preventDefault();
  await shutdown();
  app.exit(0);
});
