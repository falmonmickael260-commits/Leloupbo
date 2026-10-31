import { test } from 'node:test';
import assert from 'node:assert/strict';
const modulePath = '../scripts/deployer-meute.mjs';
const { variablesToSynchronize } = await import(modulePath);
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
