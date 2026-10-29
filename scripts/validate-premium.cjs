// Validation des VFX et de l’audio sur un serveur de test, avec médias synthétiques.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('assert/strict');const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},permissions:['microphone']});
 const page=await ctx.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let failOnce=true;await page.route('**/assets/sfx/fusil.mp3',route=>{if(failOnce){failOnce=false;return route.abort();}return route.continue();});
 try{
 await page.goto(process.env.TEST_URL || 'http://localhost:3107');await page.waitForFunction(()=>window.blackops?.client.status==='connected');
 await page.evaluate(async()=>{const s=await import('/js/sfx.js');s.unlock();await s.preloadRecorded();});
 await page.waitForTimeout(3200);
 const recorded=await page.evaluate(async()=>{
  const s=await import('/js/sfx.js');await s.preloadRecorded();
  const c=window.__blackopsAudio;let synthetic=0;const osc=c.createOscillator.bind(c);c.createOscillator=(...args)=>{synthetic++;return osc(...args);};
  s.gunshot();c.createOscillator=osc;return synthetic===0;
 });assert.ok(recorded,'recorded rifle loaded after simulated network error');
 await page.evaluate(async()=>{const c=window.blackops.client;await c.create('Immersion');for(let i=0;i<17;i++)await c.addBot();await c.updateSettings({roles:{werewolf:3,hunter:1},durationPreset:'fast',captainEnabled:false});});
 await page.evaluate(()=>{window.blackops.client.socket.disconnect();window.blackops.voice.stop();});
 await page.waitForTimeout(300);
 await page.evaluate(()=>{const b=window.blackops.board;b.setSky('night',false);b.specters.appear(0);});
 await page.waitForTimeout(4000);await page.screenshot({path:'/tmp/meute-premium-night.png'});
 const spectral=await page.evaluate(()=>({count:document.querySelectorAll('.village-specter').length,assets:[...document.querySelectorAll('.village-specter img')].every(i=>i.complete&&i.naturalWidth>0)}));
 assert.ok(spectral.count>0&&spectral.assets);
 // Controlled presentation previews, without changing authoritative game state.
 await page.evaluate(()=>{const b=window.blackops.board;b.update({...b.lastView,status:'running'}, {...b.lastUI,aiming:b.lastView.me.id});document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.querySelector('#screen-game').classList.add('active');});
 const ids=await page.evaluate(()=>window.blackops.client.view.players.map(p=>p.id));
 const sync=await page.evaluate(async(ids)=>{
  const b=window.blackops.board;const events=[];const on=e=>events.push({kind:e.detail,time:performance.now(),flash:!!document.querySelector('[data-vfx="muzzle"]')});
  b.addEventListener('sfx',on);await b.hunterShot(ids[0],ids[1]);b.removeEventListener('sfx',on);return events;
 },ids);
 const gunEvents=sync.filter(e=>e.kind==='rack'||e.kind==='shot');
 assert.equal(gunEvents[0].kind,'rack');assert.equal(gunEvents[1].kind,'shot');assert.equal(gunEvents[1].flash,true);
 await page.evaluate((id)=>window.blackops.board.effects.eliminate(window.blackops.board.center(id),'vote'),ids[1]);
 await page.waitForTimeout(180);await page.screenshot({path:'/tmp/meute-premium-verdict.png'});
 await page.evaluate(async()=>{const j=await import('/js/juice.js');j.setReducedMotion(true);window.blackops.board.setSky('night',false);});
 assert.equal(await page.locator('.village-specter').count(),0);
 await page.evaluate(async()=>{const j=await import('/js/juice.js');j.setReducedMotion(false);});
 // Real menu sliders persist while leaving outgoing permissions untouched.
 await page.locator('#btn-menu').click();
 await page.locator('#menu [data-audio-level="voice"]').fill('30');await page.locator('#menu [data-audio-level="voice"]').dispatchEvent('input');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('blackops:audioMix')).voice),.3);
 await page.screenshot({path:'/tmp/meute-premium-mixer.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'/tmp/meute-premium-mobile.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>window.blackops.board.effects.clear());await page.waitForTimeout(2300);
 assert.equal(await page.locator('[data-vfx]').count(),0);
 assert.deepEqual(errors,[]);
 fs.writeFileSync('/tmp/meute-premium-browser.json',JSON.stringify({recordedRifleAfterRetry:recorded,spectral,shotSynchronized:true,reducedMotionClearsSpecters:true,volumePersists:true,mobileOverflow:false,vfxCleaned:true,errors},null,2));
 }finally{await page.evaluate(async()=>{const c=window.blackops.client;c.socket.connect();await new Promise(r=>c.socket.connected?r():c.socket.once('connect',r));await c.resume();await c.leave();}).catch(()=>{});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
