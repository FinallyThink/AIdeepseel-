const { spawn } = require('node:child_process');
const path=require('node:path');const appRoot=path.resolve(__dirname,'..');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const child = spawn(require('electron'), [appRoot, ...process.argv.slice(2)], { cwd:appRoot, env, stdio: 'inherit', windowsHide: false });
child.on('error', e => { console.error(e); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill());
