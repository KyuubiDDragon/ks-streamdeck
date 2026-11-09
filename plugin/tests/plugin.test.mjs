import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<400;i++){const value=fn();if(value)return value;await pause(10);}throw new Error('SDK integration timeout');}

test('packaged SDK entrypoint registers, configures a button and receives actual game status', async t=>{
  const host=new WebSocketServer({host:'127.0.0.1',port:0}); await once(host,'listening');
  const messages=[]; let sd;
  host.on('connection',ws=>{sd=ws;ws.on('message',raw=>messages.push(JSON.parse(raw)));});
  const info={application:{language:'de',platform:'windows',platformVersion:'10',version:'7.1.0'},
    plugin:{uuid:'com.kyuubisoft.fivem',version:'1.0.0.0'},devicePixelRatio:1,colors:{},
    devices:[{id:'device',name:'Stream Deck',type:0,size:{columns:5,rows:3}}]};
  const child=spawn(process.execPath,['bin/plugin.js','-port',String(host.address().port),'-pluginUUID','plugin-test',
    '-registerEvent','registerPlugin','-info',JSON.stringify(info)],{cwd:process.env.KS_PLUGIN_DIR || fileURLToPath(new URL('../com.kyuubisoft.fivem.sdPlugin/',import.meta.url)),stdio:'pipe'});
  let errors=''; child.stderr.on('data',data=>errors+=data);
  t.after(async()=>{child.kill('SIGTERM');if(child.exitCode===null)await once(child,'exit');host.clients.forEach(ws=>ws.terminate());await new Promise(resolve=>host.close(resolve));});
  await until(()=>messages.find(msg=>msg.event==='registerPlugin'));
  const event=(type,payload={})=>sd.send(JSON.stringify({event:type,action:'com.kyuubisoft.fivem.animation',context:'key-1',device:'device',payload}));
  event('willAppear',{controller:'Keypad',coordinates:{column:0,row:0},settings:{}});
  await until(()=>messages.find(msg=>msg.event==='setTitle'&&msg.payload.title==='Nicht\nverbunden'));
  event('propertyInspectorDidAppear');
  const game=new WebSocket('ws://127.0.0.1:39175/v1/fivem',{origin:'https://cfx-nui-ks_streamdeck'});
  t.after(()=>game.terminate()); const gameMessages=[]; game.on('message',raw=>gameMessages.push(JSON.parse(raw))); await once(game,'open');
  const server={id:'test:30120',label:'Test Server'};
  game.send(JSON.stringify({type:'discover',protocol:1,server,clientId:'sdk-game'}));
  const status=await until(()=>messages.find(msg=>msg.event==='sendToPropertyInspector'&&msg.payload.candidates?.length));
  assert.equal(status.payload.connected,false);
  event('sendToPlugin',{type:'connect',candidateId:status.payload.candidates[0].id});
  const welcome=await until(()=>gameMessages.find(msg=>msg.type==='welcome'));
  const catalog=[{id:'builtin:wave',label:'Winken',category:'Gesten',keywords:''}];
  const snapshot=active=>game.send(JSON.stringify({type:'snapshot',sessionId:welcome.sessionId,catalog,active,blocked:null}));
  snapshot(null);
  event('didReceiveSettings',{controller:'Keypad',settings:{serverId:server.id,animation:'builtin:wave',command:'toggle'}});
  await until(()=>messages.find(msg=>msg.event==='setTitle'&&msg.payload.title==='Winken'));
  event('keyDown',{controller:'Keypad',settings:{serverId:server.id,animation:'builtin:wave',command:'toggle'},state:0,isInMultiAction:false});
  const request=await until(()=>gameMessages.find(msg=>msg.type==='execute'));
  assert.equal(request.animation,'builtin:wave');
  snapshot('builtin:wave');
  game.send(JSON.stringify({type:'ack',sessionId:welcome.sessionId,id:request.id,ok:true}));
  await until(()=>messages.find(msg=>msg.event==='setImage'&&decodeURIComponent(msg.payload.image).includes('stroke-width="5"')));
  assert.equal(errors,''); assert.equal(child.exitCode,null);
});
