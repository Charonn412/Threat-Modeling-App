-- Row-level security tests. Run by supabase/tests/run.sh against a throwaway Postgres.
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Users
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'reviewer@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'viewer@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'outsider@example.com');

-- Test helpers (owned by the superuser, callable by anyone in this throwaway database).
create or replace procedure t_as(p_user uuid) language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  execute 'set role authenticated';
end $$;
create or replace function t_ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;
create or replace function t_denied(stmt text, label text) returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'ok: % (denied: %)', label, sqlerrm;
    return;
  end;
  if n = 0 then raise notice 'ok: % (no rows affected)', label; return; end if;
  raise exception 'FAIL: % (statement succeeded on % rows)', label, n;
end $$;
grant execute on procedure t_as(uuid) to authenticated;

-- 1. Owner creates an assessment; ownership is assigned by the server, not the client.
call t_as('00000000-0000-0000-0000-00000000000a');
insert into public.assessments (id, name, data, owner_id) values ('a_one', 'Support Agent', '{"v":1}', '00000000-0000-0000-0000-00000000000e');
select t_ok((select owner_id from public.assessments where id = 'a_one') = '00000000-0000-0000-0000-00000000000a', 'owner_id is forced to the caller');
select t_ok((select role from public.assessment_members where assessment_id = 'a_one' and user_id = auth.uid()) = 'owner', 'creator becomes owner member');
select t_ok(public.add_member('a_one', 'EDITOR@example.com', 'editor') = '00000000-0000-0000-0000-00000000000b', 'owner adds editor by email (case-insensitive)');
select public.add_member('a_one', 'reviewer@example.com', 'reviewer');
select public.add_member('a_one', 'viewer@example.com', 'viewer');
select t_denied($$select public.add_member('a_one', 'nobody@example.com', 'viewer')$$, 'unknown email is rejected');
reset role;

-- 2. Outsider sees and changes nothing.
call t_as('00000000-0000-0000-0000-00000000000e');
select t_ok((select count(*) from public.assessments) = 0, 'outsider cannot read assessments');
select t_ok((select count(*) from public.assessment_members) = 0, 'outsider cannot read members');
select t_denied($$select public.save_assessment('a_one', 'x', '{"hacked":true}', 1)$$, 'outsider cannot save');
select t_denied($$delete from public.assessments where id = 'a_one'$$, 'outsider cannot delete');
select t_denied($$insert into public.comments (assessment_id, target_kind, body) values ('a_one', 'assessment', 'spam')$$, 'outsider cannot comment');
select t_denied($$select public.add_member('a_one', 'outsider@example.com', 'owner')$$, 'outsider cannot add themselves');
select t_denied($$insert into public.assessment_members values ('a_one', '00000000-0000-0000-0000-00000000000e', 'owner')$$, 'no direct member inserts');
reset role;

-- 3. Editor saves with optimistic concurrency.
call t_as('00000000-0000-0000-0000-00000000000b');
select t_ok(public.save_assessment('a_one', 'Support Agent', '{"v":2}', 1) = 2, 'editor saves at revision 1 -> 2');
select t_denied($$select public.save_assessment('a_one', 'Support Agent', '{"v":"stale"}', 1)$$, 'stale revision is rejected as a conflict');
select t_ok((select data->>'v' from public.assessments where id = 'a_one') = '2', 'stale save did not overwrite');
select t_denied($$update public.assessments set owner_id = auth.uid() where id = 'a_one'$$, 'editor cannot update rows directly (e.g. take ownership)');
select t_denied($$delete from public.assessments where id = 'a_one'$$, 'editor cannot delete');
select t_denied($$select public.add_member('a_one', 'outsider@example.com', 'viewer')$$, 'editor cannot add members');
select t_denied($$update public.assessment_members set role = 'owner' where user_id = auth.uid()$$, 'editor cannot promote themselves');
insert into public.versions (assessment_id, label, data, created_by) values ('a_one', 'v1.0', '{"v":2}', '00000000-0000-0000-0000-00000000000e');
select t_ok((select created_by from public.versions where label = 'v1.0') = auth.uid(), 'version author is forced to the caller');
select t_ok((select length(data_hash) from public.versions where label = 'v1.0') = 64, 'version gets a server-computed SHA-256');
reset role;

-- 4. Reviewer and viewer: read, comment, (reviewer) sign; never edit.
call t_as('00000000-0000-0000-0000-00000000000c');
select t_ok((select count(*) from public.assessments) = 1, 'reviewer can read');
select t_denied($$select public.save_assessment('a_one', 'x', '{}', 2)$$, 'reviewer cannot save');
select t_denied($$insert into public.versions (assessment_id, label, data) values ('a_one', 'fake', '{}')$$, 'reviewer cannot create versions');
insert into public.comments (assessment_id, target_kind, target_id, body) values ('a_one', 'threat', 't_1', 'Is the CRM token scoped?');
insert into public.signoffs (assessment_id, version_id, role, decision, data_hash, signed_by)
  select 'a_one', id, 'security-reviewer', 'approve-with-conditions', 'forged', '00000000-0000-0000-0000-00000000000a' from public.versions where label = 'v1.0';
select t_ok((select signed_by from public.signoffs) = auth.uid(), 'signer is forced to the caller');
select t_ok((select s.data_hash = v.data_hash from public.signoffs s join public.versions v on v.id = s.version_id), 'sign-off is bound to the version hash (forged hash replaced)');
select t_denied($$update public.signoffs set decision = 'approve'$$, 'sign-offs are immutable');
select t_denied($$delete from public.signoffs$$, 'sign-offs cannot be deleted');
select t_denied($$update public.versions set data = '{"tampered":true}'$$, 'versions are immutable');
reset role;

call t_as('00000000-0000-0000-0000-00000000000d');
select t_ok((select count(*) from public.comments) = 1, 'viewer reads comments');
insert into public.comments (assessment_id, target_kind, body) values ('a_one', 'assessment', 'Looks good');
select t_denied($$insert into public.signoffs (assessment_id, version_id, role, decision) select 'a_one', id, 'business-owner', 'approve' from public.versions$$, 'viewer cannot sign off');
select t_denied($$update public.comments set body = 'edited by viewer' where body like 'Is the CRM%'$$, 'viewer cannot edit others'' comments');
select t_denied($$insert into public.comments (assessment_id, target_kind, body, author_id) values ('a_one', 'assessment', 'impersonation', '00000000-0000-0000-0000-00000000000a')$$, 'cannot comment as someone else');
select t_ok((select count(*) from public.profiles) = 5 - 1, 'profiles visible only for co-members (not the outsider)');
reset role;

-- 5. Editor resolves a comment; resolution is attributed. Author can still edit their text.
call t_as('00000000-0000-0000-0000-00000000000b');
update public.comments set resolved = true where body like 'Is the CRM%';
select t_ok((select resolved_by from public.comments where body like 'Is the CRM%') = auth.uid(), 'resolution records who resolved');
select t_denied($$update public.comments set body = 'rewritten' where body like 'Is the CRM%'$$, 'editor cannot rewrite another author''s text');
reset role;

-- 6. Owner safety: cannot remove the last owner; members can leave; owner can delete.
call t_as('00000000-0000-0000-0000-00000000000a');
select t_denied($$delete from public.assessment_members where user_id = auth.uid()$$, 'last owner cannot leave');
reset role;
call t_as('00000000-0000-0000-0000-00000000000d');
delete from public.assessment_members where user_id = auth.uid();
select t_ok((select count(*) from public.assessments) = 0, 'a member who leaves loses access');
reset role;
call t_as('00000000-0000-0000-0000-00000000000a');
delete from public.assessments where id = 'a_one';
select t_ok((select count(*) from public.comments) = 0 and (select count(*) from public.signoffs) = 0, 'owner deletes the assessment and everything under it');
reset role;

-- 7. Anonymous role has no access at all.
set role anon;
select t_denied($$select count(*) from public.assessments$$, 'anon cannot read assessments');
reset role;

\echo ALL RLS TESTS PASSED
