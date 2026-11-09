import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';
import { once } from 'node:events';
import { Bridge } from '../src/bridge.mjs';
const root=new URL('../',import.meta.url);
const browser=await chromium.launch({headless:true});
const errors=[];
const output=process.env.KS_SCREENSHOTS || '/tmp/ks-streamdeck-review'; await mkdir(output,{recursive:true});
const host=new WebSocketServer({host:'127.0.0.1',port:0}); await once(host,'listening');
const bridge=await new Bridge({port:0}).start();
try {
  const page=await browser.newPage({viewport:{width:360,height:820}});
  page.setDefaultTimeout(5000);
  page.on('console',message=>{if(message.type()==='error') console.log('Browser:',message.text());});
  page.on('pageerror',err=>errors.push(err.message));
  await page.route('https://inspector.test/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
    const type=name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'text/html';
    await route.fulfill({contentType:type,body:await readFile(new URL(`com.kyuubisoft.fivem.sdPlugin/ui/${name}`,root))});
  });
  let pi, saved, connectRequest;
  const catalog=Array.from({length:180},(_,i)=>({id:`ks:test_${i}`,label:i===0?'Arme verschränken':i===1?'Winken':`Animation ${i}`,category:i<2?'Gesten':'Tanzen',keywords:i===1?'wave':''}));
  let view={type:'status',connected:false,server:null,snapshot:null,pairing:null};
  const deliver=()=>pi.send(JSON.stringify({event:'sendToPropertyInspector',payload:view}));
  host.on('connection',ws=>{
    pi=ws;
    ws.on('message',raw=>{const msg=JSON.parse(raw);if(msg.event==='sendToPlugin'){
      if(msg.payload.type==='pair')view={...view,pairing:{code:'482193',expiresAt:Date.now()+90000}};
      if(msg.payload.type==='connect')connectRequest=msg.payload.candidateId;
      if(msg.payload.type==='disconnect')view={type:'status',connected:false,server:null,snapshot:null,pairing:null};
      deliver();
    }if(msg.event==='setSettings')saved=msg.payload;});
  });
  await page.goto(new URL('com.kyuubisoft.fivem.sdPlugin/ui/index.html',root).href);
  await page.evaluate(port=>window.connectElgatoStreamDeckSocket(port,'key-1','registerPropertyInspector','{}',JSON.stringify({action:'com.kyuubisoft.fivem.animation',context:'key-1',payload:{settings:{}}})),host.address().port);
  assert.equal(await page.getByRole('button',{name:'Verbinden',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('#pair-code').isVisible(),false,'no code required by default');
  await page.locator('summary').click();
  await page.getByRole('button',{name:'Kopplungscode erzeugen'}).click();
  await page.getByText('streamdeck 482193',{exact:true}).waitFor();
  await page.screenshot({path:`${output}/pairing.png`,fullPage:true});
  await page.getByRole('button',{name:'Trennen',exact:true}).click();
  await page.locator('summary').click();
  view={type:'status',connected:false,server:null,snapshot:null,pairing:null,candidates:[
    {id:'first',server:{id:'127.0.0.1:30120',label:'KyuubiSoft'}},
    {id:'second',server:{id:'second:30120',label:'Anderer Server'}}]};deliver();
  await page.locator('#session-choice').waitFor();
  assert.equal(await page.getByRole('button',{name:'Verbinden',exact:true}).isDisabled(),true,'multiple sessions need selection');
  await page.locator('#session').selectOption('first');
  await page.getByRole('button',{name:'Verbinden',exact:true}).click();
  for(let i=0;i<100&&!connectRequest;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(connectRequest,'first');
  await page.screenshot({path:`${output}/connect.png`,fullPage:true});
  view={type:'status',connected:true,server:{id:'127.0.0.1:30120',label:'KyuubiSoft'},snapshot:{catalog,active:null,blocked:null},pairing:null};deliver();
  await page.getByRole('heading',{name:'KyuubiSoft'}).waitFor();
  await page.locator('#search').fill('wave');
  assert.equal(await page.locator('#animation option').count(),2,'search includes tags');
  await page.locator('#animation').selectOption('ks:test_1');
  await page.getByRole('button',{name:'Als Favorit speichern'}).click();
  await page.locator('#search').fill('');
  await page.getByRole('button',{name:'Nur Favoriten'}).click();
  assert.equal(await page.locator('#animation option').count(),2);
  assert.equal(saved.animation,'ks:test_1');assert.equal(saved.serverId,'127.0.0.1:30120');assert.deepEqual(saved.favorites,['ks:test_1']);
  await page.screenshot({path:`${output}/configured.png`,fullPage:true});
  for(const width of [280,320,360,480]) {
    await page.setViewportSize({width,height:820});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no horizontal clipping at ${width}`);
  }
  view={...view,server:{id:'other:30120',label:'Anderer Server'}};deliver();
  await page.getByRole('button',{name:'Diesem Server zuordnen'}).waitFor();
  assert.equal(await page.locator('#animation').isDisabled(),true);
  await page.getByRole('button',{name:'Diesem Server zuordnen'}).click();
  assert.equal(saved.serverId,'other:30120');assert.equal(saved.animation,'');
  await page.locator('#command').selectOption('stop');
  assert.equal(await page.locator('#animation-fields').isVisible(),false);

  // Use the unmodified NUI bridge in a real Chromium secure context. This checks
  // WebSocket/CSP transport, but does not claim to test FiveM's customized CEF.
  const nui=await browser.newPage(); nui.on('pageerror',err=>errors.push(err.message));
  // Modern desktop Chromium prompts for LAN access; explicit browser permission,
  // not a security-disabling launch flag. FiveM CEF acceptance remains separate.
  await nui.context().grantPermissions(['local-network-access'], {origin:'https://cfx-nui-ks_streamdeck'});
  nui.on('console',message=>{if(message.type()==='error')console.log('NUI:',message.text());});
  const nuiRoot=new URL('../../resources/ks_streamdeck/html/',import.meta.url);
  let active=null;
  await nui.addInitScript(()=>window.GetParentResourceName=()=> 'ks_streamdeck');
  await nui.route('https://cfx-nui-ks_streamdeck/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
    await route.fulfill({contentType:name.endsWith('.js')?'application/javascript':'text/html',body:await readFile(new URL(name,nuiRoot))});
  });
  const calls=[];
  await nui.route('https://ks_streamdeck/**',async route=>{
    const name=new URL(route.request().url()).pathname.slice(1);
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'}});return;}
    const data=route.request().postDataJSON(); calls.push({name,data});
    if(name==='execute')active=data.command==='stop'?null:data.animation;
    await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:true})});
    if(name==='ready')await nui.evaluate(data=>window.postMessage(data,'*'),{type:'config',resource:'ks_streamdeck',port:bridge.port,enabled:true,server:{id:'browser:30120',label:'Browser test'}});
    if((name==='connection'&&data.connected)||name==='execute')await nui.evaluate(data=>window.postMessage(data,'*'),{type:'snapshot',data:{catalog,active,blocked:null}});
  });
  await nui.goto('https://cfx-nui-ks_streamdeck/index.html');
  await nui.evaluate(data=>window.postMessage(data,'*'),{type:'config',resource:'ks_streamdeck',port:bridge.port,enabled:true,server:{id:'browser:30120',label:'Browser test'}});
  for(let i=0;i<100&&!bridge.view().candidates.length;i++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(bridge.view().connected,false,'discovery alone grants no access');
  bridge.connectCandidate(bridge.view().candidates[0]?.id);
  for(let i=0;i<100&&!bridge.view().connected;i++)await new Promise(resolve=>setTimeout(resolve,25));
  if(!bridge.view().connected)console.log('NUI calls:',calls.map(call=>call.name), 'JS errors:',errors);
  assert.equal(bridge.view().connected,true,'secure browser NUI connects to loopback WebSocket');
  assert.equal((await bridge.execute({serverId:'browser:30120',command:'play',animation:'ks:test_1'})).ok,true);
  assert.ok(calls.some(call=>call.name==='execute'));
  const pairedSession=bridge.session.id, previousSocket=bridge.session.socket;
  await nui.reload();
  for(let i=0;i<100&&(!bridge.view().connected||bridge.session.socket===previousSocket);i++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(bridge.view().connected,true,'NUI reload reconnects automatically');
  assert.notEqual(bridge.session.socket,previousSocket,'reload opens a fresh transport');
  assert.equal(bridge.session.id,pairedSession,'reload keeps the existing pairing');
  assert.equal((await bridge.execute({serverId:'browser:30120',command:'stop'})).ok,true,'commands work after reload');
  assert.deepEqual(errors,[]);
  console.log('Browser QA passed: one-click connection/session selection, manual fallback, search/favorites/server binding, 4 widths, real HTTPS NUI discovery/transport and reload recovery.');
} finally {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.unrouteAll({behavior:'wait'});
  await browser.close();host.clients.forEach(ws=>ws.terminate());await new Promise(resolve=>host.close(resolve));await bridge.close();
}
