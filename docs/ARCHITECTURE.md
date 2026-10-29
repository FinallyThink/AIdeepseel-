# 主体架构

- electron/main.cjs：窗口、受限 IPC、音频媒体协议、配置、播放确认、演练自检。
- electron/pipeline.cjs：候选与回复队列状态机、礼物优先、5 条普通上限、持久化与恢复。
- electron/ai.cjs：DeepSeek 选评与回复，离线演练分支和礼物保底文案。
- electron/memory.cjs：项目 memory 目录的 Markdown/JSONL 档案、手工笔记、按房间检索及每 20 条增量摘要；只在 completed 事件后归档真实播报。
- electron/music.cjs、electron/netease.cjs：按稳定用户 ID / 房间保存送礼点歌资格，管理请求队列、网易云官方域名搜索和音频地址获取、受限 CDN 流式转发；bindMusic 对歌曲和主播语音做互斥调度。
- renderer/Music.jsx：点歌管理页、展示端歌曲卡片和单独的音频播放控制。
- electron/speech.cjs、electron/native/speech.ps1：Windows WinRT 语音合成到 WAV，不在主进程直接播放。
- electron/gpu-speech.cjs、electron/native/gpu-render.py：共享桌面助手项目的 GPT-SoVITS 模型和 DirectML 运行环境，阳光少女/知心大姐姐按需加载并复用 worker，仅生成 WAV，由展示端播放。
- electron/collector.cjs：本机 WebSocket、重连和房间发现；消息解析复用 src/bridge.js 的 normalize/parsePacket。
- electron/settings.cjs：参数范围校验、原子保存、safeStorage 密钥。
- electron/preload.cjs：暴露有限命令及事件订阅，渲染端不使用 Node。
- renderer/main.jsx：React 工作台、回复队列、参数设置、直播展示与实际 Audio 播放。
- renderer/style.css：工作台与海洋舞台样式、主题、动画。

普通队列包含当前在内的所有未完成普通回复，最大 5。礼物队列不设普通容量上限。调度器优先准备礼物，即使已经预生成了一条普通回复；已在播放的语音不中断。

生成完成的音频只通过注册的 studio-media 协议暴露。main 发出 play 后只标记 offered，不展示回答。展示窗口实际触发 Audio.onplaying 后回传任务 ID，主进程校验发送窗口和当前任务，更新 history/current，再广播给两个窗口。Audio.onended 后删除队列消息与音频。

应用重启恢复时，未开始播放的任务重新合成。状态 offered/playing 的任务无法证明已经被观众完整听到，因此标为失败并请求管理端确认重试；历史按任务 ID 去重。

主进程仅允许管理窗口保存设置/密钥等命令，仅允许展示窗口回传音频事件。renderer 使用 sandbox、contextIsolation、CSP，不允许任意新窗口和网页导航。AI 网络请求仅在主进程，端点固定为 DeepSeek 官方地址。
