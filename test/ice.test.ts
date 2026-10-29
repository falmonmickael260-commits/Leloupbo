import assert from 'node:assert/strict';
import { it } from 'node:test';
import { iceServersFromEnv } from '../src/server/ice.ts';

it('ICE : une configuration malformée ne désactive pas silencieusement STUN', () => {
  for (const value of ['[]', '[{"urls":[]}]', '[{"urls":[42]}]', '[{"urls":"https://bad"}]', 'null', 'bad']) {
    assert.deepEqual(iceServersFromEnv({ ICE_SERVERS: value }), iceServersFromEnv({}));
  }
});
it('ICE : conserve les URL TURN/TLS et identifiants fournis sans les réécrire', () => {
  const servers = [{ urls: ['turn:relay.example:3478?transport=udp', 'turns:relay.example:443?transport=tcp'], username: 'test-user', credential: 'test-password' }];
  assert.deepEqual(iceServersFromEnv({ ICE_SERVERS: JSON.stringify(servers) }), servers);
  assert.deepEqual(iceServersFromEnv({ TURN_URLS: ' turn:relay.example:3478, turns:relay.example:443 ', TURN_USERNAME: 'test-user', TURN_CREDENTIAL: 'test-password' }).at(-1), { ...servers[0], urls: ['turn:relay.example:3478', 'turns:relay.example:443'] });
});
