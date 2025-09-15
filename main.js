const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { exec } = require('child_process');

const store = new Store();
let mainWindow;

// Function to add certificate to system trust store
function addCertificateToTrustStore() {
  const certPath = path.join(__dirname, 'cert.pem');

  if (!fs.existsSync(certPath)) {
    console.log('Certificate file not found, skipping trust store addition');
    return;
  }

  console.log('Attempting to add certificate to system trust store...');

  if (process.platform === 'darwin') {
    // macOS: Add to system keychain
    exec(`security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}" 2>/dev/null || echo "Admin privileges required for system keychain"`, (error, stdout, stderr) => {
      if (error) {
        console.log('Could not add certificate to system keychain (may require admin privileges)');
        console.log('Certificate will be handled by app-level certificate error handler');
      } else {
        console.log('Certificate successfully added to system keychain');
      }
    });
  } else if (process.platform === 'win32') {
    // Windows: Add to trusted root store
    exec(`certutil -addstore -f ROOT "${certPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.log('Could not add certificate to Windows trusted root store:', error.message);
        console.log('Certificate will be handled by app-level certificate error handler');
      } else {
        console.log('Certificate successfully added to Windows trusted root store');
      }
    });
  } else if (process.platform === 'linux') {
    // Linux: Add to system certificate store
    exec(`cp "${certPath}" /usr/local/share/ca-certificates/quickmessenger.crt 2>/dev/null && update-ca-certificates 2>/dev/null || echo "Admin privileges required for system certificates"`, (error, stdout, stderr) => {
      if (error) {
        console.log('Could not add certificate to Linux system store');
        console.log('Certificate will be handled by app-level certificate error handler');
      } else {
        console.log('Certificate successfully added to Linux system certificate store');
      }
    });
  }
}

// Security settings for TLS/SSL
app.commandLine.appendSwitch('ignore-certificate-errors', 'false');
app.commandLine.appendSwitch('disable-web-security', 'false');

// Handle certificate errors securely
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Check if it's a localhost connection (development only)
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) {
    console.log('Allowing certificate error for localhost development:', error);
    event.preventDefault();
    callback(true);
  } else {
    console.error('Certificate error for non-localhost URL:', url, error);
    console.error('Certificate details:', {
      subjectName: certificate.subjectName,
      issuerName: certificate.issuerName,
      validStart: certificate.validStart,
      validExpiry: certificate.validExpiry
    });
    callback(false);
  }
});



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
    // Add certificate to system trust store
    addCertificateToTrustStore();

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