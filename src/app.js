const { ipcRenderer } = require('electron');
const WebSocket = require('ws');
const crypto = require('crypto-js');


let ws;
let currentUser = null;
let selectedUser = null;
let attachedFiles = [];
let pingInterval;
let currentLanguage = 'en';
let userMap = new Map(); // Map to store userId -> username
let messageHistory = new Map(); // Map to store messages by conversation

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
    errorConnectingTo: 'Error connecting to'
  },
  ja: {
    appTitle: 'QuickMessenger',
    cancelBtn: 'キャンセル',
    chooseUsername: 'ユーザ名を選択',
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
    errorConnectingTo: '接続エラー'
  },
  zh: {
    appTitle: 'QuickMessenger',
    cancelBtn: '取消',
    chooseUsername: '选择用户名',
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
    errorConnectingTo: '连接错误到'
  }
};

// DOM elements
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

 const usernameDisplay = document.getElementById('username-display');
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
}

// Load saved language
function loadLanguage() {
  const savedLang = localStorage.getItem('language') || 'en';
  currentLanguage = savedLang;
  languageSelect.value = savedLang;
  updateTexts();
}

// Initialize app
function init() {
  console.log('=== INITIALIZING APP ===');
  loadTheme();
  loadLanguage();
  setupEventListeners();
  loadMessageHistory();
  
  console.log('Setting initial screen visibility...');
  // Initially hide all screens except connection screen
  connectionScreen.classList.add('hidden');
  mainApp.classList.add('hidden');
  
  // Disable all message-related controls from the start
  disableMessageControls('connectingToServerMsg');
  
  console.log('Starting connection screen...');
  showConnectionScreen();
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

// Show connection screen
function showConnectionScreen() {
  console.log('=== SHOWING CONNECTION SCREEN ===');
  connectionScreen.classList.remove('hidden');
  mainApp.classList.add('hidden');
  
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
  const defaultUsername = 'User_' + Math.floor(Math.random() * 1000);
  console.log(`=== STARTING SERVER CONNECTION ===`);
  console.log(`Username: ${defaultUsername}`);
  console.log('Attempting localhost connection first...');
  
  const lang = languages[currentLanguage];
  updateConnectionStatus('connectingTitle', `${lang.tryingWith} localhost ${lang.with} ${defaultUsername}...`);
  
  // First try to connect to localhost
  connectToServer(defaultUsername, 'localhost');
  
  // Wait a bit, then also try discovery
  setTimeout(() => {
    console.log('Starting server discovery...');
    discoverServers(defaultUsername);
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

  // Show connection screen
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
    discoveryClient.close();
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
    ws = new WebSocket(`ws://${serverIP}:8080`);
    console.log('WebSocket object created, waiting for connection...');
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    updateConnectionStatus('Connection Failed', `Error: ${error.message}`);
    return;
  }

  ws.onopen = () => {
    console.log(`=== WEBSOCKET CONNECTED ===`);
    console.log(`Server: ${serverIP}:8080`);
    updateConnectionStatus('Connected!', 'Registering username...');
    
    const registerMessage = {
      type: 'register',
      username: username
    };
    console.log('Sending registration message:', registerMessage);
    ws.send(JSON.stringify(registerMessage));

    // Start ping interval
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendPing();
      }
    }, 30000);
  };

  ws.onmessage = (event) => {
    console.log('=== RECEIVED MESSAGE ===');
    console.log('Raw data:', event.data);
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
    updateConnectionStatus('Connection Failed', `Error connecting to ${serverIP}`);
    
    // Keep message controls disabled during connection failure
    disableMessageControls('connectionFailedRetrying');
    
    // Try connecting to localhost if connection fails
    if (serverIP !== 'localhost') {
      console.log('Retrying with localhost...');
      setTimeout(() => connectToServer(username, 'localhost'), 2000);
    } else {
      console.log('Connection to localhost failed, showing manual setup...');
      updateConnectionStatus('Connection Failed', 'Unable to connect to server. Please check if the server is running.');
      // Show username setup after connection failure
      setTimeout(() => {
        console.log('Showing manual username setup...');
        connectionScreen.classList.add('hidden');
        mainApp.classList.remove('hidden');
        userSetup.classList.remove('hidden');
        userList.classList.add('hidden');
        disableMessageControls('notConnectedRegister');
      }, 3000);
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

    if (message.type === 'encrypted') {
      console.log('Decrypting message...');
      const decrypted = crypto.AES.decrypt(message.content, 'secret-key').toString(crypto.enc.Utf8);
      const parsedData = JSON.parse(decrypted);
      console.log('Decrypted data:', parsedData);
      handleDecryptedMessage(parsedData);
    } else if (message.type === 'registration_success') {
      console.log('Registration successful!', message);
      handleRegistrationSuccess(message);
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
    name: username
  };

  // Add current user to userMap
  userMap.set(currentUser.id, currentUser.name);

  usernameDisplay.textContent = `(${currentUser.name})`;
  
  // Hide connection screen and show main app
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
  
  // Hide connection screen and show main app for retry
  connectionScreen.classList.add('hidden');
  mainApp.classList.remove('hidden');
  userSetup.classList.remove('hidden');
  
  // Keep message controls disabled until successful connection
  disableMessageControls('connectionLostReconnecting');
  
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

// Send encrypted message
function sendEncryptedMessage(data) {
  const encrypted = crypto.AES.encrypt(JSON.stringify(data), 'secret-key').toString();
  const packet = {
    type: 'encrypted',
    content: encrypted
  };

  ws.send(JSON.stringify(packet));
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
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        attachedFiles.splice(index, 1);
        updateFilePreview();
      });
      previewItem.appendChild(removeBtn);

      filePreview.appendChild(previewItem);
    });
  } else {
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

    const saveBtn = document.createElement('button');
    saveBtn.textContent = languages[currentLanguage].saveVideo;
    saveBtn.addEventListener('click', () => saveFile(data.filename, data.fileData));
    messageElement.appendChild(saveBtn);
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
  if (newUsername && newUsername !== currentUser.name) {
    const changeData = {
      type: 'change_username',
      newUsername: newUsername
    };
    sendEncryptedMessage(changeData);
    closeUsernameModal();
  } else {
    closeUsernameModal();
  }
}

// Handle username changed notification
function handleUsernameChanged(data) {
  if (data.userId === currentUser.id) {
    // Update own username
    currentUser.name = data.newUsername;
    usernameDisplay.textContent = `(${currentUser.name})`;
  }
  // User list will be updated via user_list message
}

// Handle username change error
function handleUsernameChangeError(data) {
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