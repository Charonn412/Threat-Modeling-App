import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Assessment } from '../model/types';
import { migrate } from '../io/file';

/**
 * Team workspace backed by Supabase (see supabase/schema.sql and
 * docs/TEAM_SETUP.md). All authorization is enforced by row-level security
 * in the database; this module only calls the API.
 */

export type Role = 'owner' | 'editor' | 'reviewer' | 'viewer';
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor', reviewer: 'Reviewer', viewer: 'Viewer' };
export const canEdit = (r: Role | null | undefined) => r === 'owner' || r === 'editor';
export const canSign = (r: Role | null | undefined) => r === 'owner' || r === 'editor' || r === 'reviewer';

export type SignRole = 'business-owner' | 'technical-owner' | 'security-reviewer' | 'privacy-legal-risk' | 'risk-acceptance';
export const SIGN_ROLE_LABEL: Record<SignRole, string> = {
  'business-owner': 'Business owner / accountable executive',
  'technical-owner': 'Technical owner / architect',
  'security-reviewer': 'Security reviewer / facilitator',
  'privacy-legal-risk': 'Privacy / Legal / Risk reviewer',
  'risk-acceptance': 'Residual risk acceptance authority',
};
export type SignDecision = 'approve' | 'approve-with-conditions' | 'reject';
export const DECISION_TEXT: Record<SignDecision, string> = { approve: 'Approve', 'approve-with-conditions': 'Approve with conditions', reject: 'Not approved / hold' };

export type CommentTarget = 'assessment' | 'component' | 'flow' | 'boundary' | 'threat' | 'control';

export interface TeamAssessmentRow {
  id: string;
  name: string;
  revision: number;
  updated_at: string;
  role: Role;
}
export interface Member {
  user_id: string;
  role: Role;
  email: string;
  display_name: string;
}
export interface TeamComment {
  id: string;
  assessment_id: string;
  target_kind: CommentTarget;
  target_id: string;
  target_label: string;
  body: string;
  author_id: string;
  created_at: string;
  resolved: boolean;
  resolved_by: string | null;
}
export interface TeamVersion {
  id: string;
  assessment_id: string;
  label: string;
  note: string;
  data: Assessment;
  data_hash: string;
  created_by: string;
  created_at: string;
}
export interface Signoff {
  id: string;
  version_id: string;
  role: SignRole;
  decision: SignDecision;
  comment: string;
  data_hash: string;
  signed_by: string;
  signed_at: string;
}

export class ConflictError extends Error {}

function fail(error: { message: string; code?: string } | null, what: string): never {
  const msg = error?.message ?? 'unknown error';
  if (error?.code === '40001' || /conflict/i.test(msg)) throw new ConflictError('Someone else saved this assessment since you opened it.');
  throw new Error(`${what}: ${msg}`);
}

export class TeamApi {
  constructor(private sb: SupabaseClient) {}

  // ── Auth ──
  async session(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    return data.session;
  }
  async sendMagicLink(email: string, redirectTo: string) {
    const { error } = await this.sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
    if (error) fail(error, 'Sign-in');
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  onAuthChange(cb: (s: Session | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, s) => cb(s));
    return () => data.subscription.unsubscribe();
  }

  // ── Assessments ──
  async list(userId: string): Promise<TeamAssessmentRow[]> {
    const [{ data: rows, error }, { data: mine, error: e2 }] = await Promise.all([
      this.sb.from('assessments').select('id,name,revision,updated_at').order('updated_at', { ascending: false }),
      this.sb.from('assessment_members').select('assessment_id,role').eq('user_id', userId),
    ]);
    if (error) fail(error, 'Loading team assessments');
    if (e2) fail(e2, 'Loading roles');
    const roles = new Map((mine ?? []).map((m: { assessment_id: string; role: Role }) => [m.assessment_id, m.role]));
    return (rows ?? []).map((r: Omit<TeamAssessmentRow, 'role'>) => ({ ...r, role: roles.get(r.id) ?? 'viewer' }));
  }

  async share(a: Assessment): Promise<number> {
    const { data, error } = await this.sb.from('assessments').insert({ id: a.id, name: a.intake.systemName || 'Untitled assessment', data: a }).select('revision').single();
    if (error) fail(error, 'Sharing');
    return (data as { revision: number }).revision;
  }

  async load(id: string, userId: string): Promise<{ assessment: Assessment; revision: number; role: Role }> {
    const [{ data, error }, { data: m, error: e2 }] = await Promise.all([
      this.sb.from('assessments').select('data,revision').eq('id', id).single(),
      this.sb.from('assessment_members').select('role').eq('assessment_id', id).eq('user_id', userId).single(),
    ]);
    if (error) fail(error, 'Opening');
    if (e2) fail(e2, 'Reading your role');
    const row = data as { data: unknown; revision: number };
    return { assessment: migrate(row.data), revision: row.revision, role: (m as { role: Role }).role };
  }

  /** Saves with optimistic concurrency. Throws ConflictError if someone else saved first. */
  async save(a: Assessment, expectedRevision: number): Promise<number> {
    const { data, error } = await this.sb.rpc('save_assessment', {
      p_id: a.id,
      p_name: a.intake.systemName || 'Untitled assessment',
      p_data: a,
      p_expected_revision: expectedRevision,
    });
    if (error) fail(error, 'Saving');
    return data as number;
  }

  async remove(id: string) {
    const { error } = await this.sb.from('assessments').delete().eq('id', id);
    if (error) fail(error, 'Deleting');
  }

  // ── Members ──
  async members(id: string): Promise<Member[]> {
    const { data, error } = await this.sb.from('assessment_members').select('user_id,role').eq('assessment_id', id);
    if (error) fail(error, 'Loading members');
    const ids = (data ?? []).map((m: { user_id: string }) => m.user_id);
    const { data: profiles, error: e2 } = ids.length ? await this.sb.from('profiles').select('id,email,display_name').in('id', ids) : { data: [], error: null };
    if (e2) fail(e2, 'Loading member profiles');
    const byId = new Map((profiles ?? []).map((p: { id: string; email: string; display_name: string }) => [p.id, p]));
    return (data ?? []).map((m: { user_id: string; role: Role }) => ({
      user_id: m.user_id,
      role: m.role,
      email: byId.get(m.user_id)?.email ?? '',
      display_name: byId.get(m.user_id)?.display_name ?? '',
    }));
  }
  async addMember(id: string, email: string, role: Role) {
    const { error } = await this.sb.rpc('add_member', { p_assessment: id, p_email: email, p_role: role });
    if (error) fail(error, 'Adding member');
  }
  async setRole(id: string, userId: string, role: Role) {
    const { error } = await this.sb.from('assessment_members').update({ role }).eq('assessment_id', id).eq('user_id', userId);
    if (error) fail(error, 'Changing role');
  }
  async removeMember(id: string, userId: string) {
    const { error } = await this.sb.from('assessment_members').delete().eq('assessment_id', id).eq('user_id', userId);
    if (error) fail(error, 'Removing member');
  }

  // ── Comments ──
  async comments(id: string): Promise<TeamComment[]> {
    const { data, error } = await this.sb.from('comments').select('*').eq('assessment_id', id).order('created_at', { ascending: true });
    if (error) fail(error, 'Loading comments');
    return (data ?? []) as TeamComment[];
  }
  async addComment(id: string, target: { kind: CommentTarget; id: string; label: string }, body: string, authorId: string) {
    const { error } = await this.sb.from('comments').insert({ assessment_id: id, target_kind: target.kind, target_id: target.id, target_label: target.label, body, author_id: authorId });
    if (error) fail(error, 'Adding comment');
  }
  async resolveComment(commentId: string, resolved: boolean) {
    const { error } = await this.sb.from('comments').update({ resolved }).eq('id', commentId);
    if (error) fail(error, 'Updating comment');
  }
  async deleteComment(commentId: string) {
    const { error } = await this.sb.from('comments').delete().eq('id', commentId);
    if (error) fail(error, 'Deleting comment');
  }
  /** Live updates for comments (requires Realtime on the comments table). */
  watchComments(id: string, onChange: () => void): () => void {
    const ch = this.sb
      .channel(`comments:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `assessment_id=eq.${id}` }, () => onChange())
      .subscribe();
    return () => {
      void this.sb.removeChannel(ch);
    };
  }

  // ── Versions and sign-off ──
  async versions(id: string): Promise<TeamVersion[]> {
    const { data, error } = await this.sb.from('versions').select('*').eq('assessment_id', id).order('created_at', { ascending: false });
    if (error) fail(error, 'Loading versions');
    return ((data ?? []) as TeamVersion[]).map((v) => ({ ...v, data: migrate(v.data) }));
  }
  async createVersion(a: Assessment, label: string, note: string): Promise<TeamVersion> {
    const { data, error } = await this.sb.from('versions').insert({ assessment_id: a.id, label, note, data: a }).select('*').single();
    if (error) fail(error, 'Saving version');
    return data as TeamVersion;
  }
  async signoffs(id: string): Promise<Signoff[]> {
    const { data, error } = await this.sb.from('signoffs').select('*').eq('assessment_id', id).order('signed_at', { ascending: true });
    if (error) fail(error, 'Loading sign-offs');
    return (data ?? []) as Signoff[];
  }
  async sign(assessmentId: string, versionId: string, role: SignRole, decision: SignDecision, comment: string, userId: string) {
    const { error } = await this.sb.from('signoffs').insert({ assessment_id: assessmentId, version_id: versionId, role, decision, comment, signed_by: userId });
    if (error) fail(error, 'Signing');
  }
}
