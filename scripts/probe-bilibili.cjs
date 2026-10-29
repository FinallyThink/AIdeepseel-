// Read-only live probe: no LLM requests, speech or outbound chat messages.
const {Collector}=require('../electron/collector.cjs');
const {defaults}=require('../electron/settings.cjs');
const {Pipeline}=require('../electron/pipeline.cjs');
const room=process.argv[2];
if(!/^\d+$/.test(room||'')){console.error('Usage: node scripts/probe-bilibili.cjs <room> [seconds]');process.exit(1);}
const collector=new Collector();let connected=false;const counts={};let last='';
const pipeline=new Pipeline({settings:{config:{...defaults,roomId:room,livePlatform:'bilibili',simulation:false}},ai:{},speech:{}});
collector.on('state',s=>{const key=s.status+':'+s.error;if(key!==last){console.log(JSON.stringify({status:s.status,error:s.error}));last=key;}if(s.status==='connected')connected=true;});
collector.on('event',e=>{counts[e.kind]=(counts[e.kind]||0)+1;const accepted=pipeline.ingest(e);console.log(JSON.stringify({kind:e.kind,room:e.room,count:e.count,contentLength:e.content?.length||0,accepted,candidates:pipeline.candidates.length,jobs:pipeline.jobs.length}));});
collector.connectBilibili(room,process.env.COLLECTOR_PYTHON||defaults.collectorPython);
setTimeout(()=>{collector.disconnect();console.log(JSON.stringify({connected,counts}));process.exitCode=connected?0:2;},Math.min(120,Math.max(5,Number(process.argv[3])||45))*1000);
