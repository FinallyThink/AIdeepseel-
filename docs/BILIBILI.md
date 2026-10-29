# B站直播接入

运行 start-studio.cmd，在参数设置中选择“哔哩哔哩 B站”，填写数字房间号，确认采集器 Python 路径，保存后在首页点击“连接采集器”。配置 AI 密钥和语音后，关闭离线演练并点击“开始互动”。dsh-pet 在“角色模型”中选择。

采集模块来自 https://github.com/cyber-xiaoya/cyber-xiaoya-danmaku ，源码保存在 tools/cyber-xiaoya-danmaku，保留原 LICENSE 和 NOTICE（AGPL-3.0）。本项目通过 scripts/bilibili-collector.py 调用其 BilibiliClient，主进程管理子进程，断开或退出时停止。连接成功状态以服务端鉴权成功为准；网络断开由上游模块重连。

Python 需要 3.10 或以上，B站模块使用标准库，无需启动上游 reader.py、语音桥或托盘。默认路径使用当前机器已有的 Python，换机器时在设置中修改。

当前使用游客连接，平台风控、登录要求或直播间离线时可能无法接收；错误显示在首页。2026-10-29 已在房间 1950881229 验证游客鉴权、真实文字弹幕及进场事件接收，并确认文字弹幕进入 Pipeline 候选队列。本轮未调用 AI 或播放语音，未观测到礼物，不代表完整播报链路已验证。不自动读浏览器 Cookie。

弹幕、礼物、进场、关注、舰长和 SC 进入原有队列。SC 作为弹幕处理，舰长作为礼物处理。上游部分事件未提供稳定用户 ID，适配器不把昵称伪装成 ID，因此这些观众无法使用要求稳定 ID 的点歌资格功能；礼物金额不换算成抖音钻石。

人工修改展示：renderer/Display.jsx 管理舞台布局及播放，renderer/Character.jsx 管理立绘与透明视频，renderer/Brand.jsx 管理标志，renderer/style.css 管理样式。三种 dsh-pet 动画位于 public/dsh-pet，保留原许可。

模型管理现已包含 dsh-pet 全部 106 个动作，可搜索、预览，并为待机/思考/播报分别指定动作。动作目录在 renderer/dsh-actions.json，视频在 public/dsh-pet/action-*.webm；动作映射保存到 petIdleAction、petThinkAction、petSpeakAction。
