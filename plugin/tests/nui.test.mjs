import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import { Bridge } from '../src/bridge.mjs';
const code = await readFile(new URL('../../resources/ks_streamdeck/html/bridge.js', import.meta.url), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { for(let i=0;i<200;i++){if(predicate())return;await pause(5);}throw new Error('condition timeout'); }

test('real NUI bridge pairs, forwards only fresh commands, acknowledges failures and disconnects', async t => {
  const bridge = await new Bridge({ port: 0 }).start(); t.after(() => bridge.close());
  const listeners = {}, calls = [], notices = [];
  let active = null, block = null;
  const server = { id: 'localhost:30120', label: 'NUI Test' };
  const catalog = [{id:'test:wave',label:'Winken',category:'Gesten'}];
  const dispatch = msg => listeners.message({ data: msg });
  t.after(() => dispatch({type:'suspend'}));
  const update = () => dispatch({type:'snapshot',data:{catalog,active,blocked:block}});
  class LocalSocket extends WebSocket { constructor(url){super(url,{origin:'https://cfx-nui-ks_streamdeck'});} }
  vm.runInNewContext(code, {
    window:{addEventListener:(name,fn)=>listeners[name]=fn}, WebSocket:LocalSocket, crypto:crypto.webcrypto, Date, JSON, Number, Math, Set,
    setTimeout, clearTimeout, AbortSignal, GetParentResourceName:()=> 'ks_streamdeck',
    fetch:async (url,options) => {
      const name=url.split('/').at(-1), data=JSON.parse(options.body); calls.push({name,data});
      let result={ok:true};
      if(name==='notice')notices.push(data.message);
      if(name==='connection' && data.connected) queueMicrotask(update);
      if(name==='execute') { active=data.command==='stop'?null:data.animation; result={ok:true}; queueMicrotask(update); }
      return {json:async()=>result};
    },
  });
  dispatch({type:'config',enabled:true,port:bridge.port,server,resource:'ks_streamdeck'});
  const pairing=bridge.beginPairing().pairing;
  dispatch({type:'pair',code:pairing.code});
  await until(()=>bridge.view().connected);
  assert.equal((await bridge.execute({serverId:server.id,command:'play',animation:'test:wave'})).ok,true);
  await until(()=>bridge.view().snapshot.active==='test:wave');
  assert.ok(calls.find(call=>call.name==='execute').data.remainingMs<=3500);
  const before=calls.filter(call=>call.name==='execute').length;
  bridge.session.socket.send(JSON.stringify({type:'execute',sessionId:bridge.session.id,id:'expired',command:'play',animation:'test:wave',expiresAt:Date.now()-1}));
  await pause(30);
  assert.equal(calls.filter(call=>call.name==='execute').length,before,'expired action never reaches Lua');
  assert.equal((await bridge.execute({serverId:server.id,command:'stop'})).ok,true);
  dispatch({type:'disconnect'}); await until(()=>bridge.session===null);
  assert.ok(calls.some(call=>call.name==='connection' && !call.data.connected));
});
