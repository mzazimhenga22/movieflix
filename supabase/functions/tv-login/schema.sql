-- Run this in your Supabase SQL editor to support the tv-login Edge Function.

create table if not exists public.tv_login_sessions (
  code text primary key,
  nonce uuid not null,
  created_at_ms bigint not null,
  expires_at_ms bigint not null,
  status text not null default 'pending',
  approved_uid text null,
  approved_at_ms bigint null,
  claimed_at_ms bigint null
);

create index if not exists tv_login_sessions_expires_at_ms_idx
  on public.tv_login_sessions (expires_at_ms);

alter table public.tv_login_sessions enable row level security;

revoke all on table public.tv_login_sessions from anon;
revoke all on table public.tv_login_sessions from authenticated;
