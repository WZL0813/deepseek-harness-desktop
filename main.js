// DeepSeek Harness 桌面壳
// 自带浏览器引擎（Electron），不依赖系统浏览器。
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_URL = 'http://127.0.0.1:3080';
const PROBE_INTERVAL = 2000;
const REPO_URL = 'https://github.com/deepseek-ai/deepseek-harness.git';
const SERVICE_DIR = process.env.DSH_SERVICE_DIR || path.join(os.homedir(), 'dsh-service', 'deepseek-harness');
const INSTALL_CACHE = path.join(SERVICE_DIR, '.install-cache');
const SERVICE_LOG = path.join(SERVICE_DIR, 'dsh-web.log');
const SIM_INSTALL = process.env.DSH_SIM_INSTALL === '1';

let win = null;
let serverUrl = DEFAULT_URL;
let probeTimer = null;
let installing = false;

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

// ---------- 一键安装 ----------

function sendInstallStatus(msg, percent) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('dsh:install-status', { msg, percent });
  }
}

function checkCmd(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      windowsHide: true,
    });
    let out = '';
    const onData = (d) => {
      const s = d.toString();
      out += s;
      if (opts.onData) opts.onData(s);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} 退出码 ${code}，尾巴：${out.slice(-300)}`));
    });
  });
}

async function resolvePnpm() {
  // 优先系统 pnpm，其次 corepack，最后 npx 兜底
  if (await checkCmd('pnpm', ['--version'])) return { cmd: 'pnpm', prefix: [] };
  if (await checkCmd('corepack', ['--version'])) {
    try {
      await run('corepack', ['prepare', 'pnpm@11.7.0', '--activate']);
    } catch {
      // corepack 失败就 npx 兜底
    }
    if (await checkCmd('pnpm', ['--version'])) return { cmd: 'pnpm', prefix: [] };
  }
  return { cmd: 'npx', prefix: ['--yes', 'pnpm@11.7.0'] };
}

function startService(pnpm) {
  const logFd = fs.openSync(SERVICE_LOG, 'a');
  const child = spawn(pnpm.cmd, [...pnpm.prefix, 'dsh', 'web'], {
    cwd: SERVICE_DIR,
    env: { ...process.env, npm_config_cache: path.join(INSTALL_CACHE, 'npm') },
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });
  child.unref();
}

function waitForServer(url, timeoutMs, onTick) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      fetch(url, { method: 'GET' })
        .then((res) => {
          if (res.ok) return resolve(true);
          retry();
        })
        .catch(() => retry());
      function retry() {
        if (Date.now() - start > timeoutMs) return resolve(false);
        if (onTick) onTick((Date.now() - start) / timeoutMs);
        setTimeout(tick, 2000);
      }
    };
    tick();
  });
}

async function installHarness() {
  // 开发自测用的模拟流程：DSH_SIM_INSTALL=1
  if (SIM_INSTALL) {
    const steps = [
      ['检查环境…', 3],
      ['拉取 DeepSeek Harness 源码…', 12],
      ['安装依赖（首次要几分钟）…', 35],
      ['构建前端与插件包…', 65],
      ['启动服务…', 82],
      ['等待服务就绪…', 93],
      ['服务已就绪，正在连接…', 100],
    ];
    for (const [msg, p] of steps) {
      sendInstallStatus(msg, p);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (win && !win.isDestroyed()) win.loadURL(DEFAULT_URL);
    return { ok: true };
  }

  // 1. 环境检查
  sendInstallStatus('检查环境…', 2);
  const [hasGit, hasNode] = await Promise.all([
    checkCmd('git', ['--version']),
    checkCmd('node', ['--version']),
  ]);
  if (!hasGit || !hasNode) {
    const missing = [];
    if (!hasGit) missing.push('git');
    if (!hasNode) missing.push('Node.js');
    const msg = '缺少 ' + missing.join('、') + '，装好后再点一次';
    sendInstallStatus(msg, 100);
    return { ok: false, msg };
  }

  // 2. 克隆源码
  if (!fs.existsSync(path.join(SERVICE_DIR, 'package.json'))) {
    sendInstallStatus('拉取 DeepSeek Harness 源码…', 10);
    fs.mkdirSync(path.dirname(SERVICE_DIR), { recursive: true });
    await run('git', ['clone', '--depth', '1', '--single-branch', REPO_URL, SERVICE_DIR]);
  } else {
    sendInstallStatus('源码已存在，跳过拉取', 12);
  }

  // 3. 装依赖（缓存重定向到服务目录，不占 C 盘）
  fs.mkdirSync(INSTALL_CACHE, { recursive: true });
  const pnpm = await resolvePnpm();
  sendInstallStatus('安装依赖（首次要几分钟）…', 30);
  await run(pnpm.cmd, [...pnpm.prefix, 'install', '--store-dir', path.join(INSTALL_CACHE, 'pnpm-store')], {
    cwd: SERVICE_DIR,
    env: { npm_config_cache: path.join(INSTALL_CACHE, 'npm') },
  });

  // 4. 构建
  sendInstallStatus('构建前端与插件包…', 60);
  await run(pnpm.cmd, [...pnpm.prefix, 'run', 'build'], {
    cwd: SERVICE_DIR,
    env: { npm_config_cache: path.join(INSTALL_CACHE, 'npm') },
  });

  // 5. 启动服务（后台进程，日志写文件）
  sendInstallStatus('启动服务…', 85);
  startService(pnpm);

  // 6. 等它起来（装的是本地服务，固定探测 3080）
  const ok = await waitForServer(DEFAULT_URL, 180000, (t) => {
    sendInstallStatus('等待服务就绪…', 86 + Math.round(t * 0.13));
  });
  if (!ok) {
    const msg = '服务没起来，日志在 ' + SERVICE_LOG;
    sendInstallStatus(msg, 100);
    return { ok: false, msg };
  }
  serverUrl = DEFAULT_URL;
  saveSettings();
  sendInstallStatus('服务已就绪，正在连接…', 100);
  if (win && !win.isDestroyed()) win.loadURL(serverUrl);
  return { ok: true };
}

// ---------- IPC ----------

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

ipcMain.handle('dsh:install-harness', async () => {
  if (installing) return { ok: false, msg: '正在安装中，别急' };
  installing = true;
  try {
    return await installHarness();
  } catch (err) {
    const msg = '安装失败：' + err.message;
    sendInstallStatus(msg, 100);
    return { ok: false, msg };
  } finally {
    installing = false;
  }
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
