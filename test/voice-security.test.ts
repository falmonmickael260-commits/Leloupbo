import assert from 'node:assert/strict';
import { it } from 'node:test';
import { LiveKitBridge, type RoomApi } from '../src/server/voiceSfu.ts';
import { setup } from './helpers.ts';
const cfg = { url: 'ws://localhost:7880', apiKey: 'test', apiSecret: 'test-secret-for-unit-tests-only-long' };

it('LiveKit : tout jeton neuf ou rejoué commence sans droit, même pour un loup', async () => {
  const g = setup(['werewolf', 'villager', 'villager', 'villager']);
  const bridge = new LiveKitBridge(cfg);
  for (const phase of ['WEREWOLF_PHASE', 'PLAYER_SPEECH'] as const) {
    g.until(phase);
    for (const id of g.ids) {
      const { token } = await bridge.token(g.engine, id, 'Test');
      const grant = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).video;
      assert.equal(grant.canSubscribe, false); assert.equal(grant.canPublish, false);
      assert.equal(grant.canPublishData, false); assert.equal(grant.room, 'blackops-TEST');
      assert.equal(bridge.permissionsFor(g.engine, id).canPublish, g.engine.view(id, g.now).voice.canSpeak);
    }
  }
});

it('LiveKit : révocation des anciens auditeurs avant toute ouverture du canal privé ; panne = aucune nouvelle permission', async () => {
  const g = setup(['werewolf', 'villager', 'villager', 'villager']); g.until('WEREWOLF_PHASE');
  const participants = [
    { identity: g.ids[0], permission: { canPublish: false, canSubscribe: false } },
    { identity: g.ids[1], permission: { canPublish: true, canSubscribe: true } },
  ];
  const calls: string[] = []; let fail = true;
  const api: RoomApi = {
    listRooms: async () => [], listParticipants: async () => structuredClone(participants),
    removeParticipant: async () => {}, deleteRoom: async () => {},
    updateParticipant: async (_room, identity, opts) => {
      if (identity === g.ids[1] && fail) throw new Error('simulated network outage');
      calls.push(identity);
      participants.find((p) => p.identity === identity)!.permission = opts.permission;
    },
  };
  const bridge = new LiveKitBridge(cfg, api);
  await bridge.enforceNow(g.engine);
  assert.deepEqual(calls, [], 'aucun droit ajouté si la fermeture du canal précédent échoue');
  fail = false; await bridge.enforceNow(g.engine);
  assert.deepEqual(calls, [g.ids[1], g.ids[0]], 'retirer avant d’accorder');
  assert.equal(participants[0].permission.canPublish, true);
  assert.equal(participants[1].permission.canSubscribe, false);
  assert.equal(participants[1].permission.canPublish, false);
});

it('LiveKit : mort silencieux en discussion, dernière parole conservée et orateur exclusif', () => {
  const g = setup(['werewolf', 'villager', 'villager', 'villager', 'villager']);
  const bridge = new LiveKitBridge(cfg);
  g.until('PLAYER_SPEECH');
  const speaker = g.engine.state.speech!.order[g.engine.state.speech!.index];
  for (const id of g.ids) assert.equal(bridge.permissionsFor(g.engine, id).canPublish, id === speaker);
  const activeSpeaker = g.engine.state.players.find((p) => p.id === speaker)!;
  activeSpeaker.connected = false;
  assert.deepEqual(bridge.permissionsFor(g.engine, speaker), { canPublish: false, canSubscribe: false });
  activeSpeaker.connected = true;
  g.until('FREE_DISCUSSION'); g.engine.state.players[2].alive = false;
  assert.equal(bridge.permissionsFor(g.engine, g.ids[2]).canPublish, false);
  g.engine.state.phase.id = 'DEATH_LAST_WORD'; g.engine.state.phase.data = { playerId: g.ids[2] };
  for (const id of g.ids) assert.equal(bridge.permissionsFor(g.engine, id).canPublish, id === g.ids[2]);
});
