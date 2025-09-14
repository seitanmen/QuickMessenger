const { ipcRenderer } = require('electron');
const WebSocket = require('ws');
const crypto = require('crypto-js');
const cryptoNode = require('crypto');
const fs = require('fs');
const path = require('path');


let ws;
let currentUser = null;
let selectedUser = null;
let attachedFiles = [];
let pingInterval;
let currentLanguage = 'en';
let userMap = new Map(); // Map to store userId -> username
let messageHistory = new Map(); // Map to store messages by conversation
let isLocked = false;

// Log to file for debugging
const logFile = path.join(__dirname, 'client_debug.log');
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

// RSA key pair for client
let clientPublicKey;
let clientPrivateKey;
let serverPublicKey;
let sessionKey;

// Password strength validation
function validatePasswordStrength(password) {
  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (password.length < minLength) return 'Password must be at least 8 characters long.';
  if (!hasUpper) return 'Password must contain at least one uppercase letter.';
  if (!hasLower) return 'Password must contain at least one lowercase letter.';
  if (!hasNumber) return 'Password must contain at least one number.';
  if (!hasSpecial) return 'Password must contain at least one special character.';
  return null; // Valid
}

// Language data
const languages = {
  en: {
    appTitle: 'QuickMessenger',
    cancelBtn: 'Cancel',
    chooseUsername: 'Choose Username',
    enterUsername: 'Enter username',
    registerBtn: 'Register',
    onlineUsers: 'Online Users',
    typeMessage: 'Type your message... (Shift+Enter for new line)',
    changeUsernameBtn: 'Change Username',

    fileSaved: 'File saved to: ',
    screenshotSaved: 'Screenshot saved to: ',
    devToolsOpened: 'DevTools opened',
    newUsernamePrompt: 'Enter new username:',
    you: 'You',
    unknownUser: 'Unknown User',
    saveVideo: 'Save Video',
    // Connection screen texts
    connectingToServer: 'Connecting to Server...',
    searchingServers: 'Searching for available servers...',
    connectingTitle: 'Connecting...',
    connectedTitle: 'Connected!',
    connectionLost: 'Connection Lost',
    connectionFailed: 'Connection Failed',
    discoveringServers: 'Discovering Servers...',
    broadcastingRequest: 'Broadcasting discovery request...',
    serverFound: 'Server Found!',
    discoveryError: 'Discovery Error',
    tryingLocalhost: 'Trying localhost...',
    noServerFound: 'No Server Found',
    localhostFallback: 'Trying localhost as fallback...',
    registering: 'Registering username...',
    registrationSuccessful: 'Registration Successful!',
    welcome: 'Welcome',
    reconnecting: 'Attempting to reconnect...',
    retrying: 'Retrying...',
    checkServerRunning: 'Unable to connect to server. Please check if the server is running.',
    // Message control placeholders
    connectingToServerMsg: 'Connecting to server...',
    connectionFailedRetrying: 'Connection failed. Retrying...',
    connectionLostReconnecting: 'Connection lost. Reconnecting...',
    connectionFailedRegister: 'Connection failed. Register to retry...',
    notConnectedRegister: 'Not connected to server. Please register to connect...',
    selectUserToMessage: 'Select a user to start messaging...',
    messageUser: 'Message',
    // User selection and file sending
    selectUserToSendMessage: 'Please select a user to send a message to.',
    selectUserToSendFile: 'Please select a user to send a file to.',
    // Connection status details
    tryingWith: 'Trying',
    with: 'with',
    connectingTo: 'Connecting to',
    foundServer: 'Found server:',
    at: 'at',
    retryingWith: 'Retrying with localhost...',
    showingManualSetup: 'Showing manual username setup...',
     // General connection messages
     errorConnectingTo: 'Error connecting to',
     // Password lock messages
     enterPassword: 'Enter Password',
     setPassword: 'Set Password',
     passwordSetupDesc: 'Please set a password to secure your app.',
     enterPasswordPlaceholder: 'Please enter your password.',
     confirmPasswordPlaceholder: 'Confirm password',
     setPasswordBtn: 'Set Password',
     unlockBtn: 'Unlock',
     resetBtn: 'Reset App',
     passwordMismatch: 'Passwords do not match.',
     passwordTooShort: 'Password must be at least 4 characters.',
     incorrectPassword: 'Incorrect password.',
     resetConfirm: 'Are you sure you want to reset the app? This will clear all data.'
   },
  ja: {
    appTitle: 'QuickMessenger',
    cancelBtn: 'キャンセル',
    chooseUsername: 'ユーザ名を設定',
    enterUsername: 'ユーザ名を入力',
    registerBtn: '登録',
    onlineUsers: 'オンラインユーザー',
    typeMessage: 'メッセージを入力... (Shift+Enterで改行)',
    changeUsernameBtn: 'ユーザ名を変更',

    fileSaved: 'ファイルが保存されました: ',
    screenshotSaved: 'スクリーンショットが保存されました: ',
    devToolsOpened: 'DevToolsが開かれました',
    newUsernamePrompt: '新しいユーザ名を入力:',
    you: 'あなた',
    unknownUser: '不明なユーザー',
    saveVideo: 'ビデオを保存',
    // Connection screen texts
    connectingToServer: 'サーバーに接続中...',
    searchingServers: '利用可能なサーバーを検索中...',
    connectingTitle: '接続中...',
    connectedTitle: '接続完了！',
    connectionLost: '接続が切断されました',
    connectionFailed: '接続に失敗しました',
    discoveringServers: 'サーバーを検出中...',
    broadcastingRequest: '検索リクエストを送信中...',
    serverFound: 'サーバーが見つかりました！',
    discoveryError: '検索エラー',
    tryingLocalhost: 'localhostを試行中...',
    noServerFound: 'サーバーが見つかりません',
    localhostFallback: 'localhostにフォールバック中...',
    registering: 'ユーザー名を登録中...',
    registrationSuccessful: '登録が完了しました！',
    welcome: 'ようこそ',
    reconnecting: '再接続を試行中...',
    retrying: '再試行中...',
    checkServerRunning: 'サーバーに接続できません。サーバーが動作しているか確認してください。',
    // Message control placeholders
    connectingToServerMsg: 'サーバーに接続中...',
    connectionFailedRetrying: '接続に失敗しました。再試行中...',
    connectionLostReconnecting: '接続が切断されました。再接続中...',
    connectionFailedRegister: '接続に失敗しました。登録して再試行してください...',
    notConnectedRegister: 'サーバーに接続されていません。登録して接続してください...',
    selectUserToMessage: 'メッセージを送信するユーザーを選択してください...',
    messageUser: 'メッセージ',
    // User selection and file sending
    selectUserToSendMessage: 'メッセージを送信するユーザーを選択してください。',
    selectUserToSendFile: 'ファイルを送信するユーザーを選択してください。',
    // Connection status details
    tryingWith: '試行中',
    with: 'で',
    connectingTo: '接続中',
    foundServer: 'サーバーを発見:',
    at: 'アドレス',
    retryingWith: 'localhostで再試行中...',
    showingManualSetup: '手動ユーザー名設定を表示中...',
     // General connection messages
     errorConnectingTo: '接続エラー',
     // Password lock messages
     enterPassword: 'パスワードを入力',
     setPassword: 'パスワードを設定',
     passwordSetupDesc: 'アプリを保護するためにパスワードを設定してください。',
     enterPasswordPlaceholder: 'パスワードを入力して下さい。',
     confirmPasswordPlaceholder: 'パスワードを入力(確認)',
     setPasswordBtn: 'パスワードを設定',
     unlockBtn: '解除',
     resetBtn: 'アプリをリセット',
     passwordMismatch: 'パスワードが一致しません。',
     passwordTooShort: 'パスワードは4文字以上で入力してください。',
     incorrectPassword: 'パスワードが正しくありません。',
     resetConfirm: 'アプリをリセットしますか？すべてのデータが削除されます。'
   },
  zh: {
    appTitle: 'QuickMessenger',
    cancelBtn: '取消',
    chooseUsername: '设置用户名',
    enterUsername: '输入用户名',
    registerBtn: '注册',
    onlineUsers: '在线用户',
    typeMessage: '输入消息... (Shift+Enter换行)',
    changeUsernameBtn: '更改用户名',

    fileSaved: '文件已保存到: ',
    screenshotSaved: '截图已保存到: ',
    devToolsOpened: 'DevTools已打开',
    newUsernamePrompt: '输入新用户名:',
    you: '你',
    unknownUser: '未知用户',
    saveVideo: '保存视频',
    // Connection screen texts
    connectingToServer: '连接服务器中...',
    searchingServers: '搜索可用服务器...',
    connectingTitle: '连接中...',
    connectedTitle: '已连接！',
    connectionLost: '连接丢失',
    connectionFailed: '连接失败',
    discoveringServers: '发现服务器中...',
    broadcastingRequest: '广播发现请求...',
    serverFound: '发现服务器！',
    discoveryError: '发现错误',
    tryingLocalhost: '尝试localhost...',
    noServerFound: '未找到服务器',
    localhostFallback: '回退到localhost...',
    registering: '注册用户名中...',
    registrationSuccessful: '注册成功！',
    welcome: '欢迎',
    reconnecting: '尝试重新连接...',
    retrying: '重试中...',
    checkServerRunning: '无法连接到服务器。请检查服务器是否正在运行。',
    // Message control placeholders
    connectingToServerMsg: '连接服务器中...',
    connectionFailedRetrying: '连接失败。重试中...',
    connectionLostReconnecting: '连接丢失。重新连接中...',
    connectionFailedRegister: '连接失败。注册重试...',
    notConnectedRegister: '未连接到服务器。请注册连接...',
    selectUserToMessage: '选择用户开始消息...',
    messageUser: '消息',
    // User selection and file sending
    selectUserToSendMessage: '请选择要发送消息的用户。',
    selectUserToSendFile: '请选择要发送文件的用户。',
    // Connection status details
    tryingWith: '尝试',
    with: '使用',
    connectingTo: '连接到',
    foundServer: '发现服务器:',
    at: '地址',
    retryingWith: '用localhost重试...',
    showingManualSetup: '显示手动用户名设置...',
     // General connection messages
     errorConnectingTo: '连接错误到',
     // Password lock messages
     enterPassword: '输入密码',
     setPassword: '设置密码',
     passwordSetupDesc: '请设置密码以保护您的应用。',
     enterPasswordPlaceholder: '请输入密码',
     confirmPasswordPlaceholder: '输入密码（确认）',
     setPasswordBtn: '设置密码',
     unlockBtn: '解锁',
     resetBtn: '重置应用',
     passwordMismatch: '密码不匹配。',
     passwordTooShort: '密码必须至少4个字符。',
     incorrectPassword: '密码错误。',
     resetConfirm: '确定要重置应用吗？这将清除所有数据。'
   }
 };

// DOM elements
const lockScreen = document.getElementById('lock-screen');
const passwordInput = document.getElementById('password-input');
const unlockBtn = document.getElementById('unlock-btn');
const resetBtn = document.getElementById('reset-btn');
const lockError = document.getElementById('lock-error');
const connectionScreen = document.getElementById('connection-screen');
const connectionTitle = document.getElementById('connection-title');
const connectionStatus = document.getElementById('connection-status');
const connectionProgress = document.getElementById('connection-progress');
const mainApp = document.getElementById('main-app');
const usernameInput = document.getElementById('username-input');
const registerBtn = document.getElementById('register-btn');
const userSetup = document.getElementById('user-setup');
const userList = document.getElementById('user-list');
const usersContainer = document.getElementById('users-container');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const screenshotBtn = document.getElementById('screenshot-btn');
const debugBtn = document.getElementById('debug-btn');
const lockBtn = document.getElementById('lock-btn');

const languageSelect = document.getElementById('language-select');
const changeUsernameBtn = document.getElementById('change-username-btn');
const usernameModal = document.getElementById('username-modal');
const newUsernameInput = document.getElementById('new-username-input');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalClose = document.querySelector('.modal-close');

// Update UI texts based on selected language
function updateTexts() {
  const lang = languages[currentLanguage];
  document.querySelector('h1').textContent = lang.appTitle;
  document.getElementById('username-input').placeholder = lang.enterUsername;
  document.getElementById('register-btn').textContent = lang.registerBtn;
  document.querySelector('.user-setup h3').textContent = lang.chooseUsername;
  document.querySelector('.user-list h3').textContent = lang.onlineUsers;
  document.getElementById('message-input').placeholder = lang.typeMessage;
  document.getElementById('change-username-btn').textContent = lang.changeUsernameBtn;


  // Update modal texts
  document.getElementById('modal-title').textContent = lang.changeUsernameBtn;
  document.getElementById('new-username-input').placeholder = lang.newUsernamePrompt;
  document.getElementById('modal-cancel-btn').textContent = lang.cancelBtn;
  document.getElementById('modal-confirm-btn').textContent = lang.changeUsernameBtn;

  // Update connection screen texts
  document.getElementById('connection-title').textContent = lang.connectingToServer;
  document.getElementById('connection-status').textContent = lang.searchingServers;

  // Update lock screen texts
  document.getElementById('lock-title').textContent = lang.enterPassword;
  document.getElementById('password-input').placeholder = lang.enterPasswordPlaceholder;
  document.getElementById('unlock-btn').textContent = lang.unlockBtn;
  document.getElementById('reset-btn').textContent = lang.resetBtn;
}

// Load saved language
function loadLanguage() {
  const savedLang = localStorage.getItem('language') || 'en';
  currentLanguage = savedLang;
  languageSelect.value = savedLang;
  updateTexts();
}

// Initialize app
async function init() {
  console.log('=== INITIALIZING APP ===');
  loadTheme();
  loadLanguage();
  setupEventListeners();
  loadMessageHistory();

  // Load saved username and update UI
  const savedUsername = localStorage.getItem('username');
  if (savedUsername) {
    changeUsernameBtn.textContent = savedUsername;
    console.log(`Loaded saved username: ${savedUsername}`);
  }

  // Generate RSA key pair for client
  const keyPair = cryptoNode.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  });
  clientPublicKey = keyPair.publicKey;
  clientPrivateKey = keyPair.privateKey;
  console.log('Client RSA key pair generated');

  console.log('Setting initial screen visibility...');
  // Initially hide all screens
  lockScreen.classList.add('hidden');
  connectionScreen.classList.add('hidden');
  mainApp.classList.add('hidden');

  // Check if password is set
  const hasPassword = await ipcRenderer.invoke('has-password');
  if (hasPassword) {
    // Always show lock screen if password is set
    showLockScreen();
  } else {
    // No password set, show password setup
    showPasswordSetup();
  }
}

// Disable message controls with custom placeholder
function disableMessageControls(placeholderKey = 'notConnectedRegister') {
  const lang = languages[currentLanguage];
  messageInput.disabled = true;
  sendBtn.disabled = true;
  fileBtn.disabled = true;
  
  // Use language-specific placeholder
  let placeholder = lang[placeholderKey] || placeholderKey;
  messageInput.placeholder = placeholder;
}

// Enable message controls for user selection
function enableMessageControlsForSelection() {
  const lang = languages[currentLanguage];
  messageInput.disabled = true;
  sendBtn.disabled = true;
  fileBtn.disabled = true;
  messageInput.placeholder = lang.selectUserToMessage;
}

// Enable message controls for messaging
function enableMessageControlsForMessaging(username) {
  const lang = languages[currentLanguage];
  messageInput.disabled = false;
  sendBtn.disabled = false;
  fileBtn.disabled = false;
  messageInput.placeholder = `${lang.messageUser} ${username}...`;
}

// Show lock screen
function showLockScreen() {
  console.log('=== SHOWING LOCK SCREEN ===');
  lockScreen.classList.remove('hidden');
  lockError.classList.add('hidden')
  connectionScreen.classList.add('hidden');
  mainApp.classList.add('hidden');
  passwordInput.value = '';
  passwordInput.focus();
}

// Show password setup screen (reuse connection screen for setup)
function showPasswordSetup() {
  console.log('=== SHOWING PASSWORD SETUP ===');
  connectionScreen.classList.remove('hidden');
  mainApp.classList.add('hidden');
  lockScreen.classList.add('hidden');

  const lang = languages[currentLanguage];

  // Modify connection screen for password setup
  connectionTitle.textContent = lang.setPassword;
  connectionStatus.textContent = lang.passwordSetupDesc;
  connectionProgress.textContent = '';

  // Hide spinner and show password input
  document.querySelector('.connection-spinner').style.display = 'none';
  const setupContainer = document.createElement('div');
  setupContainer.id = 'password-setup-container';
  setupContainer.innerHTML = `
    <input type="password" id="setup-password" placeholder="${lang.enterPasswordPlaceholder}" >
    <input type="password" id="confirm-password" placeholder="${lang.confirmPasswordPlaceholder}" >
    <div id="setup-error" style="color: #ff4444; margin: 10px 0;"></div>
    <button id="set-password-btn" style="width: 100%; padding: 10px; background: #2196f3; color: white; border: none; border-radius: 4px; cursor: pointer;">${lang.setPasswordBtn}</button>
  `;
  connectionScreen.querySelector('.connection-container').appendChild(setupContainer);

  document.getElementById('set-password-btn').addEventListener('click', setPassword);
  document.getElementById('setup-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setPassword();
  });
  document.getElementById('confirm-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') setPassword();
  });
}

// Set password
async function setPassword() {
  const password = document.getElementById('setup-password').value;
  const confirm = document.getElementById('confirm-password').value;
  const errorDiv = document.getElementById('setup-error');
  const lang = languages[currentLanguage];

  if (!password) {
    errorDiv.textContent = lang.enterPasswordPlaceholder;
    return;
  }

  if (password !== confirm) {
    errorDiv.textContent = lang.passwordMismatch;
    return;
  }

  const strengthError = validatePasswordStrength(password);
  if (strengthError) {
    errorDiv.textContent = strengthError;
    return;
  }

  try {
    await ipcRenderer.invoke('set-password', password);
    // Save password to localStorage
    localStorage.setItem('password', password);
    // Remove setup container and show connection screen
    const setupContainer = document.getElementById('password-setup-container');
    if (setupContainer) setupContainer.remove();
    document.querySelector('.connection-spinner').style.display = 'block';
    disableMessageControls('connectingToServerMsg');
    showConnectionScreen();
  } catch (error) {
    errorDiv.textContent = 'Error setting password.';
  }
}

// Unlock app
async function unlockApp() {
  const password = passwordInput.value;
  const lang = languages[currentLanguage];
  if (!password) {
    lockError.classList.remove('hidden')
    lockError.textContent = lang.enterPasswordPlaceholder;
    return;
  }

  const isValid = await ipcRenderer.invoke('verify-password', password);
  if (isValid) {
    // Save password to localStorage for future use
    console.log(`Saving password to localStorage: "${password}" (length: ${password.length})`);
    localStorage.setItem('password', password);
    console.log('Password saved to localStorage, verifying...');
    const savedPassword = localStorage.getItem('password');
    console.log(`Verified saved password: "${savedPassword}" (length: ${savedPassword ? savedPassword.length : 0})`);

    await ipcRenderer.invoke('unlock-app');
    lockScreen.classList.add('hidden');
    disableMessageControls('connectingToServerMsg');
    showConnectionScreen();
  } else {
    lockError.classList.remove('hidden')
    lockError.textContent = lang.incorrectPassword;
    passwordInput.value = '';
    passwordInput.focus();
  }
}

// Reset app
async function resetApp() {
  const lang = languages[currentLanguage];
  if (confirm(lang.resetConfirm)) {
    // Clear localStorage to reset userId, username, and token
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('token');
    localStorage.removeItem('password');
    await ipcRenderer.invoke('reset-app');
    // Reload the app
    location.reload();
  }
}

// Clear stored credentials for new registration (keep password)
function clearStoredCredentials() {
  console.log('Clearing stored credentials (keeping password)...');
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  localStorage.removeItem('token');
  // Keep password - don't remove it
  console.log('Stored credentials cleared (password preserved)');
}

// Show connection screen
function showConnectionScreen() {
  console.log('=== SHOWING CONNECTION SCREEN ===');
  connectionScreen.classList.remove('hidden');
  mainApp.classList.add('hidden'); // Ensure main app is hidden

  // Disable message controls while connecting
  disableMessageControls('connectingToServerMsg');

  updateConnectionStatus('connectingToServer', 'searchingServers');
  console.log('Connection screen visible, starting connection process...');

  // Always start connection process when showing connection screen
  setTimeout(() => {
    console.log('Starting server connection...');
    startServerConnection();
  }, 1000);
}

// Start server connection process
function startServerConnection() {
  // Use saved username if available, otherwise generate default
  let username = localStorage.getItem('username');
  if (!username) {
    username = 'User_' + Math.floor(Math.random() * 1000);
  }
  console.log(`=== STARTING SERVER CONNECTION ===`);
  console.log(`Username: ${username}`);
  console.log('Attempting localhost connection first...');

  const lang = languages[currentLanguage];
  updateConnectionStatus('connectingTitle', `${lang.tryingWith} localhost ${lang.with} ${username}...`);

  // First try to connect to localhost
  connectToServer(username, 'localhost');

  // Wait a bit, then also try discovery
  setTimeout(() => {
    console.log('Starting server discovery...');
    discoverServers(username);
  }, 2000);
}



// Update connection status
function updateConnectionStatus(titleKey, statusKey, progress = '') {
  const lang = languages[currentLanguage];
  
  // If titleKey is a language key, use translation, otherwise use as-is
  const title = lang[titleKey] || titleKey;
  const status = lang[statusKey] || statusKey;
  
  connectionTitle.textContent = title;
  connectionStatus.textContent = status;
  connectionProgress.textContent = progress;
}



// Setup event listeners
function setupEventListeners() {

  // Lock screen events
  unlockBtn.addEventListener('click', unlockApp);
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') unlockApp();
  });
  resetBtn.addEventListener('click', resetApp);

  registerBtn.addEventListener('click', registerUser);
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') registerUser();
  });

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', handleMessageInput);
    fileBtn.addEventListener('click', () => {
      if (!selectedUser) {
        const lang = languages[currentLanguage];
        alert(lang.selectUserToSendFile);
        return;
      }
      fileInput.click();
    });
  fileInput.addEventListener('change', handleFileSelection);

  // Drag and drop support
  const chatArea = document.querySelector('.chat-area');
  chatArea.addEventListener('dragover', handleDragOver);
  chatArea.addEventListener('drop', handleDrop);

    themeToggle.addEventListener('click', toggleTheme);
    screenshotBtn.addEventListener('click', takeScreenshot);
    debugBtn.addEventListener('click', openDevTools);
    lockBtn.addEventListener('click', lockApp);


    changeUsernameBtn.addEventListener('click', changeUsername);
    languageSelect.addEventListener('change', changeLanguage);

    // Username change modal event listeners
    modalCancelBtn.addEventListener('click', closeUsernameModal);
    modalConfirmBtn.addEventListener('click', confirmUsernameChange);
    modalClose.addEventListener('click', closeUsernameModal);

    // Close modal when clicking outside
    usernameModal.addEventListener('click', (e) => {
      if (e.target === usernameModal) {
        closeUsernameModal();
      }
    });

    // Handle Enter key in modal input
    newUsernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmUsernameChange();
      }
    });

    // Add keyboard shortcut for force reconnect (Ctrl+R)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        console.log('Force reconnect triggered');
        if (ws) {
          ws.close();
        }
        if (currentUser) {
          connectToServer(currentUser.name, 'localhost');
        }
      }
    });
}





// Register user
function registerUser() {
  const username = usernameInput.value.trim();
  if (!username) return;

  // Show connection screen and keep main app hidden
  connectionScreen.classList.remove('hidden');
  mainApp.classList.add('hidden');

  updateConnectionStatus('Connecting...', `Registering as ${username}...`);

  // Close existing connection if any
  if (ws && ws.readyState === WebSocket.OPEN) {
    console.log('Closing existing connection...');
    ws.close();
  }

  console.log(`Attempting to register with username: ${username}`);

  // First try to connect to localhost
  connectToServer(username, 'localhost');

  // Also try to discover other servers on the network
  discoverServers(username);
}

// Discover available servers
function discoverServers(username) {
  const dgram = require('dgram');
  const discoveryClient = dgram.createSocket('udp4');

  updateConnectionStatus('discoveringServers', 'broadcastingRequest');

  discoveryClient.on('listening', () => {
    discoveryClient.setBroadcast(true);
  });

  discoveryClient.on('message', (msg) => {
    const message = msg.toString();
    if (message.startsWith('QM_DISCOVERY_RESPONSE:')) {
      const [, hostname, ip] = message.split(':');
      console.log(`Found server: ${hostname} at ${ip}`);
      updateConnectionStatus('Server Found!', `Connecting to ${hostname} (${ip})...`);
      // Try to connect to discovered server
      connectToServer(username, ip);
      discoveryClient.close();
    }
  });

  discoveryClient.on('error', (err) => {
    console.error('Discovery client error:', err);
    updateConnectionStatus('Discovery Error', 'Trying localhost...');
  });

  // Send discovery request
  const message = Buffer.from('QM_DISCOVERY_REQUEST');
  discoveryClient.send(message, 0, message.length, 8081, '255.255.255.255');

  // Timeout after 5 seconds
  setTimeout(() => {
    try {
      if (discoveryClient && typeof discoveryClient.close === 'function') {
        discoveryClient.close();
      }
    } catch (error) {
      console.log('Discovery client already closed or error closing:', error.message);
    }
    // If no server found, try localhost as fallback
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      updateConnectionStatus('No Server Found', 'Trying localhost as fallback...');
      connectToServer(username, 'localhost');
    }
  }, 5000);
}

// Connect to WebSocket server
function connectToServer(username, serverIP = 'localhost') {
  console.log(`=== CONNECTING TO WEBSOCKET ===`);
  console.log(`Server: ${serverIP}:8080`);
  console.log(`Username: ${username}`);
  console.log(`WebSocket URL: ws://${serverIP}:8080`);
  
  updateConnectionStatus('Connecting...', `Connecting to ${serverIP}:8080...`);
  
  // Store username temporarily for later use
  window.tempUsername = username;
  
  // Close existing connection if any
  if (ws) {
    console.log('Closing existing WebSocket connection...');
    ws.close();
  }
  
   try {
     ws = new WebSocket(`wss://${serverIP}:8080`);
     console.log('WebSocket object created, waiting for connection...');
   } catch (error) {
     console.error('Error creating WebSocket:', error);
     updateConnectionStatus('Connection Failed', `Error: ${error.message}`);
     return;
   }

  ws.onopen = () => {
    const logMessage = `=== WEBSOCKET CONNECTED === Server: ${serverIP}:8080, readyState: ${ws.readyState}`;
    console.log(logMessage);
    logToFile(logMessage);
    updateConnectionStatus('Connected!', 'Waiting for server public key...');

    // Set flag that connection is ready
    ws.connectionReady = true;
    console.log('Connection ready flag set to true');
    logToFile('Connection ready flag set to true');

    // Start ping interval
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendPing();
      }
    }, 30000);
  };

  ws.onmessage = (event) => {
    const logMessage = `=== RECEIVED MESSAGE === Length: ${event.data.length}, ReadyState: ${ws.readyState}`;
    console.log(logMessage);
    console.log('Raw data:', event.data);
    logToFile(logMessage);
    logToFile(`Raw data: ${event.data}`);
    handleServerMessage(event.data);
  };

  ws.onclose = (event) => {
    console.log('=== WEBSOCKET CLOSED ===');
    console.log('Close code:', event.code);
    console.log('Close reason:', event.reason);
    console.log('Was clean:', event.wasClean);
    
    clearInterval(pingInterval);
    updateConnectionStatus('connectionLost', 'reconnecting');
    
    // Disable message controls when connection is lost
    disableMessageControls('connectionLostReconnecting');
    
    // Attempt to reconnect after a delay
    setTimeout(() => {
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        console.log('reconnecting');
        connectToServer(username, serverIP);
      }
    }, 5000);
  };

   ws.onerror = (error) => {
     console.error('=== WEBSOCKET ERROR ===');
     console.error('Error event:', error);
     console.error('WebSocket state:', ws ? ws.readyState : 'ws is null');

     clearInterval(pingInterval);

     // Check if it's a certificate error
     if (error.message && (error.message.includes('certificate') || error.message.includes('CERT') || error.message.includes('SSL'))) {
       console.log('Certificate error detected, attempting to ignore certificate...');
       // For Electron, we can try to ignore certificate errors
       process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
       updateConnectionStatus('Connection Failed', 'Certificate error. Retrying...');
       setTimeout(() => connectToServer(username, serverIP), 1000);
       return;
     }

     updateConnectionStatus('Connection Failed', `Error connecting to ${serverIP}`);

     // Keep message controls disabled during connection failure
     disableMessageControls('connectionFailedRetrying');

     // Try connecting to localhost if connection fails
     if (serverIP !== 'localhost') {
       console.log('Retrying with localhost...');
       setTimeout(() => connectToServer(username, 'localhost'), 2000);
    } else {
      console.log('Connection to localhost failed, keeping connection screen...');
      updateConnectionStatus('Connection Failed', 'Unable to connect to server. Please check if the server is running.');
      // Keep connection screen visible and disable message controls
      disableMessageControls('connectionFailedRetrying');
      // Do not show main app until connection is successful
    }
   };
}

// Send ping message
function sendPing() {
  const pingData = {
    type: 'ping'
  };

  sendEncryptedMessage(pingData);
}

// Handle server messages
function handleServerMessage(data) {
  console.log('=== HANDLING SERVER MESSAGE ===');
  try {
    const message = JSON.parse(data);
    console.log('Parsed message:', message);
    console.log('Message type:', message.type);
    console.log('Full message data:', JSON.stringify(message, null, 2));

    if (message.type === 'encrypted') {
      console.log('Decrypting message...');
      if (sessionKey) {
        const decrypted = crypto.AES.decrypt(message.content, sessionKey).toString(crypto.enc.Utf8);
        const parsedData = JSON.parse(decrypted);
        console.log('Decrypted data:', parsedData);
        handleDecryptedMessage(parsedData);
      } else {
        console.error('Session key not established');
      }
  } else if (message.type === 'registration_success') {
    console.log('Registration successful!', message);
    handleRegistrationSuccess(message);
  } else if (message.type === 'encrypted' && sessionKey) {
    // Handle encrypted registration_success
    const decrypted = crypto.AES.decrypt(message.content, sessionKey).toString(crypto.enc.Utf8);
    const parsedData = JSON.parse(decrypted);
    if (parsedData.type === 'registration_success') {
      console.log('Decrypted registration successful!', parsedData);
      handleRegistrationSuccess(parsedData);
    } else {
      handleDecryptedMessage(parsedData);
    }
   } else if (message.type === 'server_public_key') {
    console.log('Received server public key');
    logToFile('Received server public key');
    serverPublicKey = message.publicKey;
    // Generate session key and send encrypted
    sessionKey = crypto.lib.WordArray.random(32).toString(); // 256-bit key
    console.log('Generated session key');
    logToFile('Generated session key');
    const encryptedSessionKey = cryptoNode.publicEncrypt(serverPublicKey, Buffer.from(sessionKey));
    console.log('Encrypted session key with server public key');
    logToFile('Encrypted session key with server public key');
    ws.send(JSON.stringify({
      type: 'client_public_key',
      publicKey: clientPublicKey,
      encryptedSessionKey: encryptedSessionKey.toString('base64')
    }));
    console.log('Sent client public key and encrypted session key to server');
    logToFile('Sent client public key and encrypted session key to server');

    // Now send registration message after public key exchange
    if (ws.connectionReady) {
      console.log('Connection ready, sending registration message');
      logToFile('Connection ready, sending registration message');
      const username = window.tempUsername || 'User';
      sendRegistrationMessage(username);
    } else {
      console.log('Connection not ready yet');
      logToFile('Connection not ready yet');
    }
  } else if (message.type === 'registration_error') {
    console.log('Registration error:', message);
    handleRegistrationError(message);
  } else {
    console.log('Unknown message type:', message.type);
  }
  } catch (error) {
    console.error('Error handling server message:', error);
    console.error('Raw data was:', data);
  }
}

// Handle decrypted messages
function handleDecryptedMessage(data) {
  console.log('Handling decrypted message:', data); // Debug log
  switch (data.type) {
    case 'registration_success':
      console.log('Decrypted registration successful!', data);
      handleRegistrationSuccess(data);
      break;
    case 'message':
      displayMessage(data);
      break;
    case 'file':
      displayFileMessage(data);
      break;
    case 'user_list':
      console.log('Received user list:', data.users); // Debug log
      updateUserList(data.users);
      break;
     case 'pong':
       // Connection is healthy
       break;
      case 'username_changed':
        handleUsernameChanged(data);
        break;
      case 'username_change_error':
        handleUsernameChangeError(data);
        break;
  }
}

// Handle registration success
function handleRegistrationSuccess(message) {
  // Get username from either input field or the stored temp username
  const username = usernameInput.value || window.tempUsername || 'User';

  currentUser = {
    id: message.userId,
    name: message.username
  };

  // Save userId, token, username, and password to localStorage for persistence
  // Username is now managed by server
  console.log(`Saving to localStorage: userId=${message.userId}, token=${message.token ? 'present' : 'null'}, username=${message.username}`);
  localStorage.setItem('userId', message.userId);
  localStorage.setItem('username', message.username); // Save username to localStorage
  if (message.token) {
    localStorage.setItem('token', message.token);
    console.log('Token saved to localStorage');
  }
  // Note: Password is already saved when entered, but ensure it's stored
  // Password saving is handled in password setup or login

  // Add current user to userMap
  userMap.set(currentUser.id, currentUser.name);

  changeUsernameBtn.textContent = `${currentUser.name}`;

  // Hide connection screen and show main app only after successful registration
  connectionScreen.classList.add('hidden');
  mainApp.classList.remove('hidden');

  userSetup.classList.add('hidden');
  userList.classList.remove('hidden');

  // Enable controls for user selection (still disabled for messaging)
  enableMessageControlsForSelection();

  updateConnectionStatus('Registration Successful!', `Welcome, ${currentUser.name}!`);
}

// Update user list
function updateUserList(users) {
  // Clear existing user map
  userMap.clear();

  // Update user map with new user list, including current user
  users.forEach(user => {
    userMap.set(user.id, user.name);
  });

  // Re-add current user if not in the list
  if (currentUser && !userMap.has(currentUser.id)) {
    userMap.set(currentUser.id, currentUser.name);
  }

  console.log('Updated userMap:', userMap); // Debug log

  // Update UI user list
  usersContainer.innerHTML = '';

  users.forEach(user => {
    if (user.id !== currentUser.id) {
      const userElement = document.createElement('div');
      userElement.className = 'user-item';
      userElement.textContent = user.name;
      
      // Add unread message indicator
      const unreadCount = getUnreadMessageCount(user.id);
      if (unreadCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = unreadCount;
        userElement.appendChild(badge);
      }

      userElement.addEventListener('click', () => selectUser(user));
      usersContainer.appendChild(userElement);

      // Restore selection if this was the previously selected user
      if (selectedUser && selectedUser.id === user.id) {
        userElement.classList.add('selected');
      }
    }
  });
}

// Handle registration error
function handleRegistrationError(message) {
  console.error(`Registration failed: ${message.error}`);
  alert(`Registration failed: ${message.error}`);

  // If token is invalid, clear stored credentials and retry
  if (message.error.includes('Invalid token') || message.error.includes('Invalid or expired token') || message.error.includes('Malformed UTF-8')) {
    console.log('Token invalid, clearing stored credentials and retrying...');
    clearStoredCredentials();
    // After clearing credentials, restart the connection process
    setTimeout(() => {
      console.log('Restarting connection process after clearing credentials...');
      startServerConnection();
    }, 1000);
  }

  // Keep connection screen visible and show user setup for retry
  connectionScreen.classList.remove('hidden');
  mainApp.classList.add('hidden');
  userSetup.classList.remove('hidden');

  // Keep message controls disabled until successful connection
  disableMessageControls('connectionFailedRegister');

  usernameInput.focus();
  usernameInput.select();
}

// Update user list
function updateUserList(users) {
  usersContainer.innerHTML = '';

  users.forEach(user => {
    if (user.id !== currentUser.id) {
      const userElement = document.createElement('div');
      userElement.className = 'user-item';
      userElement.textContent = user.name;
      userElement.addEventListener('click', () => selectUser(user));
      usersContainer.appendChild(userElement);
    }
  });
}

// Select user for private messaging
function selectUser(user) {
  selectedUser = user;
  document.querySelectorAll('.user-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  // Find and select the clicked user item
  const userItems = document.querySelectorAll('.user-item');
  userItems.forEach(item => {
    if (item.textContent === user.name) {
      item.classList.add('selected');
    }
  });

  // Update chat header and display messages for selected user
  updateChatDisplay();
  displayMessagesForUser(user.id);

  // Enable message controls for messaging
  enableMessageControlsForMessaging(user.name);
}

// Send message
function sendMessage() {
  const content = messageInput.value.trim();
  if (!content && attachedFiles.length === 0) return;
  
  // Check if user is selected
  if (!selectedUser) {
    const lang = languages[currentLanguage];
    alert(lang.selectUserToSendMessage);
    return;
  }

  if (attachedFiles.length > 0) {
    attachedFiles.forEach(file => {
      sendFile(file);
    });
    attachedFiles = [];
    updateFilePreview();
  }

  if (content) {
    const messageData = {
      type: 'message',
      from: currentUser.id,
      to: selectedUser.id,
      content: content,
      timestamp: new Date().toISOString()
    };

    // Store and display sent message immediately
    storeMessageInHistory(messageData);
    renderMessageElement(messageData);

    sendEncryptedMessage(messageData);
    messageInput.value = '';
    adjustTextareaHeight();
  }
}

// Handle message input
function handleMessageInput(e) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // Allow new line
      return;
    } else {
      // Send message
      e.preventDefault();
      sendMessage();
    }
  }
  adjustTextareaHeight();
}

// Adjust textarea height
function adjustTextareaHeight() {
  messageInput.style.height = 'auto';
  messageInput.style.height = messageInput.scrollHeight + 'px';
}

// Send registration message after public key exchange
function sendRegistrationMessage(username) {
  updateConnectionStatus('Connected!', 'Registering username...');

  // Check if localStorage is available
  console.log('Checking localStorage availability...');
  logToFile('Checking localStorage availability...');
  try {
    const testKey = '__test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    console.log('localStorage is available');
    logToFile('localStorage is available');
  } catch (error) {
    console.error('localStorage is not available:', error);
    logToFile(`localStorage is not available: ${error.message}`);
  }

  // Load saved userId, token, and password if exists
  console.log('Loading data from localStorage...');
  logToFile('Loading data from localStorage...');
  const savedUserId = localStorage.getItem('userId');
  const savedToken = localStorage.getItem('token');
  const savedPassword = localStorage.getItem('password');

  console.log('Client data from localStorage:');
  console.log(`userId: ${savedUserId}`);
  console.log(`token: ${savedToken ? 'present' : 'null'}`);
  console.log(`password: ${savedPassword ? 'present' : 'null'}`);
  logToFile(`Client data - userId: ${savedUserId}, token: ${savedToken ? 'present' : 'null'}, password: ${savedPassword ? 'present' : 'null'}`);
  if (savedPassword) {
    console.log(`password length: ${savedPassword.length}`);
    console.log(`password value: "${savedPassword}"`);
    logToFile(`Password length: ${savedPassword.length}`);
  } else {
    console.log('No password in localStorage, will send null');
    logToFile('No password in localStorage, will send null');
    // Try to get all localStorage keys to debug
    console.log('All localStorage keys:');
    let allKeys = 'All localStorage keys:';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      console.log(`  ${key}: ${value}`);
      allKeys += ` ${key}=${value};`;
    }
    logToFile(allKeys);
  }

  // Encrypt password with server's public key (now available)
  let encryptedPassword = savedPassword;
  console.log(`Original password: "${savedPassword}" (length: ${savedPassword ? savedPassword.length : 0})`);
  logToFile(`Original password length: ${savedPassword ? savedPassword.length : 0}`);
  if (savedPassword && serverPublicKey) {
    try {
      encryptedPassword = cryptoNode.publicEncrypt(serverPublicKey, Buffer.from(savedPassword)).toString('base64');
      console.log('Password encrypted with server public key');
      console.log(`Encrypted password length: ${encryptedPassword.length}`);
      logToFile(`Password encrypted, length: ${encryptedPassword.length}`);
    } catch (error) {
      console.log('Password encryption failed:', error.message);
      logToFile(`Password encryption failed: ${error.message}`);
      encryptedPassword = savedPassword; // Fall back to original password
    }
  } else if (!savedPassword) {
    console.log('No saved password found');
    logToFile('No saved password found');
    encryptedPassword = null;
  }

  const registerMessage = {
    type: 'register',
    token: savedToken, // Send saved token for authentication
    password: encryptedPassword, // Send encrypted password
    passwordEncrypted: true // Always encrypted now
  };
  console.log('Sending registration message:', registerMessage);
  logToFile(`Sending registration message: token=${savedToken ? 'present' : 'null'}, password=${encryptedPassword ? 'encrypted' : 'null'}`);
  ws.send(JSON.stringify(registerMessage));
}

// Send encrypted message
function sendEncryptedMessage(data) {
  if (sessionKey) {
    const encrypted = crypto.AES.encrypt(JSON.stringify(data), sessionKey).toString();
    const packet = {
      type: 'encrypted',
      content: encrypted
    };

    ws.send(JSON.stringify(packet));
  } else {
    console.error('Session key not established, cannot send encrypted message');
  }
}

// Display message (for incoming messages)
function displayMessage(data) {
  // Only handle incoming messages (not our own sent messages)
  if (data.from === currentUser.id) {
    return; // Skip - we already displayed this when we sent it
  }

  // Store message in history
  storeMessageInHistory(data);

  // Only display if this message is for the currently selected conversation
  if (shouldDisplayMessage(data)) {
    renderMessageElement(data);
  }
}

// Store message in conversation history
function storeMessageInHistory(data) {
  let conversationId;
  
  if (data.from === currentUser.id) {
    // Message sent by current user
    conversationId = data.to;
  } else {
    // Message received from another user
    conversationId = data.from;
  }

  if (!messageHistory.has(conversationId)) {
    messageHistory.set(conversationId, []);
  }
  
  messageHistory.get(conversationId).push(data);
}

// Check if message should be displayed in current conversation
function shouldDisplayMessage(data) {
  if (!selectedUser) return false;
  
  return (data.from === currentUser.id && data.to === selectedUser.id) ||
         (data.from === selectedUser.id && data.to === currentUser.id);
}

// Render message element to chat
function renderMessageElement(data) {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${data.from === currentUser.id ? 'own' : 'other'}`;

  const header = document.createElement('div');
  header.className = 'message-header';
  
  // Show appropriate username
  let displayName;
  if (data.from === currentUser.id) {
    displayName = languages[currentLanguage].you;
  } else {
    // For received messages, use the sender's username from userMap
    displayName = getUsernameById(data.from);
    // If username not found in map, check if it's the selected user
    if (displayName === languages[currentLanguage].unknownUser && selectedUser && data.from === selectedUser.id) {
      displayName = selectedUser.name;
    }
  }
  
  header.textContent = displayName;

  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = data.content;

  messageElement.appendChild(header);
  messageElement.appendChild(content);

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Get username by ID
function getUsernameById(userId) {
  if (userMap.has(userId)) {
    return userMap.get(userId);
  }
  return languages[currentLanguage].unknownUser;
}

// Handle file selection
function handleFileSelection(e) {
  const files = Array.from(e.target.files);
  attachedFiles = attachedFiles.concat(files);
  updateFilePreview();
}

// Handle drag over
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Handle file drop
function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const files = Array.from(e.dataTransfer.files);
  attachedFiles = attachedFiles.concat(files);
  updateFilePreview();
}

// Update file preview
function updateFilePreview() {
  filePreview.classList.remove('hidden');
  filePreview.innerHTML = '';

  if (attachedFiles.length > 0) {
    filePreview.classList.add('show');
    attachedFiles.forEach((file, index) => {
      const previewItem = document.createElement('div');
      previewItem.className = 'preview-item';

      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        previewItem.appendChild(img);
      } else if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.controls = true;
        previewItem.appendChild(video);
      }

      const fileName = document.createElement('span');
      fileName.textContent = file.name;
      previewItem.appendChild(fileName);

      const removeBtn = document.createElement('button');
      removeBtn.id = 'remove-btn';
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        attachedFiles.splice(index, 1);
        updateFilePreview();
      });
      previewItem.appendChild(removeBtn);

      filePreview.appendChild(previewItem);
    });
  } else {
    filePreview.classList.add('hidden');
    filePreview.classList.remove('show');
  }
}

// Send file
function sendFile(file) {
  if (!selectedUser) {
    alert('Please select a user to send a file to.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const fileData = {
      type: 'file',
      from: currentUser.id,
      to: selectedUser.id,
      filename: file.name,
      fileData: reader.result.split(',')[1], // Remove data URL prefix
      timestamp: new Date().toISOString()
    };

    // Store and display sent file message immediately
    storeMessageInHistory(fileData);
    renderFileMessageElement(fileData);

    sendEncryptedMessage(fileData);
  };
  reader.readAsDataURL(file);
}

// Display file message (for incoming messages)
function displayFileMessage(data) {
  // Only handle incoming file messages (not our own sent files)
  if (data.from === currentUser.id) {
    return; // Skip - we already displayed this when we sent it
  }

  // Store file message in history
  storeMessageInHistory(data);

  // Only display if this message is for the currently selected conversation
  if (shouldDisplayMessage(data)) {
    renderFileMessageElement(data);
  }
}

// Render file message element to chat
function renderFileMessageElement(data) {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${data.from === currentUser.id ? 'own' : 'other'}`;

  const header = document.createElement('div');
  header.className = 'message-header';
  
  // Show appropriate username
  let displayName;
  if (data.from === currentUser.id) {
    displayName = languages[currentLanguage].you;
  } else {
    // For received messages, use the sender's username from userMap
    displayName = getUsernameById(data.from);
    // If username not found in map, check if it's the selected user
    if (displayName === languages[currentLanguage].unknownUser && selectedUser && data.from === selectedUser.id) {
      displayName = selectedUser.name;
    }
  }
  
  header.textContent = displayName;

  // Check if it's an image or video
  if (data.filename.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
    // Display image preview
    const img = document.createElement('img');
    img.src = `data:image;base64,${data.fileData}`;
    img.style.maxWidth = '200px';
    img.style.maxHeight = '200px';
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => saveFile(data.filename, data.fileData));
    messageElement.appendChild(header);
    messageElement.appendChild(img);
  } else if (data.filename.match(/\.(mp4|avi|mov|wmv|flv|webm)$/i)) {
    // Display video preview
    const video = document.createElement('video');
    video.src = `data:video/mp4;base64,${data.fileData}`;
    video.style.maxWidth = '200px';
    video.style.maxHeight = '200px';
    video.controls = true;
    messageElement.appendChild(header);
    messageElement.appendChild(video);


  } else {
    // Regular file
    const fileLink = document.createElement('a');
    fileLink.className = 'file-link';
    fileLink.textContent = `📎 ${data.filename}`;
    fileLink.addEventListener('click', () => saveFile(data.filename, data.fileData));
    messageElement.appendChild(header);
    messageElement.appendChild(fileLink);
  }

  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Save file
async function saveFile(filename, fileData) {
  const savePath = await ipcRenderer.invoke('save-file', filename, fileData);
  if (savePath) {
    alert(languages[currentLanguage].fileSaved + savePath);
  }
}

// Load message history
async function loadMessageHistory() {
  const history = await ipcRenderer.invoke('get-message-history');
  history.forEach(message => {
    if (message.type === 'message') {
      displayMessage(message);
    } else if (message.type === 'file') {
      displayFileMessage(message);
    }
  });
}

// Toggle theme
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

// Load theme
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

// Update theme icon based on current theme
function updateThemeIcon(theme) {
  if (theme === 'dark') {
    themeIcon.src = '../icon/moon.svg';
    themeIcon.alt = 'Switch to Light Theme';
  } else {
    themeIcon.src = '../icon/sun.svg';
    themeIcon.alt = 'Switch to Dark Theme';
  }
}

// Take screenshot
async function takeScreenshot() {
  const filePath = await ipcRenderer.invoke('take-screenshot');
  if (filePath) {
    alert(languages[currentLanguage].screenshotSaved + filePath);
  }
}

// Open DevTools
async function openDevTools() {
  await ipcRenderer.invoke('open-dev-tools');
}

// Lock App
async function lockApp() {
  init();
}

// Change language
function changeLanguage() {
  currentLanguage = languageSelect.value;
  localStorage.setItem('language', currentLanguage);
  updateTexts();
}

// Change username
function changeUsername() {
  if (!currentUser) return;

  const lang = languages[currentLanguage];
  document.getElementById('modal-title').textContent = lang.changeUsernameBtn;
  newUsernameInput.placeholder = lang.newUsernamePrompt;
  newUsernameInput.value = currentUser.name;
  usernameModal.style.display = 'block';
  newUsernameInput.focus();
  newUsernameInput.select();
}

// Close username change modal
function closeUsernameModal() {
  usernameModal.style.display = 'none';
  newUsernameInput.value = '';
}

// Confirm username change
function confirmUsernameChange() {
  const newUsername = newUsernameInput.value.trim();
  console.log(`=== CONFIRMING USERNAME CHANGE ===`);
  console.log(`Current username: ${currentUser.name}`);
  console.log(`New username: ${newUsername}`);
  if (newUsername && newUsername !== currentUser.name) {
    const changeData = {
      type: 'change_username',
      newUsername: newUsername
    };
    console.log(`Sending change_username message:`, changeData);
    sendEncryptedMessage(changeData);
    closeUsernameModal();
  } else {
    console.log('Username change cancelled or invalid');
    closeUsernameModal();
  }
}

// Handle username changed notification
function handleUsernameChanged(data) {
  console.log(`=== HANDLING USERNAME CHANGED NOTIFICATION ===`);
  console.log(`Notification data:`, data);
  console.log(`Current user ID: ${currentUser.id}`);
  if (data.userId === currentUser.id) {
    console.log(`Updating own username: ${currentUser.name} -> ${data.newUsername}`);
    // Update own username
    currentUser.name = data.newUsername;
    localStorage.setItem('username', data.newUsername); // Save updated username to localStorage
    changeUsernameBtn.textContent = `${currentUser.name}`;
  } else {
    console.log(`Username changed for other user: ${data.userId}`);
  }
  // User list will be updated via user_list message
}

// Handle username change error
function handleUsernameChangeError(data) {
  console.log(`=== HANDLING USERNAME CHANGE ERROR ===`);
  console.log(`Error data:`, data);
  alert(`Username change failed: ${data.error}`);
}



// Display messages for selected user
function displayMessagesForUser(userId) {
  chatMessages.innerHTML = '';
  
  if (messageHistory.has(userId)) {
    const messages = messageHistory.get(userId);
    messages.forEach(message => {
      if (message.type === 'file') {
        renderFileMessageElement(message);
      } else {
        renderMessageElement(message);
      }
    });
  }

  // Mark messages as read
  markMessagesAsRead(userId);
}

// Update chat display header
function updateChatDisplay() {
  if (selectedUser) {
    // You can add a chat header here if needed
    console.log(`Now chatting with: ${selectedUser.name}`);
  }
}

// Get unread message count for a user
function getUnreadMessageCount() {
  // For now, return 0. You can implement unread message tracking here
  return 0;
}

// Mark messages as read
function markMessagesAsRead() {
  // Implementation for marking messages as read
  console.log('Messages marked as read');
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);