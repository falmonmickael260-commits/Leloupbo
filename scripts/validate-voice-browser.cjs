// Validation facultative avec Playwright et microphone synthétique. Voir docs/REFONTE-VALIDATION.md.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'); const assert = require('assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 const contexts=[]; const pages=[]; const errors=[];
 try {
 for(let i=0;i<4;i++){
  const ctx=await browser.newContext({permissions:['microphone']}); contexts.push(ctx);
  const p=await ctx.newPage(); pages.push(p); p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.TEST_URL || 'http://localhost:3107'); await p.waitForFunction(()=>window.blackops?.client.status==='connected');
 }
 const code=await pages[0].evaluate(async()=> (await window.blackops.client.create('Voix A')).code);
 for(let i=1;i<3;i++)await pages[i].evaluate(async({code,i})=>window.blackops.client.join(code,'Voix '+i),{code,i});
 await pages[3].evaluate(()=>window.blackops.client.create('Autre salon'));
 for(let i=0;i<3;i++)await pages[i].waitForFunction(()=>window.blackops.voice.state().connected===2,{},{timeout:25000});
 await pages[0].waitForFunction(async()=>Object.values(await window.blackops.voice.stats()).every(s=>s.sentBytes>0&&s.receivedBytes>0),{},{timeout:15000});
 const transport=await pages[0].evaluate(()=>window.blackops.voice.stats());
 assert.equal(await pages[3].evaluate(()=>window.blackops.voice.state().peers),0);
 await pages[0].evaluate(()=>window.blackops.voice.setSelfMute(true));
 assert.equal(await pages[0].evaluate(()=>window.blackops.voice.state().sending),false);
 await pages[0].evaluate(()=>window.blackops.voice.setSelfMute(false));
 await contexts[1].setOffline(true);
 await pages[1].evaluate(()=>window.blackops.client.socket.io.engine.close());
 await pages[1].waitForFunction(()=>window.blackops.client.stale===true,{},{timeout:35000});
 assert.equal(await pages[1].evaluate(()=>window.blackops.voice.state().sending),false);
 await contexts[1].setOffline(false);
 await pages[1].waitForFunction(()=>!window.blackops.client.stale&&window.blackops.voice.state().connected===2,{},{timeout:35000});
 assert.equal(await pages[1].evaluate(()=>window.blackops.voice.state().sending),true);
 assert.deepEqual(errors,[]);
 fs.writeFileSync('/tmp/meute-mesh-results.json',JSON.stringify({participants:3,isolatedRoom:true,bidirectionalRtp:transport,mute:true,offlineClosed:true,reconnected:true,errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
