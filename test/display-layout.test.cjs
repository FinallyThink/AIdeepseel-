const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,defaults}=require('../electron/settings.cjs');
test('display layout supports independent visibility and bounds all components to the canvas',()=>{
  const layout=JSON.parse(defaults.displayLayout);
  layout.model.visible=false;layout.chat.x=20;layout.chat.width=40;
  assert.doesNotThrow(()=>validate({displayLayout:JSON.stringify(layout)}));
  layout.chat.x=90;
  assert.throws(()=>validate({displayLayout:JSON.stringify(layout)}));
  layout.chat.x=20;layout.chat.width=0;
  assert.throws(()=>validate({displayLayout:JSON.stringify(layout)}));
  assert.throws(()=>validate({displayLayout:'null'}));
  assert.throws(()=>validate({displayLayout:'{}'}));
});
