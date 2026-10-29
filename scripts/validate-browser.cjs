// Validation facultative avec Playwright et microphone synthétique. Voir docs/REFONTE-VALIDATION.md.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined), headless: true,
   args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
 const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['microphone'] });
 const page = await context.newPage();
 const errors = []; const failed = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
 await page.goto(process.env.TEST_URL || 'http://localhost:3107');
 await page.waitForFunction(() => window.blackops?.client.status === 'connected');
 await page.screenshot({ path: '/tmp/meute-home.png' });
 await page.locator('.mic-preflight summary').click();
 await page.locator('#mic-preflight button').click();
 await page.waitForFunction(() => document.querySelector('#mic-preflight button').textContent.includes('Arrêter'));
 await page.locator('#mic-preflight button').click();
 await page.evaluate(async () => {
  const c = window.blackops.client;
  await c.create('Audit');
  for (let i=0;i<17;i++) await c.addBot();
  await c.updateSettings({ roles: { werewolf: 3, seer: 1, witch: 1, hunter: 1, cupid: 1, salvateur: 1, white_wolf: 1, thief: 1 }, captainEnabled: true, durationPreset: 'fast' });
  await c.request('lobby:avatar', { avatar: 'v-forgeron' });
 });
 await page.waitForFunction(() => document.querySelectorAll('#avatar-grid .illustrated').length === 20);
 await page.waitForTimeout(1000);
 await page.screenshot({ path: '/tmp/meute-lobby.png', fullPage: true });
 // Contact sheet: actual generated assets, for visual review only.
 const sheet = await context.newPage();
 await sheet.goto(process.env.TEST_URL || 'http://localhost:3107');
 await sheet.evaluate(async () => {
  const { VILLAGERS } = await import('/js/art/villagers.js');
  document.body.innerHTML = '<main style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;padding:20px;background:#171a22">'+VILLAGERS.map(c => `<div style="text-align:center;color:#eee0c4;font:14px sans-serif"><img src="${c.image}" style="width:200px;height:280px;object-fit:contain"><p>${c.name}</p></div>`).join('')+'</main>';
  document.body.style.overflow='auto';
 });
 await sheet.setViewportSize({width:1440,height:1600});
 await sheet.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
 await sheet.waitForTimeout(500); await sheet.screenshot({ path: '/tmp/meute-characters.png', fullPage: true }); await sheet.close();
 await page.evaluate(() => window.blackops.client.start());
 await page.waitForFunction(() => window.blackops.client.view.status === 'running');
 await page.waitForFunction(()=>document.querySelector('#card-layer').childElementCount===0,{},{timeout:25000});
 await page.waitForTimeout(1000);
 await page.screenshot({ path: '/tmp/meute-board-desktop.png' });
 const desktop = await page.evaluate(() => ({ players: document.querySelectorAll('.pion').length,
   overflow: document.documentElement.scrollWidth > innerWidth,
   assets: [...document.querySelectorAll('.figure image')].map(i => i.getAttribute('href')) }));
 await page.setViewportSize({ width:390,height:844 }); await page.waitForTimeout(1000);
 await page.screenshot({ path:'/tmp/meute-board-mobile.png' });
 const mobile = await page.evaluate(() => ({overflow:document.documentElement.scrollWidth > innerWidth,
   phase:document.querySelector('#phase').getBoundingClientRect().toJSON()}));
 fs.writeFileSync('/tmp/meute-browser-results.json',JSON.stringify({errors,failed,desktop,mobile},null,2));
 await browser.close();
 if(errors.length || failed.length || desktop.players!==18 || desktop.overflow || mobile.overflow) process.exitCode=1;
})().catch(e=>{ console.error(e); process.exitCode=1; });
