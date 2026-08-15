// 生成启动页截图（离屏渲染），供 README 使用
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'docs', 'screenshot.png');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      frame: false,
      backgroundColor: '#0d0d0d',
      webPreferences: { offscreen: true, backgroundThrottling: false },
    });
    await win.loadFile(path.join(__dirname, 'fallback.html'));
    await new Promise((r) => setTimeout(r, 700));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(OUT, img.toPNG());
    console.log('SCREENSHOT_OK=' + OUT);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
