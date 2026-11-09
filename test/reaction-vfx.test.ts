import assert from 'node:assert/strict';
import { it } from 'node:test';
const modulePath='../public/js/board/reactions.js';
const backdropPath='../public/js/board/godotBackdrop.js';
it('les réactions atteignent la cible exacte quelle que soit la distance', async()=>{
 const {reactionFlight}=await import(modulePath);
 for(const kind of ['tomato','flower']) for(const [a,b] of [[{x:0,y:20},{x:1200,y:800}],[{x:300,y:700},{x:300,y:700}]]){
  const frames=reactionFlight(a,b,kind);
  assert.equal(frames[0].x,a.x);assert.equal(frames[0].y,a.y);
  assert.ok(Math.abs(frames.at(-1).x-b.x)<1e-8);assert.equal(frames.at(-1).y,b.y);
  assert.ok(frames.every((p:any)=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  assert.ok(frames[Math.floor(frames.length/2)].y<(a.y+b.y)/2);
 }
});
it('le décor suit les valeurs du cycle existant sans changer les phases serveur',async()=>{
 const {backdropPhase}=await import(backdropPath);
 assert.equal(backdropPhase({night:0}),0);
 assert.equal(backdropPhase({night:.25}),.52);
 assert.equal(backdropPhase({night:.86}),1);
 assert.equal(backdropPhase({night:-4}),0);
 assert.equal(backdropPhase({night:8}),1);
});
