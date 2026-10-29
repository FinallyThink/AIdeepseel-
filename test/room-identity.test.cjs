const{test}=require('node:test');const assert=require('node:assert/strict');
const{stableRoom}=require('../electron/room-identity.cjs');
test('old session identity migrates only with unambiguous channel evidence',()=>{
 assert.equal(stableRoom('session',[{event:{room:'session',webRoom:'channel'}}]),'channel');
 assert.equal(stableRoom('session',[{room:'other',webRoom:'channel'}]),'session');
 assert.equal(stableRoom('session',[{room:'session',webRoom:'a'},{room:'session',webRoom:'b'}]),'session');
 assert.equal(stableRoom('demo',[{room:'demo',webRoom:'channel'}]),'demo');
});
