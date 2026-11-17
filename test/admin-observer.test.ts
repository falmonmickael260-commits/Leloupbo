import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createApp} from '../src/server/app.ts';
import {MemoryGameStore} from '../src/server/store.ts';
test('spectateur public : pas de rôle secret, jeton, place ou mutation',async()=>{
  const prior=process.env.PLATFORM_SHARED_SECRET;process.env.PLATFORM_SHARED_SECRET='local-observer-test-key';
  const app=createApp(new MemoryGameStore());
  try{
    const {room}=app.manager.createGame('Alice',null,randomUUID());
    const before=JSON.stringify(room.engine.state);
    await new Promise<void>(resolve=>app.http.listen(0,'127.0.0.1',resolve));
    const address=app.http.address();if(!address||typeof address==='string')throw Error('port manquant');
    const raw=JSON.stringify({v:1,game:'la-meute',operation:'snapshot',actor:randomUUID(),access:randomUUID(),room:room.code,instance:`${room.code}:${room.engine.state.createdAt}`});
    const stamp=String(Math.floor(Date.now()/1000));const signature=`${stamp}.${createHmac('sha256',process.env.PLATFORM_SHARED_SECRET!).update(`rg-admin-observer-v1.${stamp}.${raw}`).digest('hex')}`;
    const response=await fetch(`http://127.0.0.1:${address.port}/api/platform/observer`,{method:'POST',headers:{'content-type':'application/json','x-rg-signature':signature},body:raw});
    assert.equal(response.status,200);const data=await response.json();assert.equal(data.publicState.players.length,1);
    for(const key of ['role','tokenHash','platformUserId','loverId','infected'])assert.equal(key in data.publicState.players[0],false);
    for(const key of ['ballot','privateMessages','nightLog','roles','composition'])assert.equal(key in data.publicState,false);
    assert.equal(JSON.stringify(room.engine.state),before);
  }finally{app.manager.stop();app.io.close();await new Promise<void>(resolve=>app.http.close(()=>resolve()));if(prior===undefined)delete process.env.PLATFORM_SHARED_SECRET;else process.env.PLATFORM_SHARED_SECRET=prior;}
});
