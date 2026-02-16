import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import { APIServer } from './server';
const QRCode = require('qrcode');

let mainWindow: BrowserWindow | null;
let tray: Tray | null = null;
let apiServer: APIServer | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 790,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Cell Monitor Server',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../assets/icon.ico'),
    center: true,
    show: false,
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/icon.ico');
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Показать приложение',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: 'Выход',
      click: async () => {
        if (apiServer) {
          await apiServer.stop();
          apiServer = null;
        }
        app.exit(0);
      },
    },
  ]);

  tray.setToolTip('Cell Monitor Server');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow?.show();
  });
}

ipcMain.handle('start-server', async (event, dbConfig) => {
  try {
    if (apiServer) {
      await apiServer.stop();
      apiServer = null;
    }

    apiServer = new APIServer(dbConfig.port || 3000);
    
    apiServer.setLogCallback((message) => {
      mainWindow?.webContents.send('server-log', message);
    });

    const url = await apiServer.start(dbConfig);
    const qrCode = await QRCode.toDataURL(url);
    
    return {
      success: true,
      url: url,
      qrCode: qrCode,
    };
  } catch (error) {
    if (apiServer) {
      await apiServer.stop();
      apiServer = null;
    }
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});

ipcMain.handle('stop-server', async () => {
  try {
    if (apiServer) {
      await apiServer.stop();
      apiServer = null;
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // Не выходим
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  if (apiServer) {
    await apiServer.stop();
  }
});