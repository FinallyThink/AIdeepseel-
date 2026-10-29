"""Studio adapter for cyber-xiaoya-danmaku (see tools/.../LICENSE)."""
import json
import sys
import threading
import contextlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'cyber-xiaoya-danmaku'))
from bilibili_client import BilibiliClient

lock = threading.Lock()
def output(data):
    with lock:
        print(json.dumps(data, ensure_ascii=True), flush=True)

class Client(BilibiliClient):
    def _dispatch(self, cmd, data):
        if cmd == 'LIKE_INFO_V3_CLICK':
            d = data.get('data') or {}
            if d.get('uname'):
                self.emit({'platform':'bilibili','type':'Like','data':{'name':d['uname'],'uid':str(d.get('uid') or ''),'count':int(d.get('like_count') or 1)}})
            return
        super()._dispatch(cmd, data)
    def _gift_tick(self, d):
        d = dict(d)
        if d.get('coin_type') != 'gold':
            d['price'] = 0
        super()._gift_tick(d)
    def _flush_key(self, key, force=False):
        with self._agg_lock:
            ent = self._agg.pop(key, None)
        if ent:
            self.emit({'platform':'bilibili','type':'Gift','data':{'name':ent['name'],'item':ent['item'],'num':ent['num'],'price_yuan':ent['price_zi']*ent['num']/1000}})
    def _log(self, msg, **flags):
        if flags.get('green') and '\u9274\u6743\u6210\u529f' in msg:
            output({'status': 'connected'})
        elif flags.get('err') or flags.get('yellow'):
            output({'status': 'connecting', 'error': str(msg)})
    def _log_dim(self, msg):
        pass

room = sys.argv[1]
platform = sys.argv[2] if len(sys.argv)>2 else 'bilibili'
if platform == 'bilibili':
    client = Client(room, lambda event: output({'event': event, 'room': room}))
    client.start()
    client.join()
else:
    import subprocess
    import douyin_client
    import logutil
    protocol = sys.stdout
    def output(data):
        with lock:
            protocol.write(json.dumps(data, ensure_ascii=True)+'\n')
            protocol.flush()
    def log(platform, msg, **flags):
        if flags.get('green') and '弹幕流已连接' in msg:
            output({'status':'connected'})
        elif flags.get('err') or flags.get('yellow'):
            output({'status':'connecting','error':str(msg)})
    logutil.platform_log = log
    exe = douyin_client.ROOT/'bin/douyinLive.exe'
    if not exe.exists():
        output({'status':'disconnected','error':'缺少统一采集依赖 douyinLive.exe，请运行 tools/install-douyin-service.ps1'})
        sys.exit(1)
    with contextlib.redirect_stdout(sys.stderr):
        service = douyin_client.ensure_service('http://127.0.0.1:1089')
        client = douyin_client.DouyinClient(room, lambda e: output({'event':e,'room':room}), {'stall_restart_sec':0})
        try:
            client.start()
            client.join()
        finally:
            if service:
                service.terminate()
