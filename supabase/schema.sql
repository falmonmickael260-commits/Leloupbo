-- ════════════════════════════════════════════════════════════════════════════
-- Profils joueurs de la plateforme (communs à tous les jeux) — sans compte.
-- À exécuter une fois dans Supabase : SQL Editor → New query → coller → Run.
--
-- Sécurité :
--   • RLS activée SANS aucune règle d'accès : la clé publique (anon / authenticated)
--     ne peut RIEN lire ni écrire. Le navigateur ne parle jamais à Supabase.
--   • Seul le serveur de jeu, avec la clé secrète (service_role, qui contourne la RLS),
--     crée les profils et enregistre les résultats qu'il a lui-même calculés.
--   • La clé du profil n'est jamais stockée : seulement son empreinte SHA-256.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.platform_players (
  id            uuid primary key,
  display_name  text not null check (char_length(display_name) between 1 and 20),
  key_hash      text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.platform_game_results (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.platform_players(id) on delete cascade,
  game        text not null check (char_length(game) between 1 and 40),   -- 'loup-garou', 'rami', 'president'…
  game_code   text not null,
  role        text,
  camp        text,
  outcome     text not null check (outcome in ('win', 'loss', 'draw')),
  eliminated  boolean not null default false,
  ended_at    timestamptz not null default now()
);

create index if not exists platform_game_results_player_idx on public.platform_game_results (player_id);
create index if not exists platform_game_results_game_idx on public.platform_game_results (player_id, game);

alter table public.platform_players enable row level security;
alter table public.platform_game_results enable row level security;

-- Aucune politique : tout accès anon / authenticated est refusé.
revoke all on public.platform_players from anon, authenticated;
revoke all on public.platform_game_results from anon, authenticated;
