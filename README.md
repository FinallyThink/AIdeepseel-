# 澜鲸 · Live Studio

基于 Electron、React 和 JavaScript 的 Windows AI 虚拟主播工作台。管理端配置直播互动、角色与语音；展示端显示人物、字幕并播放声音，可由直播伴侣采集窗口和桌面音频。

## 功能

- 抖音 / B站弹幕采集、AI 选评与回复、礼物及关注优先处理。
- 双窗口展示，支持人物、背景、字幕与布局设置。
- DeepSeek 回复、Windows 系统语音、可选本地 GPU 音色。
- 本地长期记忆、已播对话档案、增量摘要与手工知识笔记。
- 网易云点歌、音乐队列与音量控制。
- 本机 HTTP API：朗读台词、按要求生成发言、根据游戏场景解说。

## 环境要求

- Windows、Node.js 22 或更新版本、npm。
- 直播采集需要可用的 Python 3 环境；在设置中填写本机 Python 可执行文件路径，默认路径属于开发机器，其他电脑需要修改。
- 在线 AI 回复需要在工作台配置 DeepSeek 密钥；离线演练可检查界面和队列。
- GPU 音色依赖额外模型和运行时，仓库不包含这些大型资源；没有模型时请选择 Windows 系统语音。

## 安装与启动

```powershell
git clone --recurse-submodules https://github.com/FinallyThink/agent-.git
cd agent-
npm install
npm start
```

已克隆但缺少采集器时，执行 `git submodule update --init --recursive`。

也可双击 `start-studio.cmd` 启动；`start-dev.cmd` 启动开发模式；`open-manager.cmd` 恢复管理窗口。

首次使用：在参数设置中配置 AI 密钥、语音、平台、数字房间号和 Python 路径，保存并连接采集器。打开展示窗口，点击“开始互动”，再由直播伴侣采集展示窗口与音频。

## 弹幕与礼物采集

当前使用 [cyber-xiaoya-danmaku](https://github.com/cyber-xiaoya/cyber-xiaoya-danmaku) 适配器。B站直接连接弹幕服务；抖音使用本机 `douyinLive` 服务（默认端口 1089）。首次安装抖音服务：

```powershell
powershell -ExecutionPolicy Bypass -File tools/install-douyin-service.ps1
```

根据服务说明配置 `tools/cyber-xiaoya-danmaku/bin/config.yaml`，可使用 `configure-douyin-cookie.cmd` 设置本机 Cookie。请勿上传 Cookie、密钥或个人配置。

当前主程序未接入直接读取直播伴侣事件的链路。旧版 DouyinBarrageGrab、8888/8827 代理与伴侣启动脚本属于历史方案。真实礼物接收仍需开播联调，连接成功不等于礼物链路验证通过。详见 [采集说明](docs/COLLECTOR.md)。

## 本机语音与场景 API

工作台启动后监听 `127.0.0.1:17861`，仅支持本机程序调用。POST 使用 JSON；开启互动并保持展示端开启后生成和播放。返回 `202` 表示已入队，不代表已经播放。

| 接口 | 用途 | 请求示例 |
| --- | --- | --- |
| `GET /health` | 查询运行和展示端状态 | 无请求体 |
| `POST /api/speak` | 直接朗读 | `{"mode":"say","text":"大家晚上好！"}` |
| `POST /api/speak` | AI 按要求发言 | `{"mode":"reply","text":"聊聊今天的游戏冒险"}` |
| `POST /api/scene` | AI 根据游戏状态解说 | 见下方 |

### 游戏场景解说

外部脚本读取游戏状态后提交：

```powershell
$body = @{
  game = '宝可梦'
  scene = '进入常青森林，队伍血量偏低，刚遇到野生皮卡丘'
  instruction = '轻松解说两句，给出下一步建议'
} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:17861/api/scene' `
  -Method Post -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($body))
```

`scene` 必填，最多 2000 字符；`game` 可选，最多 100 字符；`instruction` 可选，最多 500 字符。建议每 15–30 秒或场景变化时提交。新场景替换尚未开始准备的旧场景，已开始生成或播放的任务继续完成。接口不自动截图或读取游戏画面。

完整参数、返回值和错误码见 [工作台使用说明](docs/STUDIO.md#游戏场景解说-api)。

## 开发与验证

```powershell
npm run dev
npm test
npm run build
```

`npm run smoke` 会打开隔离测试窗口并真实播放系统语音，请在非正式直播时运行。真实弹幕、礼物、AI 服务和直播音频仍需分别联调。

主要目录：`electron/` 主进程及互动队列，`renderer/` 界面，`scripts/` 启动及采集适配脚本，`test/` 自动测试，`docs/` 操作文档。

## 更多文档

- [工作台操作与 API](docs/STUDIO.md)
- [统一采集器](docs/COLLECTOR.md)
- [长期记忆](docs/MEMORY.md)
- [音乐与点歌](docs/MUSIC.md)
- [系统架构](docs/ARCHITECTURE.md)
- [历史命令行桥接器](docs/legacy-bridge.md)

## 本地数据与第三方资源

用户配置、加密密钥和队列存于 Electron 用户数据目录，`memory/` 保存本地记忆。运行日志、构建产物、依赖和个人数据不应上传。

第三方采集器和人物素材遵循各自许可证与使用条款，素材说明见 `public/dsh-pet/LICENSE`。GPU 语音模型及运行时不随仓库提供，可通过 `LANJING_TTS_ROOT` 指定资源根目录，所需目录结构见工作台文档。
