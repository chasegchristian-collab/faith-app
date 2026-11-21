-- Together in Faith: live sync schema for Supabase (Postgres).
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
-- Safe to re-run.
--
-- Security model
--   * The table has RLS enabled and NO policies, so the anon key cannot read or write it directly.
--   * The browser only calls two SECURITY DEFINER functions, pull() and push(), which always filter by
--     the couple code. Only someone who knows a couple's code (24 random characters, ~120 bits) can
--     read or write that couple's rows.

create table if not exists public.couple_items (
  couple_code text        not null,
  id          text        not null,               -- e.g. 'prayer:<id>', 'reading:john-3', 'settings'
  kind        text        not null,               -- prayer | gratitude | reminder | reading | settings | activity
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null,               -- client edit time; last write wins on this
  deleted     boolean     not null default false, -- tombstone (the record itself also carries deleted:true)
  synced_at   timestamptz not null default now(), -- server time the row last changed; pull() cursor
  primary key (couple_code, id)
);

create index if not exists couple_items_code_synced_idx on public.couple_items (couple_code, synced_at);

alter table public.couple_items enable row level security;
-- Intentionally no policies: direct table access is denied for anon and authenticated.
revoke all on table public.couple_items from anon, authenticated;

-- pull: rows for this couple that changed on the server after p_since (null = everything).
create or replace function public.pull(p_code text, p_since timestamptz default null)
returns table (id text, kind text, data jsonb, updated_at timestamptz, deleted boolean, synced_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_code is null or length(p_code) < 20 or length(p_code) > 128 then
    raise exception 'invalid couple code' using errcode = '22023';
  end if;
  return query
    select c.id, c.kind, c.data, c.updated_at, c.deleted, c.synced_at
      from public.couple_items c
     where c.couple_code = p_code
       and (p_since is null or c.synced_at > p_since)
     order by c.synced_at
     limit 5000;
end;
$$;

-- push: upsert a batch of rows; a row only replaces the stored one if its updated_at is newer.
-- p_items: [{"id": "...", "kind": "...", "data": {...}, "updated_at": "ISO time", "deleted": false}, ...]
create or replace function public.push(p_code text, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if p_code is null or length(p_code) < 20 or length(p_code) > 128 then
    raise exception 'invalid couple code' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'too many items in one push (max 500)' using errcode = '22023';
  end if;

  insert into public.couple_items as c (couple_code, id, kind, data, updated_at, deleted, synced_at)
  select distinct on (x->>'id')            -- one row per id, newest wins, so the upsert never hits a row twice
         p_code,
         x->>'id',
         x->>'kind',
         coalesce(x->'data', '{}'::jsonb),
         (x->>'updated_at')::timestamptz,
         coalesce((x->>'deleted')::boolean, false),
         now()
    from jsonb_array_elements(p_items) as x
   where coalesce(length(x->>'id'), 0) between 1 and 200
     and x->>'kind' in ('prayer', 'gratitude', 'reminder', 'reading', 'settings', 'activity')
     and x->>'updated_at' is not null
     and length(coalesce(x->'data', '{}'::jsonb)::text) <= 20000
   order by x->>'id', (x->>'updated_at')::timestamptz desc
  on conflict (couple_code, id) do update
     set kind       = excluded.kind,
         data       = excluded.data,
         updated_at = excluded.updated_at,
         deleted    = excluded.deleted,
         synced_at  = now()
   where excluded.updated_at > c.updated_at;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Supabase's default privileges also grant new functions to anon/authenticated, so revoke those too,
-- then grant back to anon only.
revoke execute on function public.pull(text, timestamptz) from public, anon, authenticated;
revoke execute on function public.push(text, jsonb) from public, anon, authenticated;
grant execute on function public.pull(text, timestamptz) to anon;
grant execute on function public.push(text, jsonb) to anon;
