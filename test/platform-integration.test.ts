import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { GameManager } from '../src/server/gameManager.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FileGameStore, MemoryGameStore, type GameStore } from '../src/server/store.ts';
import { GameEngine } from '../src/engine/engine.ts';
import { seededRng } from '../src/engine/rng.ts';

const envKeys = ['PLATFORM_SHARED_SECRET', 'PLATFORM_SUPABASE_URL', 'PLATFORM_SUPABASE_SERVICE_ROLE_KEY'] as const;
function environment() {
  const previous = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
  process.env.PLATFORM_SHARED_SECRET = 'integration-test';
  process.env.PLATFORM_SUPABASE_URL = 'https://platform.test';
  process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY = 'server-only';
  const originalFetch = globalThis.fetch;
  return () => {
    globalThis.fetch = originalFetch;
    for (const k of envKeys) if (previous[k] === undefined) delete process.env[k]; else process.env[k] = previous[k];
  };
}
function token(uid: string, exp = Math.floor(Date.now()/1000)+1800) {
  const payload = Buffer.from(JSON.stringify({ uid, username: 'Mickaël', exp })).toString('base64url');
  return `${payload}.${createHmac('sha256', 'integration-test').update(payload).digest('base64url')}`;
}
function harness(store: GameStore = new MemoryGameStore(), clock = () => Date.now()) {
  let connect: (socket: unknown) => void;
  const io = { on(_event: string, callback: typeof connect) { connect = callback; } };
  const manager = new GameManager(io as unknown as ConstructorParameters<typeof GameManager>[0], store,
    { now: clock, sfu: null, housekeepingMs: 60_000 });
  let counter = 0;
  function socket() {
    // Simule le transport uniquement ; les handlers métier réels sont ceux de GameManager.
    const handlers: Record<string, (...args: any[]) => unknown> = {};
    const data: Record<string, unknown> = {};
    const s = { id: `s${counter++}`, data, on(event: string, handler: (...args: any[]) => unknown) { handlers[event] = handler; }, emit() {} };
    connect(s);
    return {
      data,
      async call(event: string, payload: object = {}): Promise<any> {
        let response: unknown;
        await handlers[event](payload, (reply: unknown) => { response = reply; });
        assert.ok(response, `ack manquant : ${event}`);
        return response;
      },
    };
  }
  return { manager, store, socket };
}
async function eventually(condition: () => boolean | Promise<boolean>) {
  for (let i=0;i<200;i++) { if (await condition()) return; await new Promise((r) => setTimeout(r,5)); }
  assert.ok(await condition(), 'traitement non terminé');
}

test('compte signé reconnu, jeton expiré refusé, invité autorisé et session invitée rattachée au compte', async () => {
  const restore = environment(); const h = harness();
  try {
    const signed = h.socket();
    const created = await signed.call('game:create', { name:'Mickaël', rgToken:token('account') });
    assert.equal(created.ok,true);
    const room = h.manager.rooms.get(created.code)!;
    assert.equal(room.engine.state.players[0].platformUserId,'account');
    const rejected = await h.socket().call('game:join', { code:created.code, name:'Expired', rgToken:token('expired',1) });
    assert.equal(rejected.error,'PLATFORM_AUTH');
    assert.equal(room.engine.state.players.length,1);
    const duplicate = await h.socket().call('game:join', { code:created.code, name:'Duplicate', rgToken:token('account') });
    assert.equal(duplicate.error,'ACCOUNT_IN_ROOM');
    assert.equal(room.engine.state.players.length,1);
    const guest = h.socket();
    const session = await guest.call('game:join',{code:created.code,name:'Guest'});
    assert.equal(session.ok,true);
    assert.equal(room.engine.state.players[1].platformUserId,undefined);
    assert.equal(Object.hasOwn(room.engine.view(session.playerId, Date.now()), 'platformJobs'), false);
    const resumed = await guest.call('session:resume',{code:session.code,token:session.token,rgToken:token('upgraded')});
    assert.equal(resumed.ok,true);
    assert.equal(room.engine.state.players[1].platformUserId,'upgraded');
    const afterExpiry = await guest.call('session:resume',{code:session.code,token:session.token,rgToken:token('upgraded',1)});
    assert.equal(afterExpiry.ok,true);
    assert.equal(room.engine.state.players[1].platformUserId,'upgraded');
  } finally { h.manager.stop(); restore(); }
});

test('Chasseur accepté seulement pendant la sélection et dans la composition ; doublon bloqué', async () => {
  const restore = environment(); let now = Date.now(); const h = harness(undefined, () => now);
  try {
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_role_key,'hunter'); assert.equal(body.p_price_coins,100);
      return Response.json([{reservation_id:body.p_reservation_id,new_balance:100}]);
    };
    const sock=h.socket(); const created=await sock.call('game:create',{name:'Buyer',rgToken:token('buyer')});
    const room=h.manager.rooms.get(created.code)!;
    assert.equal((await sock.call('role:buy',{role:'hunter'})).error,'GAME_STARTED');
    for(let i=0;i<3;i++) h.manager.joinGame(created.code,`Guest${i}`);
    room.engine.updateSettings(created.playerId,{autoWolves:false,roles:{werewolf:1,hunter:1}},now);
    assert.equal((await sock.call('game:start')).ok,true);
    assert.equal((await sock.call('role:buy',{role:'witch'})).error,'BAD_ROLE');
    assert.equal((await sock.call('role:buy',{role:'hunter'})).ok,true);
    assert.equal((await sock.call('role:buy',{role:'hunter'})).error,'ALREADY_RESERVED');
    assert.equal(calls,1);
    assert.equal(room.engine.state.players[0].roleReservation?.roleKey,'hunter');
    now+=10_000; room.engine.tick(now);
    assert.equal(room.engine.state.players[0].role,'hunter');
    assert.equal(room.engine.state.platformJobs?.find((j)=>j.kind==='roles')?.kind,'roles');
  } finally { h.manager.stop(); restore(); }
});

test('règlement conservé sur disque après panne, repris après redémarrage avec le même résultat', async () => {
  const restore = environment();
  const directory = await mkdtemp(path.join(tmpdir(), 'meute-platform-'));
  const store = new FileGameStore(directory);
  const e=GameEngine.create('QUEUE',Date.now(),seededRng(42));
  for(let i=0;i<4;i++)e.join(`P${i}`,`token${i}`,Date.now());
  e.state.players[0].platformUserId='buyer';
  const job={id:'roles:1',kind:'roles' as const,roomCode:'QUEUE',reservationIds:['request'],grantedUserIds:['buyer']};
  e.state.platformJobs=[job]; await store.save(e.state);
  let attempts=0; const payloads: unknown[]=[];
  globalThis.fetch=async(_url,init)=> {attempts++;payloads.push(JSON.parse(String(init?.body)));throw new Error('simulated outage');};
  const first=harness(store);
  let second: ReturnType<typeof harness> | undefined;
  try {
    await first.manager.restore();
    await eventually(()=>attempts===1 && !first.manager.rooms.get('QUEUE')!.syncingPlatform);
    assert.equal((await store.loadAll())[0].platformJobs?.length,1);
    first.manager.stop();
    globalThis.fetch=async(_url,init)=>{attempts++;payloads.push(JSON.parse(String(init?.body)));return Response.json(null);};
    second=harness(store);
    await second.manager.restore();
    await eventually(async ()=>(await store.loadAll())[0].platformJobs?.length===0);
    assert.equal(attempts,2); assert.deepEqual(payloads[0],payloads[1]);
  } finally { first.manager.stop();second?.manager.stop();await store.flush();await rm(directory,{recursive:true,force:true});restore(); }
});

test('annulation orpheline reprise au redémarrage et résultats de victoire persistés', async () => {
  const restore=environment();const store=new MemoryGameStore();
  const e=GameEngine.create('ENDED',Date.now(),seededRng(5));
  const p=e.join('Winner','token',Date.now()); p.platformUserId='winner';
  e.state.status='finished';e.state.winner={camp:'village',winnerIds:[p.id],title:'Victoire'};
  e.state.phase={id:'GAME_OVER',seq:10,startedAt:Date.now(),endsAt:null,data:{}};
  e.state.platformJobs=[{id:'cancel:1',kind:'cancel',reservationId:'orphan'}];
  await store.save(e.state);
  const requests: {url:string;body:any}[]=[];
  globalThis.fetch=async(url,init)=>{requests.push({url:String(url),body:JSON.parse(String(init?.body))});return Response.json(null);};
  const h=harness(store);
  try {
    await h.manager.restore();
    await eventually(()=>JSON.parse(store.data.get('ENDED')!).platformJobs.length===0);
    assert.equal(requests.length,2);
    assert.ok(requests[0].url.endsWith('cancel_role_reservation'));
    assert.ok(requests[1].url.endsWith('record_la_meute_result'));
    assert.equal(requests[1].body.p_players[0].outcome,'win');
    assert.equal(requests[1].body.p_players[0].user_id,'winner');
  } finally { h.manager.stop();restore(); }
});


test('réponse après dix secondes : aucune demande attribuée, annulation persistée et envoyée', async () => {
  const restore=environment();let now=Date.now();const h=harness(undefined,()=>now);
  let resolveReserve: (r: Response)=>void = () => {};
  let requested: {p_reservation_id:string}|undefined;
  const cancellations: string[]=[];
  globalThis.fetch=async(url,init)=>{
    const body=JSON.parse(String(init?.body));
    if(String(url).endsWith('reserve_role')) {
      requested=body;
      return new Promise<Response>((resolve)=>{resolveReserve=resolve;});
    }
    assert.ok(String(url).endsWith('cancel_role_reservation'));
    cancellations.push(body.p_reservation_id);
    return Response.json(null);
  };
  try {
    const sock=h.socket();const created=await sock.call('game:create',{name:'Late',rgToken:token('late')});
    const room=h.manager.rooms.get(created.code)!;
    for(let i=0;i<3;i++)h.manager.joinGame(created.code,`Guest${i}`);
    room.engine.updateSettings(created.playerId,{autoWolves:false,roles:{werewolf:1,hunter:1}},now);
    await sock.call('game:start');
    const request=sock.call('role:buy',{role:'hunter'});
    await eventually(()=>Boolean(requested));
    assert.equal(cancellations.length,0);
    now+=10_000;room.engine.tick(now);
    resolveReserve(Response.json([{reservation_id:requested!.p_reservation_id,new_balance:100}]));
    const reply=await request;
    assert.equal(reply.error,'GAME_STARTED');
    assert.equal(room.engine.state.players[0].roleReservation,undefined);
    await eventually(()=>cancellations.length===1);
    assert.deepEqual(cancellations,[requested!.p_reservation_id]);
    assert.equal(room.engine.state.platformJobs?.length,0);
  } finally {h.manager.stop();restore();}
});
