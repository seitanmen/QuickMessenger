const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');

const store = new Store();
let mainWindow;


// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});



// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'icon', 'icon.png'),
    show: false
  });

  mainWindow.loadFile('src/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

   mainWindow.on('closed', () => {
    mainWindow = null;
  });
}





ipcMain.handle('take-screenshot', async () => {
  const screenshot = await mainWindow.webContents.capturePage();
  const fileName = `chat_screenshot_${Date.now()}.jpg`;
  const filePath = path.join(app.getPath('downloads'), fileName);

  fs.writeFileSync(filePath, screenshot.toJPEG(90));
  return filePath;
});

ipcMain.handle('get-message-history', () => {
  return store.get('messageHistory', []);
});

ipcMain.handle('save-file', async (event, fileName, fileData) => {
  const savePath = dialog.showSaveDialogSync(mainWindow, {
    defaultPath: fileName,
    filters: [{ name: 'All Files', extensions: ['*'] }]
  });

  if (savePath) {
    fs.writeFileSync(savePath, Buffer.from(fileData, 'base64'));
    return savePath;
  }
  return null;
});



ipcMain.handle('open-dev-tools', () => {
  if (mainWindow) {
    mainWindow.webContents.openDevTools();
  }
});

// App event handlers
app.whenReady().then(() => {
  try {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Error during app initialization:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});