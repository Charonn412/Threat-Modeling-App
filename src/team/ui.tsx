import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { diffAssessments } from '../logic/diff';
import { Field, TextArea, TextInput } from '../ui/controls';
import { canEdit, canSign, DECISION_TEXT, ROLE_LABEL, SIGN_ROLE_LABEL, type CommentTarget, type Member, type Role, type SignDecision, type Signoff, type SignRole, type TeamComment, type TeamVersion } from './api';
import { useTeam } from './store';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── Settings card ─────────────────────────────────────────────────────────
export function TeamSettings() {
  const config = useTeam((s) => s.config);
  const configure = useTeam((s) => s.configure);
  const [url, setUrl] = useState(config?.url ?? '');
  const [key, setKey] = useState(config?.key ?? '');
  const [msg, setMsg] = useState('');
  return (
    <section className="card">
      <h2>Team workspace (Supabase)</h2>
      <p className="small muted">
        Share assessments with your team, comment on components and threats, and record sign-offs bound to an exact version. Data is stored in your own Supabase project.
        Access is enforced by the database (row-level security), not by this page. Setup takes about 10 minutes; see <code>docs/TEAM_SETUP.md</code> in the repository.
      </p>
      <div className="grid2">
        <Field label="Project URL" hint="Supabase → Project Settings → API → Project URL">
          <TextInput value={url} onChange={setUrl} placeholder="https://xxxx.supabase.co" />
        </Field>
        <Field label="Publishable (anon) key" hint="Safe to put in a browser app: row-level security protects the data.">
          <TextInput value={key} onChange={setKey} placeholder="eyJ… or sb_publishable_…" />
        </Field>
      </div>
      <div className="row gap">
        <button
          type="button"
          className="btn small primary"
          disabled={!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20}
          onClick={async () => {
            setMsg('');
            try {
              await configure({ url: url.trim().replace(/\/$/, ''), key: key.trim() });
              setMsg('Connected. Sign in from the Home page.');
            } catch (e) {
              setMsg(`Could not connect: ${errText(e)}`);
            }
          }}
        >
          {config ? 'Update connection' : 'Connect'}
        </button>
        {config && (
          <button type="button" className="btn small" onClick={() => configure(null).then(() => setMsg('Disconnected. Local assessments are unaffected.'))}>
            Disconnect
          </button>
        )}
        {msg && <span className="small">{msg}</span>}
      </div>
    </section>
  );
}

// ── Home section ──────────────────────────────────────────────────────────
export function TeamHome() {
  const { config, session, list, busy } = useTeam();
  const team = useTeam.getState();
  const current = useStore((s) => s.assessment);
  const setStep = useStore((s) => s.setStep);
  const cloud = useTeam((s) => s.cloud);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  if (!config) {
    return (
      <p className="small muted">
        Working with a team?{' '}
        <button type="button" className="link" onClick={() => setStep('settings')}>
          Connect a team workspace
        </button>{' '}
        to share assessments, comment and sign off together.
      </p>
    );
  }
  if (!session) {
    return (
      <section className="card">
        <h2>Team workspace</h2>
        <p className="small muted">Sign in with your work email. We'll send a one-time sign-in link.</p>
        <div className="row gap">
          <TextInput value={email} onChange={setEmail} placeholder="you@company.com" />
          <button
            type="button"
            className="btn small primary"
            disabled={!/^\S+@\S+\.\S+$/.test(email)}
            onClick={async () => {
              setMsg('');
              try {
                await team.api!.sendMagicLink(email, window.location.href.split('#')[0]);
                setMsg('Check your email for the sign-in link.');
              } catch (e) {
                setMsg(errText(e));
              }
            }}
          >
            Send sign-in link
          </button>
        </div>
        {msg && <p className="small">{msg}</p>}
      </section>
    );
  }
  const alreadyShared = !!current && list.some((r) => r.id === current.id);
  return (
    <section className="card">
      <div className="row between wrap">
        <h2>Team assessments</h2>
        <span className="small muted">
          Signed in as {session.user.email} ·{' '}
          <button type="button" className="link" onClick={() => team.api!.signOut()}>
            Sign out
          </button>
        </span>
      </div>
      {current && !alreadyShared && (
        <p className="small">
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={async () => {
              setMsg('');
              try {
                await team.shareCurrent();
                setMsg(`"${current.intake.systemName || 'Untitled'}" is now shared. Add members from the 👥 team panel.`);
              } catch (e) {
                setMsg(errText(e));
              }
            }}
          >
            ☁ Share "{current.intake.systemName || 'Untitled assessment'}" with the team
          </button>
        </p>
      )}
      {msg && <p className="small">{msg}</p>}
      {list.length === 0 ? (
        <p className="small muted">No shared assessments yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>System</th>
              <th>Your role</th>
              <th>Last saved</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className={cloud?.id === r.id ? 'current-row' : ''}>
                <td>
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    onClick={() =>
                      team.openCloud(r.id).catch((e) => {
                        setMsg(errText(e));
                      })
                    }
                  >
                    {r.name || 'Untitled'}
                  </button>
                </td>
                <td>{ROLE_LABEL[r.role]}</td>
                <td className="small">{r.updated_at ? new Date(r.updated_at).toLocaleString() : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── Top-bar status and conflict banner ────────────────────────────────────
const STATUS_TEXT = { saved: '☁ Saved', dirty: '☁ Unsaved changes', saving: '☁ Saving…', conflict: '⚠ Conflict', error: '⚠ Not saved', readonly: '☁ Read-only' };

export function CloudStatus({ onOpenPanel }: { onOpenPanel: () => void }) {
  const cloud = useTeam((s) => s.cloud);
  if (!cloud) return null;
  return (
    <>
      <button type="button" className={`cloud-pill st-${cloud.status}`} title={cloud.error ?? `Shared · your role: ${ROLE_LABEL[cloud.role]} · revision ${cloud.revision}`} onClick={onOpenPanel}>
        {STATUS_TEXT[cloud.status]}
      </button>
      <button type="button" className="btn small" onClick={onOpenPanel} aria-label="Open team panel">
        👥
      </button>
    </>
  );
}

export function ConflictBanner() {
  const cloud = useTeam((s) => s.cloud);
  const [busy, setBusy] = useState(false);
  if (!cloud || (cloud.status !== 'conflict' && cloud.status !== 'error' && cloud.status !== 'readonly')) return null;
  const t = useTeam.getState();
  if (cloud.status === 'readonly')
    return (
      <div className="banner small">
        You are a {ROLE_LABEL[cloud.role].toLowerCase()} on this shared assessment: you can read, comment{canSign(cloud.role) ? ' and sign off' : ''}. Changes you make stay in this browser only.
      </div>
    );
  return (
    <div className="banner warn-banner small">
      <strong>{cloud.status === 'conflict' ? 'Someone else saved this assessment.' : `Not saved to the team: ${cloud.error}`}</strong>{' '}
      {cloud.status === 'conflict' ? (
        <>
          <button type="button" className="btn small" disabled={busy} onClick={() => (setBusy(true), t.resolveKeepTheirs().finally(() => setBusy(false)))}>
            Load theirs (keep mine as a local copy)
          </button>{' '}
          <button
            type="button"
            className="btn small danger"
            disabled={busy}
            onClick={() => window.confirm('Replace the team copy with your version? Their latest changes will be overwritten.') && (setBusy(true), t.resolveOverwrite().finally(() => setBusy(false)))}
          >
            Overwrite with mine
          </button>
        </>
      ) : (
        <button type="button" className="btn small" onClick={() => t.saveNow()}>
          Retry
        </button>
      )}
    </div>
  );
}

// ── Team panel: comments, members, sign-off ───────────────────────────────
export function TeamPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'comments' | 'members' | 'signoff'>('comments');
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="Team panel" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="tabs" role="tablist">
            {(['comments', 'members', 'signoff'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
                {t === 'comments' ? 'Comments' : t === 'members' ? 'Members' : 'Sign-off'}
              </button>
            ))}
          </div>
          <button type="button" className="btn small" onClick={onClose}>
            Close
          </button>
        </div>
        {tab === 'comments' && <Comments />}
        {tab === 'members' && <Members />}
        {tab === 'signoff' && <SignOffPanel />}
      </aside>
    </div>
  );
}

/** The item the user is looking at, as a comment target. */
function useTarget(): { kind: CommentTarget; id: string; label: string } {
  const a = useStore((s) => s.assessment)!;
  const step = useStore((s) => s.step);
  const sel = useStore((s) => s.selection);
  const threatId = useStore((s) => s.selectedThreat);
  const controlId = useStore((s) => s.selectedControl);
  if (step === 'architecture' && sel) {
    if (sel.kind === 'component') return { kind: 'component', id: sel.id, label: a.components.find((c) => c.id === sel.id)?.name ?? 'Component' };
    if (sel.kind === 'boundary') return { kind: 'boundary', id: sel.id, label: a.boundaries.find((b) => b.id === sel.id)?.name ?? 'Boundary' };
    const f = a.flows.find((x) => x.id === sel.id);
    const n = (id?: string) => a.components.find((c) => c.id === id)?.name ?? '?';
    return { kind: 'flow', id: sel.id, label: f ? `${n(f.source)} → ${n(f.target)}` : 'Flow' };
  }
  if (step === 'threats' && threatId) {
    const t = a.threats.find((x) => x.id === threatId);
    return { kind: 'threat', id: threatId, label: t ? `${t.ref} ${t.title}` : 'Threat' };
  }
  if (step === 'validation' && controlId) {
    const c = a.controls.find((x) => x.id === controlId);
    return { kind: 'control', id: controlId, label: c ? `${c.ref} ${c.requirement.split(':')[0]}` : 'Control' };
  }
  return { kind: 'assessment', id: '', label: 'Whole assessment' };
}

function Comments() {
  const cloud = useTeam((s) => s.cloud)!;
  const session = useTeam((s) => s.session)!;
  const api = useTeam((s) => s.api)!;
  const target = useTarget();
  const [items, setItems] = useState<TeamComment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [scope, setScope] = useState<'here' | 'open' | 'all'>(target.kind === 'assessment' ? 'open' : 'here');
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const reload = () => api.comments(cloud.id).then(setItems, (e) => setErr(errText(e)));

  useEffect(() => {
    void reload();
    void api.members(cloud.id).then(setMembers, () => undefined);
    const stop = api.watchComments(cloud.id, () => void reload());
    const poll = setInterval(() => void reload(), 30000); // fallback if Realtime is not enabled
    return () => {
      stop();
      clearInterval(poll);
    };
  }, [cloud.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (id: string) => members.find((m) => m.user_id === id)?.display_name || members.find((m) => m.user_id === id)?.email || 'Someone';
  const shown = items.filter((c) => (scope === 'all' ? true : scope === 'open' ? !c.resolved : c.target_kind === target.kind && c.target_id === target.id));
  const mayResolve = (c: TeamComment) => c.author_id === session.user.id || canEdit(cloud.role);

  return (
    <div className="team-tab">
      <div className="seg view-toggle">
        <button type="button" className={`seg-btn ${scope === 'here' ? 'on view' : ''}`} onClick={() => setScope('here')}>
          This item
        </button>
        <button type="button" className={`seg-btn ${scope === 'open' ? 'on view' : ''}`} onClick={() => setScope('open')}>
          Open ({items.filter((c) => !c.resolved).length})
        </button>
        <button type="button" className={`seg-btn ${scope === 'all' ? 'on view' : ''}`} onClick={() => setScope('all')}>
          All ({items.length})
        </button>
      </div>
      {err && <p className="small warn">{err}</p>}
      <ul className="plain comment-list">
        {shown.map((c) => (
          <li key={c.id} className={`comment ${c.resolved ? 'resolved' : ''}`}>
            <div className="small muted">
              <strong>{name(c.author_id)}</strong> · {new Date(c.created_at).toLocaleString()} · {c.target_kind === 'assessment' ? 'whole assessment' : c.target_label}
            </div>
            <div className="comment-body">{c.body}</div>
            <div className="row gap small">
              {mayResolve(c) && (
                <button type="button" className="link" onClick={() => api.resolveComment(c.id, !c.resolved).then(reload, (e) => setErr(errText(e)))}>
                  {c.resolved ? 'Reopen' : 'Resolve'}
                </button>
              )}
              {(c.author_id === session.user.id || cloud.role === 'owner') && (
                <button type="button" className="link danger-text" onClick={() => window.confirm('Delete this comment?') && api.deleteComment(c.id).then(reload, (e) => setErr(errText(e)))}>
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
        {!shown.length && <li className="small muted">No comments here.</li>}
      </ul>
      <Field label={`Comment on: ${target.label}`}>
        <TextArea value={body} onChange={setBody} rows={3} placeholder="Ask a question or record a decision…" />
      </Field>
      <button
        type="button"
        className="btn small primary"
        disabled={!body.trim()}
        onClick={() =>
          api.addComment(cloud.id, target, body.trim(), session.user.id).then(
            () => {
              setBody('');
              void reload();
            },
            (e) => setErr(errText(e)),
          )
        }
      >
        Post comment
      </button>
    </div>
  );
}

function Members() {
  const cloud = useTeam((s) => s.cloud)!;
  const session = useTeam((s) => s.session)!;
  const api = useTeam((s) => s.api)!;
  const [items, setItems] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('reviewer');
  const [err, setErr] = useState('');
  const reload = () => api.members(cloud.id).then(setItems, (e) => setErr(errText(e)));
  useEffect(() => void reload(), [cloud.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const owner = cloud.role === 'owner';
  return (
    <div className="team-tab">
      <p className="small muted">Owners manage members. Editors change the assessment; reviewers comment and sign off; viewers read and comment.</p>
      {err && <p className="small warn">{err}</p>}
      <table className="table small">
        <tbody>
          {items.map((m) => (
            <tr key={m.user_id}>
              <td>
                {m.display_name || m.email}
                {m.user_id === session.user.id && <span className="badge">you</span>}
              </td>
              <td>
                {owner ? (
                  <select className="input" value={m.role} onChange={(e) => api.setRole(cloud.id, m.user_id, e.target.value as Role).then(reload, (er) => setErr(errText(er)))}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  ROLE_LABEL[m.role]
                )}
              </td>
              <td>
                {(owner || m.user_id === session.user.id) && (
                  <button
                    type="button"
                    className="link danger-text"
                    onClick={() => window.confirm(m.user_id === session.user.id ? 'Leave this assessment?' : `Remove ${m.email}?`) && api.removeMember(cloud.id, m.user_id).then(reload, (e) => setErr(errText(e)))}
                  >
                    {m.user_id === session.user.id ? 'Leave' : 'Remove'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {owner && (
        <>
          <h4>Add a member</h4>
          <p className="small muted">They must have signed in to the app once so their account exists.</p>
          <div className="row gap">
            <TextInput value={email} onChange={setEmail} placeholder="colleague@company.com" />
            <select className="input narrow" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small primary"
              disabled={!/^\S+@\S+\.\S+$/.test(email)}
              onClick={() =>
                api.addMember(cloud.id, email, role).then(
                  () => {
                    setEmail('');
                    setErr('');
                    void reload();
                  },
                  (e) => setErr(errText(e)),
                )
              }
            >
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SignOffPanel() {
  const cloud = useTeam((s) => s.cloud)!;
  const session = useTeam((s) => s.session)!;
  const api = useTeam((s) => s.api)!;
  const a = useStore((s) => s.assessment)!;
  const [versions, setVersions] = useState<TeamVersion[]>([]);
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');
  const reload = () =>
    Promise.all([api.versions(cloud.id), api.signoffs(cloud.id), api.members(cloud.id)]).then(
      ([v, s, m]) => {
        setVersions(v);
        setSignoffs(s);
        setMembers(m);
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => void reload(), [cloud.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id: string) => members.find((m) => m.user_id === id)?.email || 'Someone';

  return (
    <div className="team-tab">
      <p className="small muted">
        Sign-off is bound to an immutable version snapshot and its server-computed SHA-256 (Appendix D: approval bound to payload). If the assessment changes after a
        version is signed, create a new version and sign again.
      </p>
      {err && <p className="small warn">{err}</p>}
      {canEdit(cloud.role) && (
        <div className="row gap">
          <TextInput value={label} onChange={setLabel} placeholder="e.g. v1.0 for approval" />
          <button
            type="button"
            className="btn small primary"
            onClick={() =>
              useTeam
                .getState()
                .saveNow()
                .then(() => api.createVersion(a, label.trim() || `Version ${versions.length + 1}`, ''))
                .then(
                  () => {
                    setLabel('');
                    void reload();
                  },
                  (e) => setErr(errText(e)),
                )
            }
          >
            Create version for sign-off
          </button>
        </div>
      )}
      {versions.map((v) => (
        <VersionCard key={v.id} v={v} signoffs={signoffs.filter((s) => s.version_id === v.id)} name={name} canSignHere={canSign(cloud.role)} onSigned={reload} userId={session.user.id} />
      ))}
      {!versions.length && <p className="small muted">No versions yet.</p>}
    </div>
  );
}

function VersionCard({ v, signoffs, name, canSignHere, onSigned, userId }: { v: TeamVersion; signoffs: Signoff[]; name: (id: string) => string; canSignHere: boolean; onSigned: () => void; userId: string }) {
  const a = useStore((s) => s.assessment)!;
  const api = useTeam((s) => s.api)!;
  const changes = useMemo(() => diffAssessments(v.data, a).changes.length, [v, a]);
  const [role, setRole] = useState<SignRole>('security-reviewer');
  const [decision, setDecision] = useState<SignDecision>('approve');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="card version-card">
      <div className="row between wrap">
        <strong>{v.label}</strong>
        <span className="small muted">
          {new Date(v.created_at).toLocaleString()} · by {name(v.created_by)}
        </span>
      </div>
      <div className="small mono muted">SHA-256 {v.data_hash.slice(0, 16)}…</div>
      {changes > 0 ? (
        <p className="small warn">The assessment has {changes} change{changes === 1 ? '' : 's'} since this version. Sign-offs below apply to the version, not to the current state.</p>
      ) : (
        <p className="small ok">The current assessment matches this version.</p>
      )}
      <ul className="plain small">
        {signoffs.map((s) => (
          <li key={s.id}>
            <span className={`badge dec-${s.decision}`}>{DECISION_TEXT[s.decision]}</span> {SIGN_ROLE_LABEL[s.role]}: <strong>{name(s.signed_by)}</strong>, {new Date(s.signed_at).toLocaleDateString()}
            {s.comment && <div className="muted">“{s.comment}”</div>}
          </li>
        ))}
        {!signoffs.length && <li className="muted">No sign-offs yet.</li>}
      </ul>
      {canSignHere && (
        <details>
          <summary className="small">Sign this version</summary>
          <div className="grid2">
            <Field label="Signing as">
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as SignRole)}>
                {(Object.keys(SIGN_ROLE_LABEL) as SignRole[]).map((r) => (
                  <option key={r} value={r}>
                    {SIGN_ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decision">
              <select className="input" value={decision} onChange={(e) => setDecision(e.target.value as SignDecision)}>
                {(Object.keys(DECISION_TEXT) as SignDecision[]).map((d) => (
                  <option key={d} value={d}>
                    {DECISION_TEXT[d]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Conditions or comment">
            <TextArea value={comment} onChange={setComment} rows={2} />
          </Field>
          {err && <p className="small warn">{err}</p>}
          <button
            type="button"
            className="btn small primary"
            onClick={() =>
              window.confirm(`Sign "${v.label}" as ${SIGN_ROLE_LABEL[role]}: ${DECISION_TEXT[decision]}? Sign-offs cannot be edited or deleted.`) &&
              api.sign(v.assessment_id, v.id, role, decision, comment.trim(), userId).then(onSigned, (e) => setErr(errText(e)))
            }
          >
            Sign
          </button>
        </details>
      )}
    </div>
  );
}
