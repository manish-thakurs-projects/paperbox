import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexHtml = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(indexHtml).catch(err => console.error('Failed to load renderer:', err));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startServices() {
  try {
    const discovery = await import('./discovery');
    const pairing = await import('./pairing');
    const upload = await import('./upload');
    const websocket = await import('./websocket');
    const storage = await import('./storage');

    const discoverySvc = await discovery.start({ onDeviceFound: d => mainWindow?.webContents.send('device-found', d) });
    const pairingSvc = await pairing.start();
    const uploadSvc = await upload.start({ onProgress: p => mainWindow?.webContents.send('upload-progress', p) });
    const wsSvc = await websocket.start();
    const storageSvc = await storage.start();

    return async () => {
      await Promise.allSettled([discoverySvc.stop(), pairingSvc.stop(), uploadSvc.stop(), wsSvc.stop(), storageSvc.stop()].map(p => p.catch?.(e => console.error(e))));
    };
  } catch (err) {
    console.error('Failed to start services', err);
    return async () => {};
  }
}

app.whenReady().then(async () => {
  createWindow();
  const stopAll = await startServices();

  app.on('before-quit', async () => {
    await stopAll();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Simple IPC example
ipcMain.handle('app:get-info', async () => ({
  name: 'PaperBox Desktop',
  version: app.getVersion()
}));
