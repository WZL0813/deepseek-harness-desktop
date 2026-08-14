// DeepSeek Harness 桌面壳
// 自带浏览器引擎（Electron），不依赖系统浏览器。
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'http://127.0.0.1:3080';
const PROBE_INTERVAL = 2000;

let win = null;
let serverUrl = DEFAULT_URL;
let probeTimer = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const data = JSON.parse(raw);
    if (data && typeof data.serverUrl === 'string' && /^https?:\/\/\S+$/.test(data.serverUrl)) {
      serverUrl = data.serverUrl;
    }
  } catch {
    // 首次运行或文件损坏：用默认地址
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify({ serverUrl }, null, 2));
  } catch {
    // 写不进去就算了，不影响本次连接
  }
}

function stopProbing() {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
}

function startProbing() {
  stopProbing();
  probe();
}

function probe() {
  if (!win) return;
  fetch(serverUrl, { method: 'GET' })
    .then((res) => {
      if (win && res.ok) {
        win.loadURL(serverUrl);
      } else {
        probeTimer = setTimeout(probe, PROBE_INTERVAL);
      }
    })
    .catch(() => {
      probeTimer = setTimeout(probe, PROBE_INTERVAL);
    });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#0d0d0d',
    title: 'DeepSeek Harness',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 先显示本地启动页，探测到服务后再载入界面
  win.loadFile(path.join(__dirname, 'fallback.html'));
  startProbing();

  win.on('closed', () => {
    win = null;
    stopProbing();
  });
}

// 启动页通过 window.dsh 调用
ipcMain.handle('dsh:get-server-url', () => serverUrl);

ipcMain.handle('dsh:set-server-url', (_event, url) => {
  if (typeof url !== 'string') return { ok: false };
  const trimmed = url.trim();
  if (!/^https?:\/\/\S+$/.test(trimmed)) return { ok: false };
  serverUrl = trimmed.replace(/\/+$/, ''); // 去掉尾部斜杠
  saveSettings();
  startProbing();
  return { ok: true, url: serverUrl };
});

ipcMain.handle('dsh:open-external', (_event, url) => {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\/\S+$/.test(url)) return false;
  shell.openExternal(url);
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    loadSettings();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
