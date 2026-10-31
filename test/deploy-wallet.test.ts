import { test } from 'node:test';
import assert from 'node:assert/strict';
const modulePath = '../scripts/deployer-meute.mjs';
const { variablesToSynchronize, assertPersistentStorage } = await import(modulePath);
const platform = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://wrsmtdtzilpckfcjmyri.supabase.co',
  PLATFORM_SHARED_SECRET: 'test-secret', SUPABASE_SERVICE_ROLE_KEY: 'test-service',
};
test('déploiement : synchronise uniquement les trois variables nécessaires, conserve les autres', () => {
  const current = { LIVEKIT_URL: 'https://voice.test', SUPABASE_URL: 'https://local-profiles.test' };
  assert.deepEqual(variablesToSynchronize(platform, current).map(([key]: [string, string]) => key), ['PLATFORM_SUPABASE_URL','PLATFORM_SUPABASE_SERVICE_ROLE_KEY','PLATFORM_SHARED_SECRET']);
  assert.equal(current.LIVEKIT_URL, 'https://voice.test');
});
test('déploiement : aucune modification lorsque les variables correspondent', () => {
  assert.deepEqual(variablesToSynchronize(platform, { PLATFORM_SUPABASE_URL: platform.NEXT_PUBLIC_SUPABASE_URL, PLATFORM_SHARED_SECRET: platform.PLATFORM_SHARED_SECRET, PLATFORM_SUPABASE_SERVICE_ROLE_KEY: platform.SUPABASE_SERVICE_ROLE_KEY }), []);
});
test('déploiement : projet incorrect ou secret absent interdit toute synchronisation', () => {
  assert.throws(() => variablesToSynchronize({ ...platform, NEXT_PUBLIC_SUPABASE_URL: 'https://wrong.test' }, {}), /projet Supabase/);
  assert.throws(() => variablesToSynchronize({ ...platform, PLATFORM_SHARED_SECRET: '' }, {}), /secrets requis/);
});

test('déploiement : une variable scellée n’est jamais remplacée', () => {
  assert.throws(() => variablesToSynchronize(platform, { PLATFORM_SHARED_SECRET: null }), /sealed/);
});

test('stockage : montage Railway confirmé sans accès SSH', () => {
  assert.doesNotThrow(() => assertPersistentStorage({ RAILWAY_VOLUME_MOUNT_PATH: '/data' }));
  assert.doesNotThrow(() => assertPersistentStorage({ DATA_DIR: '/data/games' }, { volumes: [{ volumeInstances: { edges: [{ node: { mountPath: '/data', serviceId: '06684f08-9de1-4951-a367-b21871330f58', environmentId: 'a67c0f4d-8972-4913-9ed4-e0e72283364f' } }] } }] }));
});
test('stockage : mauvais service, montage absent ou chemin incorrect bloquent le déploiement', () => {
  assert.throws(() => assertPersistentStorage({}), /non confirmé/);
  assert.throws(() => assertPersistentStorage({ DATA_DIR: '/app/data', RAILWAY_VOLUME_MOUNT_PATH: '/data' }), /DATA_DIR/);
  assert.throws(() => assertPersistentStorage({ DATA_DIR: '', RAILWAY_VOLUME_MOUNT_PATH: '/data' }), /DATA_DIR/);
  assert.throws(() => assertPersistentStorage({}, [{ mountPath: '/data', serviceId: 'another', environmentId: 'production' }]), /non confirmé/);
  assert.throws(() => assertPersistentStorage({}, [{ mountPath: '/data', service: 'village-des-blackops', environment: 'staging' }]), /non confirmé/);
});
