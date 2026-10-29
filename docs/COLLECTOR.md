# 统一采集器

抖音和 B站统一使用 cyber-xiaoya-danmaku。在参数设置选择平台、填写数字房间号、保存并连接即可。旧 8888 WebSocket 采集方式停用，加载旧配置时忽略 collectorUrl。

B站直接连接平台弹幕服务。抖音调用同仓库的 douyin_client.py，自动启动配套 douyinLive 服务（本机 1089），不再使用 DouyinBarrageGrab 或 HTTPS 证书方案。

首次安装抖音依赖运行 tools/install-douyin-service.ps1。抖音 Cookie 等配置在 tools/cyber-xiaoya-danmaku/bin/config.yaml，按照 douyinLive 官方说明设置。不要把 Cookie 发到聊天中。

断开时结束本次启动的进程树，已有独立运行的服务不归本程序停止。礼物未提供人民币价值时不估算白饭数。

历史 legacy-bridge.md、LIVE-TROUBLESHOOT.md 和 tools/COLLECTOR-SETUP.md 中的旧采集方式不再适用于新版。
