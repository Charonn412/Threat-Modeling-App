-- AI Threat Modeler – team workspace schema for Supabase.
-- Run once in the Supabase SQL editor (Project → SQL → New query → paste → Run).
-- Safe to re-run: objects are created if missing and policies are replaced.
--
-- Access model (enforced in the database with row-level security, never in the app):
--   owner     – everything, including members, deletion and sign-off
--   editor    – edit the assessment, save versions, comment, sign off
--   reviewer  – read, comment and sign off (cannot edit)
--   viewer    – read and comment
-- Approvals are bound to an immutable version snapshot and its server-computed hash.

create extension if not exists pgcrypto;

-- ── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default ''
);

create table if not exists public.assessments (
  id text primary key check (char_length(id) between 3 and 80),
  owner_id uuid not null default auth.uid() references auth.users (id),
  name text not null default '' check (char_length(name) <= 300),
  data jsonb not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id)
);

create table if not exists public.assessment_members (
  assessment_id text not null references public.assessments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'reviewer', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (assessment_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  assessment_id text not null references public.assessments (id) on delete cascade,
  target_kind text not null check (target_kind in ('assessment', 'component', 'flow', 'boundary', 'threat', 'control')),
  target_id text not null default '',
  target_label text not null default '' check (char_length(target_label) <= 300),
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid references auth.users (id)
);

create table if not exists public.versions (
  id uuid primary key default gen_random_uuid(),
  assessment_id text not null references public.assessments (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  note text not null default '',
  data jsonb not null,
  data_hash text not null default '',
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.signoffs (
  id uuid primary key default gen_random_uuid(),
  assessment_id text not null references public.assessments (id) on delete cascade,
  version_id uuid not null references public.versions (id) on delete cascade,
  role text not null check (role in ('business-owner', 'technical-owner', 'security-reviewer', 'privacy-legal-risk', 'risk-acceptance')),
  decision text not null check (decision in ('approve', 'approve-with-conditions', 'reject')),
  comment text not null default '' check (char_length(comment) <= 4000),
  data_hash text not null default '',
  signed_by uuid not null default auth.uid() references auth.users (id),
  signed_at timestamptz not null default now(),
  unique (version_id, role, signed_by)
);

create index if not exists comments_assessment_idx on public.comments (assessment_id, created_at);
create index if not exists versions_assessment_idx on public.versions (assessment_id, created_at);
create index if not exists signoffs_version_idx on public.signoffs (version_id);
create index if not exists members_user_idx on public.assessment_members (user_id);

-- ── Helpers (security definer so policies can check membership without recursion) ──

create or replace function public.member_role(p_assessment text)
returns text language sql stable security definer set search_path = public as $$
  select role from public.assessment_members where assessment_id = p_assessment and user_id = auth.uid()
$$;

create or replace function public.has_role(p_assessment text, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p_assessment) = any (p_roles), false)
$$;

-- ── Triggers ───────────────────────────────────────────────────────────────

-- Profile row for every signed-up user (used to show names and to invite by email).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- The creator of an assessment becomes its owner. Ownership and identity fields cannot be spoofed.
create or replace function public.assessment_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.owner_id := auth.uid();
  new.updated_by := auth.uid();
  new.revision := 1;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create or replace function public.assessment_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.assessment_members (assessment_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;

drop trigger if exists assessments_before_insert on public.assessments;
create trigger assessments_before_insert before insert on public.assessments for each row execute function public.assessment_before_insert();
drop trigger if exists assessments_after_insert on public.assessments;
create trigger assessments_after_insert after insert on public.assessments for each row execute function public.assessment_after_insert();

-- Version snapshots get a server-computed hash; sign-offs copy the hash of the exact version signed.
create or replace function public.version_before_insert()
returns trigger language plpgsql as $$
begin
  new.data_hash := encode(digest(new.data::text, 'sha256'), 'hex');
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;

drop trigger if exists versions_before_insert on public.versions;
create trigger versions_before_insert before insert on public.versions for each row execute function public.version_before_insert();

create or replace function public.signoff_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.versions;
begin
  select * into v from public.versions where id = new.version_id;
  if v.id is null or v.assessment_id <> new.assessment_id then
    raise exception 'Version does not belong to this assessment';
  end if;
  new.data_hash := v.data_hash;
  new.signed_by := auth.uid();
  new.signed_at := now();
  return new;
end $$;

drop trigger if exists signoffs_before_insert on public.signoffs;
create trigger signoffs_before_insert before insert on public.signoffs for each row execute function public.signoff_before_insert();

-- Only the comment author edits text; resolution is recorded with who resolved it.
create or replace function public.comment_before_update()
returns trigger language plpgsql as $$
begin
  if new.body <> old.body and old.author_id <> auth.uid() then
    raise exception 'Only the author can edit a comment';
  end if;
  new.author_id := old.author_id;
  new.assessment_id := old.assessment_id;
  new.created_at := old.created_at;
  new.resolved_by := case when new.resolved then auth.uid() else null end;
  return new;
end $$;

drop trigger if exists comments_before_update on public.comments;
create trigger comments_before_update before update on public.comments for each row execute function public.comment_before_update();

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Save with optimistic concurrency: fails if someone else saved since `p_expected_revision`.
create or replace function public.save_assessment(p_id text, p_name text, p_data jsonb, p_expected_revision integer)
returns integer language plpgsql security definer set search_path = public as $$
declare new_rev integer;
begin
  if not public.has_role(p_id, array['owner', 'editor']) then
    raise exception 'Not allowed to edit this assessment' using errcode = '42501';
  end if;
  update public.assessments
     set data = p_data, name = left(p_name, 300), revision = revision + 1, updated_at = now(), updated_by = auth.uid()
   where id = p_id and revision = p_expected_revision
  returning revision into new_rev;
  if new_rev is null then
    raise exception 'conflict: the assessment was changed by someone else' using errcode = '40001';
  end if;
  return new_rev;
end $$;

-- Owners add members by email. The person must have signed in once so their account exists.
create or replace function public.add_member(p_assessment text, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.has_role(p_assessment, array['owner']) then
    raise exception 'Only owners can add members' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'editor', 'reviewer', 'viewer') then
    raise exception 'Invalid role';
  end if;
  select id into uid from public.profiles where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'No account for %. Ask them to sign in to the app once, then add them again.', p_email;
  end if;
  insert into public.assessment_members (assessment_id, user_id, role) values (p_assessment, uid, p_role)
  on conflict (assessment_id, user_id) do update set role = excluded.role;
  return uid;
end $$;

-- Prevent leaving an assessment without an owner.
create or replace function public.members_keep_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare aid text := coalesce(old.assessment_id, new.assessment_id);
begin
  if not exists (select 1 from public.assessment_members where assessment_id = aid and role = 'owner')
     and exists (select 1 from public.assessments where id = aid) then
    raise exception 'An assessment must keep at least one owner';
  end if;
  return null;
end $$;

drop trigger if exists members_keep_owner on public.assessment_members;
-- Checked immediately after each change; deleting the whole assessment (cascade) is still allowed.
create trigger members_keep_owner after update or delete on public.assessment_members
  for each row execute function public.members_keep_owner();

-- ── Row-level security ─────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_members enable row level security;
alter table public.comments enable row level security;
alter table public.versions enable row level security;
alter table public.signoffs enable row level security;

-- Profiles: you see yourself and people you share an assessment with.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.assessment_members me join public.assessment_members them on them.assessment_id = me.assessment_id
    where me.user_id = auth.uid() and them.user_id = profiles.id
  )
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Assessments
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments for select to authenticated using (public.has_role(id, array['owner', 'editor', 'reviewer', 'viewer']));
drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert on public.assessments for insert to authenticated with check (auth.uid() is not null);
-- No direct UPDATE: all edits go through save_assessment(), which enforces roles and optimistic concurrency
-- and cannot change ownership.
drop policy if exists assessments_update on public.assessments;
drop policy if exists assessments_delete on public.assessments;
create policy assessments_delete on public.assessments for delete to authenticated using (public.has_role(id, array['owner']));

-- Members: everyone on an assessment sees the member list; only owners change it (or remove themselves).
drop policy if exists members_select on public.assessment_members;
create policy members_select on public.assessment_members for select to authenticated using (public.has_role(assessment_id, array['owner', 'editor', 'reviewer', 'viewer']));
drop policy if exists members_update on public.assessment_members;
create policy members_update on public.assessment_members for update to authenticated using (public.has_role(assessment_id, array['owner'])) with check (public.has_role(assessment_id, array['owner']));
drop policy if exists members_delete on public.assessment_members;
create policy members_delete on public.assessment_members for delete to authenticated using (public.has_role(assessment_id, array['owner']) or user_id = auth.uid());
-- Inserts go through add_member() or the owner trigger; no direct insert policy.

-- Comments: any member reads and writes as themselves; editors/owners/authors resolve; authors/owners delete.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated using (public.has_role(assessment_id, array['owner', 'editor', 'reviewer', 'viewer']));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check (author_id = auth.uid() and resolved = false and public.has_role(assessment_id, array['owner', 'editor', 'reviewer', 'viewer']));
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid() or public.has_role(assessment_id, array['owner', 'editor']))
  with check (public.has_role(assessment_id, array['owner', 'editor', 'reviewer', 'viewer']));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using (author_id = auth.uid() or public.has_role(assessment_id, array['owner']));

-- Versions: immutable snapshots. Editors/owners create, members read, owners delete.
drop policy if exists versions_select on public.versions;
create policy versions_select on public.versions for select to authenticated using (public.has_role(assessment_id, array['owner', 'editor', 'reviewer', 'viewer']));
drop policy if exists versions_insert on public.versions;
create policy versions_insert on public.versions for insert to authenticated with check (public.has_role(assessment_id, array['owner', 'editor']));
drop policy if exists versions_delete on public.versions;
create policy versions_delete on public.versions for delete to authenticated using (public.has_role(assessment_id, array['owner']));

-- Sign-offs: owners, editors and reviewers sign as themselves; immutable once made (sign again to change a decision).
drop policy if exists signoffs_select on public.signoffs;
create policy signoffs_select on public.signoffs for select to authenticated using (public.has_role(assessment_id, array['owner', 'editor', 'reviewer', 'viewer']));
drop policy if exists signoffs_insert on public.signoffs;
create policy signoffs_insert on public.signoffs for insert to authenticated with check (signed_by = auth.uid() and public.has_role(assessment_id, array['owner', 'editor', 'reviewer']));

-- Table privileges for API roles (RLS above still applies). Anonymous users get nothing.
revoke all on public.profiles, public.assessments, public.assessment_members, public.comments, public.versions, public.signoffs from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.assessments to authenticated;
revoke update on public.assessments from authenticated;
grant select, update, delete on public.assessment_members to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, delete on public.versions to authenticated;
grant select, insert on public.signoffs to authenticated;
revoke all on function public.save_assessment(text, text, jsonb, integer) from public, anon;
revoke all on function public.add_member(text, text, text) from public, anon;
grant execute on function public.save_assessment(text, text, jsonb, integer) to authenticated;
grant execute on function public.add_member(text, text, text) to authenticated;
grant execute on function public.member_role(text), public.has_role(text, text[]) to authenticated;

-- Live comment updates (Supabase Realtime). Ignore the error if the table is already published.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.comments;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
