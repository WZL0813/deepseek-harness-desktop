// 渲染进程桥接：把主进程的 IPC 暴露成 window.dsh
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dsh', {
  getServerUrl: () => ipcRenderer.invoke('dsh:get-server-url'),
  setServerUrl: (url) => ipcRenderer.invoke('dsh:set-server-url', url),
  openExternal: (url) => ipcRenderer.invoke('dsh:open-external', url),
  installHarness: () => ipcRenderer.invoke('dsh:install-harness'),
  onInstallStatus: (cb) => {
    ipcRenderer.on('dsh:install-status', (_e, data) => cb(data));
  },
});
