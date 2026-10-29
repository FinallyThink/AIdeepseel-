# 实机联调日志 · 2026-10-27 21:40–22:15

记录本次把「离线演练 → 实机直播」跑通过程中的现象、证据与改动，便于下次对照。

## 一、结论速览

| 现象 | 真因 | 状态 |
| --- | --- | --- |
| 采集器显示已连接，但房间下拉一直空 | 采集器 `pushFilter` 只推 1(弹幕)/5(礼物)，房间是在收到消息后才被记下来的 | 已改为 `1,3,5,6` |
| 直播伴侣在跑却抓不到弹幕 | 伴侣未带 `--proxy-server=http://127.0.0.1:8827` 启动；代理隧道数为 0 | 已修好启动脚本（自动识别版本目录） |
| 下拉里没有真实房间 | 伴侣版本升级后旧脚本路径失效（13.2.1 → 13.2.2），脚本直接退出 | 已修 |
| 发了弹幕，回复面板没反应 | 发消息的是**主播自己的账号**，`normalize` 按 `User.IsAnchor` 丢弃 | 需换非主播号测试 |
| 同上 | 互动未开始（按钮仍是「开始互动」），候选池不会被 AI 选评 | 点「开始互动」 |

## 二、时间线（实测证据）

| 时间 | 现象 | 判定依据 |
| --- | --- | --- |
| 21:45–21:50 | 伴侣重启后仍抓不到弹幕 | 8827 上 `Established=0`；伴侣主进程直连 `113.96.128.30:443` 等抖音 CDN |
| 21:52 | 走代理成功 | 8827 上 30+ 条隧道 |
| 21:55 | 放宽推送类型 | `pushFilter: 1,5 → 1,3,5,6` |
| 21:57:05 | 采集器重启，新配置生效 | 新 PID，8888/8827 均在听 |
| 21:57:50 | 第一条真实弹幕到达 | `Type=1 "测试"`，`RoomId=7701346382745340722`，`WebRoomId=36110590377`，房间标题 “Zero project正在直播” |
| 22:01:2x | 弹幕“回复一下啊”到达采集器，程序未落库 | 抓包有、`queue.json` 无写入 |
| 22:08:58 | 加探针后重启程序 | `open generation=2` → `socket open generation=2` |
| 22:09:38 | 主播自己发的消息被丢弃 | 探针：`raw ... "IsAnchor":true ...` → `normalized null` |
| 22:11:28 | 观众（非主播）弹幕被正常接收 | 探针：`IsAnchor:false` → `normalized chat 7701346382745340722` → `ingest accepted` |
| 22:11:28 | `queue.json` 的 `seen` 从 15 变 16 | 程序确实入库了 |
| 22:12 | 回复队列仍为 0 | 按钮仍是「开始互动」，且候选只保留 60 秒 |

## 三、三个根因

1. **主播自己的消息被丢弃**（设计如此，避免 AI 回复自己）
   `src/bridge.js` 第 18 行：`if (!d || typeof d !== 'object' || d.User?.IsAnchor) return null;`
   所以用开播账号发弹幕/礼物自测，一定是“采集器收到了、程序没反应”。

2. **房间只能靠消息发现**
   `electron/collector.cjs` 第 19 行：只有包里带 `RoomId` 才会记录房间；
   采集器默认只推类型 1、5，房间安静时下拉会一直为空。

3. **伴侣升级导致代理启动脚本失效**
   `start-companion-capture.cmd` 里写死 `E:\webcast_mate\13.2.1.525908160`，实际已是 `13.2.2.535286071`。

## 四、本次改动

| 文件 | 改动 |
| --- | --- |
| `tools/DouyinBarrageGrab-v2.8.0/WssBarrageServer.exe.config` | `pushFilter: 1,5 → 1,3,5,6`（进场/统计也带 RoomId，不必等弹幕就能发现房间） |
| `start-companion-capture.cmd` | 改为调用 `scripts/start-companion-capture.ps1` |
| `scripts/start-companion-capture.ps1` | 新增：自动挑选 `E:\webcast_mate` 下最新的 `直播伴侣.exe`；伴侣在运行则拒绝启动；8827 未监听时告警；支持 `-DryRun` 自检 |
| `electron/main.cjs` | 已选过直播间时，启动即自动连接采集器（采集器晚起也会每 5 秒重连）；临时探针 `dbg` |
| `electron/collector.cjs` | 临时探针：连接、每条原始消息、解析结果、入库结果写入日志 |
| `renderer/main.jsx`、`renderer/style.css` | 回复队列页在“有消息但未开始互动”时显示提示条；行内文案改为“互动未开始 · 点右上角「开始互动」” |

## 五、日志文件位置

| 文件 | 内容 |
| --- | --- |
| `artifacts/collector-debug.log` | 程序侧逐条：连接、原始报文、`normalized`、`ingest accepted/dropped` |
| `artifacts/queue-watch.log` | `queue.json` 的每次写入（jobs / seen 变化） |
| `artifacts/studio.stdout.log`、`studio.stderr.log` | 程序启动时的标准输出/错误 |
| `tools/collector.stdout.log` | 采集器早期一次重定向运行的日志（当前实例在控制台窗口里，不落盘） |

## 六、正确的实机自测步骤

1. 采集器先起（`start-collector.cmd`，UAC）→ 8888/8827 监听。
2. 正常退出伴侣 → `start-companion-capture.cmd` → 重新开播。
3. `start-studio.cmd` → 关掉离线演练 → 程序会自动连采集器。
4. 下拉选真实房间（收到过该房间任意消息后才会出现）。
5. 点 **「开始互动」**。
6. **用非主播账号**（小号/朋友）发弹幕或送礼物：
   - 弹幕 → 候选池 → 每 8 秒 AI 选一条入队（候选只保留 60 秒）；
   - 礼物 → 直接入队，礼物必回。
7. 展示端全屏，伴侣采集「澜鲸 · 直播展示」+ 系统声音。

## 七、待办

- [ ] 确认实机跑通后，删除 `electron/collector.cjs`、`electron/main.cjs` 里的临时探针 `dbg`。
- [ ] 可选：实时弹幕里把被忽略的主播消息显示出来（标注「主播 · 已忽略回复」），避免再次误判。
