// 用 Chromium 渲染 SVG → 多尺寸 PNG → 打包成 .ico
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 256, 512];
const svg = fs.readFileSync(path.join(__dirname, 'icon-source.svg'), 'utf8');
const html =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>' +
  '</head><body>' + svg + '</body></html>';
const tmpHtml = path.join(__dirname, '.icon-tmp.html');
fs.writeFileSync(tmpHtml, html);

app.disableHardwareAcceleration();

async function renderAll() {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  try {
    await win.loadFile(tmpHtml);
    await new Promise((r) => setTimeout(r, 400));
    const big = await win.webContents.capturePage();
    const frames = SIZES.map((size) => ({
      size,
      data: big.resize({ width: size, height: size }).toPNG(),
    }));
    return frames;
  } finally {
    win.destroy();
  }
}

function buildIco(frames) {
  const count = frames.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const chunks = [header];
  for (const f of frames) {
    const e = Buffer.alloc(16);
    e.writeUInt8(f.size >= 256 ? 0 : f.size, 0);
    e.writeUInt8(f.size >= 256 ? 0 : f.size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(f.data.length, 8);
    e.writeUInt32LE(offset, 12);
    chunks.push(e);
    offset += f.data.length;
  }
  for (const f of frames) chunks.push(f.data);
  return Buffer.concat(chunks);
}

app.whenReady().then(async () => {
  try {
    const frames = await renderAll();
    console.log('captured 512px, resized to ' + frames.map((f) => f.size).join(','));
    fs.writeFileSync(
      path.join(__dirname, 'build', 'icon-512.png'),
      frames.find((f) => f.size === 512).data
    );
    const ico = buildIco(frames);
    fs.writeFileSync(path.join(__dirname, 'build', 'icon.ico'), ico);
    console.log('ICON_OK sizes=' + frames.map((f) => f.size).join(','));
    console.log('ICO_BYTES=' + ico.length);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
