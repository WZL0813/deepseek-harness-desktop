# DeepSeek Harness 桌面壳

白鲸小窗。DeepSeek Harness 的自包含桌面版，一个独立 exe，不依赖系统浏览器。

## 这是什么

- 单文件 exe，内置 Chromium（Electron 43），**不装浏览器也能跑**
- 白底黑鲸圆角图标，黑白灰启动页
- 启动页支持**自定义连接地址**，默认连 `http://127.0.0.1:3080`
- 地址会记住，下次启动直接连

## 怎么用

1. 先启动 DeepSeek Harness 服务（默认端口 3080）
2. 双击 exe，等它自动连上
3. 连不上？点启动页的「自定义连接地址」改 IP
4. 关于页有 GitHub 链接，点开直达本仓库

## 开发

```bash
npm install
npm start        # 本地跑
npm run dist     # 打包便携版 exe（dist/DeepSeek-Harness.exe）
```

> 国内网络：GitHub 拉不到 Electron 时，装依赖前先设镜像
> ```bash
> $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
> ```

## 结构

| 文件 | 干啥的 |
|---|---|
| `main.js` | 主进程：探测服务、动态地址、IPC |
| `preload.js` | 渲染桥接，暴露 `window.dsh` |
| `fallback.html` | 启动页（黑白灰 + 自定义地址 + 关于） |
| `make-icon.js` | SVG → 多尺寸 ICO 的渲染脚本 |
| `icon-source.svg` | 鲸鱼图标源文件 |

## 许可

MIT
