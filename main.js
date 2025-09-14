const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const bcrypt = require('bcrypt');

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
    width: 700,
    height: 800,
    minWidth: 700,
    minHeight: 300,
    useContentSize: true,
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

// Password lock functionality
ipcMain.handle('set-password', (event, password) => {
  const hashedPassword = bcrypt.hashSync(password, 10);
  store.set('passwordHash', hashedPassword);
  store.set('isLocked', true);
  return true;
});

ipcMain.handle('verify-password', (event, password) => {
  const hashedPassword = store.get('passwordHash');
  if (!hashedPassword) return false;
  return bcrypt.compareSync(password, hashedPassword);
});

ipcMain.handle('has-password', () => {
  return !!store.get('passwordHash');
});

ipcMain.handle('unlock-app', () => {
  store.set('isLocked', false);
});

ipcMain.handle('is-locked', () => {
  return store.get('isLocked', false);
});

ipcMain.handle('reset-app', () => {
  // Clear all stored data
  store.clear();
  // Clear message history file
  const messageHistoryPath = path.join(__dirname, 'message_history.json');
  if (fs.existsSync(messageHistoryPath)) {
    fs.unlinkSync(messageHistoryPath);
  }
  // Clear any other app data if needed
  return true;
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