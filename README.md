# Kazumi-web

基于开源项目 [Predidit/Kazumi](https://github.com/Predidit/Kazumi)（v2.4.6）完整移植的 **Render 云端可部署 Web 版番剧聚合播放器**。采用 **Python FastAPI + 双引擎解析器（静态极速提取 + 按需 Playwright 嗅探）+ Material 3 Expressive 全分辨率自适应前端**，专为 **Render Free Tier（512 MB RAM / Docker / `$PORT`）** 深度优化。

---

## 核心特性（完整还原 Kazumi v2.4.6）

- **全分辨率 Material 3 Expressive 响应式界面**
  - 完整适配超小屏手机（320px）、移动竖屏/横屏、平板、笔记本、桌面宽屏与 2K/4K 超宽屏。
  - 桌面端自动展示左侧 `NavigationRail` 与 Bento 仪表盘，移动端自动切换为底部 `NavigationBar`；设置中心采用响应式 Master-Detail 双栏布局。
  - 内置 **9 套官方 Kazumi Material 3 主题配色**（默认绿/青/蓝/靛蓝/紫罗兰/粉红/黄/橙/深橙）+ 浅色/深色/跟随系统 + **OLED 纯黑深色增强**。
- **Bangumi 全量番剧发现与管理**
  - **推荐页**：热门趋势 + 全部 **15 个官方题材标签** + 无限滚动 + 回到顶部悬浮钮。
  - **新番时间表**：周一至周日胶囊切换、**20 年历史季度回溯**、按评分/排名排序及「仅看已追番」过滤。
  - **6 态追番库**：全部/在看/想看/搁置/看过/抛弃，支持网格/列表切换、搜索、排序与 **Bangumi Access Token 双向同步**（拉取收藏、直接提交 1~10 分评价与短评）。
  - **多模式搜索**：Bangumi 高级筛选（标签/年份/星期/最低分/排序）、**规则直搜**（不经 Bangumi 直接向全部视频源站检索），以及 **trace.moe 以图搜番**（拖拽/上传/Ctrl+V 粘贴截图/图片 URL）。
  - **详情页**：高斯模糊背景、**1~10 分评分分布直方图**、5 标签（概览/吐槽/角色/关联/制作人员）、角色详情档案弹窗、自定义检索别名管理、多规则并发选源与反爬验证码会话。
- **Kazumi v9 规则引擎 & 可视化开发工具**
  - 100% 兼容 `Predidit/KazumiRules`（XPath 规则、API JSONPath 嵌套/分隔符规则、POST 搜索、反反爬虫验证码、HLS 广告切片过滤）。
  - 内置官方规则仓库（支持 GitHub 多镜像及离线内置快照）、推荐规则一键安装、规则优先级排序、**`kazumi://` 分享链接编解码**。
  - 内置 **可视化规则编辑器**（基本/搜索/选集/高级反爬 4 分区 + Raw JSON 模式）与 **在线规则测试器**（逐级诊断搜索 → 选集 → 视频流解析）。
- **定制化视频播放器与 Canvas 弹幕引擎**
  - 后端内置 **HLS M3U8 重写 + 广告剔除 + 防盗链 Referer/UA 注入 + MP4 Range 断点续传反向代理**。
  - 全套自定义 M3 控制栏：进度条悬浮预览、跳过片头（默认 +80s）、0.25x–3.0x 10 档倍速、5 种画面比例、**Anime4K 风格 Web SVG 实时画质锐化**、视频截图导出 PNG、外部播放器（PotPlayer / IINA / VLC / 复制直链）、定时休眠、画中画（PiP）、网页全屏与原生全屏。
  - 支持 **全部 18 项自定义键盘快捷键**（含**长按右方向键临时 2.0x 倍速**）及移动端手势（双击快进/快退/暂停、长按 2x、左右滑动进度、上下滑动亮度与音量）。
  - 完整 **Canvas 弹幕引擎**：支持弹弹play 自动匹配、3 步手动换源、**本地 B 站 XML 弹幕导入**、实时本地发送、时间轴偏移微调、重复弹幕合并、关键词与 `/正则/` 屏蔽词过滤、滚动/顶部/底部/彩色独立开关。
- **Render 免费层零数据丢失架构**
  - 针对 Render Free Tier 闲置 15 分钟休眠后临时磁盘重置的问题，内置 **浏览器 `localStorage` + 容器启动自动回填（Hydration）** 混合持久化机制；并额外提供 **WebDAV 云同步**（服务端直连无跨域限制）与 **JSON 完整导入/导出**。
  - 支持可选 `ACCESS_PASSWORD` 私密访问口令保护（HMAC-SHA256 HttpOnly Cookie），公网部署更安心。

---

## 一键部署到 Render

### 方式一：Render Blueprint（推荐）

1. 将本仓库导入或连接至你的 [Render](https://render.com/) 账号。
2. 在 Render 控制台点击 **New + → Blueprint**，选择 **`Simoon1218/Kazumi-web`**。
3. Render 会自动识别根目录的 [`render.yaml`](./render.yaml) 和 [`Dockerfile`](./Dockerfile)，使用 Docker 环境构建并自动配置健康检查（`/healthz`）。
4. （可选但推荐）在 Render 环境变量中设置 `ACCESS_PASSWORD` 开启私人访问口令，以及 `DANDANAPI_APPID` / `DANDANAPI_KEY` 启用弹弹play 弹幕接口。
5. 等待 Docker 构建完成即可直接打开分配的 `https://xxx.onrender.com` 地址访问！

### 环境变量说明

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8333` | 监听端口（Render 会自动注入） |
| `ACCESS_PASSWORD` | 空 | 可选：设置后访问站点需先输入口令解锁 |
| `AUTH_SECRET` | 自动随机 | 可选：Cookie 签名密钥（建议设置固定随机串以免重启需重登） |
| `AUTO_INSTALL_RULES` | `recommended` | 首次启动自动预装规则：`recommended`（8 条推荐规则）/ `all` / `none` |
| `PLAYWRIGHT_ENABLED` | `true` | 是否允许在静态解析失败时按需启动 Playwright 无头 Chromium |
| `PLAYWRIGHT_IDLE_SECONDS` | `45` | Playwright 闲置自动回收秒数，确保 512 MB 内存稳定运行 |
| `RESOLVE_TIMEOUT_SECONDS` | `25` | 单集视频流解析超时时间（秒） |
| `DANDANAPI_APPID` | 空 | 可选：弹弹play 开放平台 AppId（也可在设置页填自建弹幕代理或导入 XML） |
| `DANDANAPI_KEY` | 空 | 可选：弹弹play 开放平台 AppSecret |
| `DANDAN_API_DOMAIN` | `https://api.dandanplay.net` | 可选：自定义弹幕 API 域名 |
| `KAZUMI_PROXY` | 空 | 可选：出站 HTTP/SOCKS5 代理地址 |
| `DATA_DIR` | `/data/runtime` | 运行时 JSON 存储目录（若挂载 Render Disk 可改为挂载路径） |

---

## 本地或 Docker 运行

### 使用 Docker

```bash
docker build -t kazumi-web .
docker run -d --name kazumi-web -p 8333:8333 \
  -e ACCESS_PASSWORD=your_password \
  -v kazumi_data:/data/runtime \
  kazumi-web
```

浏览器访问 `http://localhost:8333`。

### 使用 Python 直接运行

```bash
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --host 0.0.0.0 --port 8333
```

---

## 播放器默认快捷键

| 功能 | 默认按键 | 功能 | 默认按键 |
| --- | --- | --- | --- |
| 播放 / 暂停 | `Space` | 全屏 / 网页全屏 | `F` / `W` |
| 快进 5s（长按 2x 倍速） | `→` | 弹幕开关 | `D` |
| 快退 5s | `←` | 视频截图 | `S` |
| 上一集 / 下一集 | `P` / `N` | 跳过片头 (+80s) | `K` |
| 音量增 / 减 / 静音 | `↑` / `↓` / `M` | 倍速 1x / 2x / 3x / ±0.25x | `1` / `2` / `3` / `Z` / `X` |

所有快捷键均可在「设置 → 快捷键设置」中自由重绑定。

---

## 开源许可与致谢

- 本项目遵循 **GNU General Public License v3.0 (GPL-3.0)** 开源协议，详见 [`LICENSE`](./LICENSE)。
- 致谢原项目 **[Predidit/Kazumi](https://github.com/Predidit/Kazumi)** 与规则库 **[Predidit/KazumiRules](https://github.com/Predidit/KazumiRules)**。
- 番剧元数据来自 [Bangumi 番组计划](https://bgm.tv/)，弹幕接口适配 [弹弹play](https://www.dandanplay.com/)，以图搜番由 [trace.moe](https://trace.moe/) 提供支持。
- 本项目仅作为聚合检索与播放器工具，不提供或托管任何视频资源。
