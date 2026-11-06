import { useEffect, useMemo, useState } from 'react';
import { DOMAINS } from '../library/threatRules';
import { PATTERNS, getPattern } from '../library/patterns';
import { narrative, type RefreshResult } from '../logic/threats';
import { threatEvidence, verification } from '../logic/controls';
import { findAttackPaths, SINK_LABEL, type AttackPath } from '../logic/paths';
import { atlasMitigationsFor } from '../library/frameworks';
import { VerificationBadge } from './ValidationPage';
import { rating } from '../logic/risk';
import { OBJECTIVE_LABEL, type ObjectiveId, type Threat, type ThreatStatus, type Treatment } from '../model/types';
import { useStore } from '../state/store';
import { Field, TextArea, TextInput } from './controls';
import { FrameworkTags } from './FrameworkTags';
import { LevelSelect, RatingBadge } from './risk';

const DOMAIN_NAME = new Map(DOMAINS.map((d) => [d.id, d.name]));
const STATUS_TABS: { id: ThreatStatus | 'all'; label: string }[] = [
  { id: 'candidate', label: 'Candidates' },
  { id: 'accepted', label: 'Confirmed' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
];

export function ThreatsPage() {
  const a = useStore((s) => s.assessment)!;
  const refresh = useStore((s) => s.refreshThreats);
  const selectedId = useStore((s) => s.selectedThreat);
  const select = useStore((s) => s.selectThreat);
  const addCustom = useStore((s) => s.addCustomThreat);
  const update = useStore((s) => s.updateThreat);
  const m = a.settings.riskMatrix;

  const [tab, setTab] = useState<ThreatStatus | 'all'>('candidate');
  const [view, setView] = useState<'scenarios' | 'paths'>('scenarios');
  const [pathKey, setPathKey] = useState<string | null>(null);
  const paths = useMemo(() => findAttackPaths(a), [a]);
  const selectedPath = view === 'paths' ? (paths.find((p) => p.key === pathKey) ?? null) : null;
  const [domain, setDomain] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RefreshResult | null>(null);

  // Keep threats in sync with the architecture whenever the page opens.
  useEffect(() => {
    setResult(refresh());
  }, [refresh]);

  const counts = useMemo(() => {
    const c = { candidate: 0, accepted: 0, dismissed: 0, all: a.threats.length };
    for (const t of a.threats) c[t.status] += 1;
    return c;
  }, [a.threats]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return a.threats
      .filter((t) => tab === 'all' || t.status === tab)
      .filter((t) => !domain || t.domain === domain)
      .filter((t) => !q || `${t.ref} ${t.title} ${t.frameworks.map((f) => f.id).join(' ')}`.toLowerCase().includes(q))
      .sort((x, y) => rating(m, y.inherentLikelihood, y.inherentImpact) - rating(m, x.inherentLikelihood, x.inherentImpact) || x.ref.localeCompare(y.ref));
  }, [a.threats, tab, domain, query, m]);

  const selected = a.threats.find((t) => t.id === selectedId) ?? null;

  const acceptAllVisible = () => {
    for (const t of list) if (t.status === 'candidate') update(t.id, { status: 'accepted' });
  };

  return (
    <div className={`threats ${(view === 'paths' ? selectedPath : selected) ? 'has-selection' : ''}`}>
      <aside className="threat-list">
        <div className="tl-head">
          <div className="row between">
            <h2>Threat scenarios</h2>
            <button type="button" className="btn small" onClick={() => setResult(refresh())} title="Re-run threat rules against the current architecture and answers">
              ↻ Refresh
            </button>
          </div>
          {result && (result.added > 0 || result.stale > 0 || result.removed > 0) && (
            <p className="small muted">
              Last refresh: {result.added} new · {result.stale} now stale · {result.removed} removed
            </p>
          )}
          <div className="seg view-toggle" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === 'scenarios'} className={`seg-btn ${view === 'scenarios' ? 'on view' : ''}`} onClick={() => setView('scenarios')}>
              Scenarios
            </button>
            <button type="button" role="tab" aria-selected={view === 'paths'} className={`seg-btn ${view === 'paths' ? 'on view' : ''}`} onClick={() => setView('paths')}>
              Attack paths <span className="count">{paths.length}</span>
            </button>
          </div>
          {view === 'scenarios' && (
          <>
          <div className="tabs" role="tablist">
            {STATUS_TABS.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} className={`tab ${tab === s.id ? 'on' : ''}`} onClick={() => setTab(s.id)}>
                {s.label} <span className="count">{counts[s.id]}</span>
              </button>
            ))}
          </div>
          <div className="row gap">
            <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Filter by domain">
              <option value="">All domains (Appendix C)</option>
              {DOMAINS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Search title, ID, tag…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search threats" />
          </div>
          <div className="row between">
            <button type="button" className="link small" onClick={addCustom}>
              + Custom threat
            </button>
            {tab === 'candidate' && list.length > 0 && (
              <button type="button" className="link small" onClick={acceptAllVisible}>
                Confirm all {list.length} shown
              </button>
            )}
          </div>
          </>
          )}
          {view === 'paths' && (
            <p className="small muted">
              Multi-step chains from attacker-reachable inputs, through an AI component, to a high-impact action, crossing a trust boundary. Add a path as a threat scenario
              to assess it.
            </p>
          )}
        </div>
        {view === 'paths' ? (
          <ul className="tl-items">
            {paths.map((p) => {
              const added = a.threats.some((t) => t.signature === `PATH:${p.key}`);
              return (
                <li key={p.key}>
                  <button type="button" className={`tl-item ${pathKey === p.key ? 'on' : ''}`} onClick={() => setPathKey(p.key)}>
                    <span className="row between">
                      <span className="q-id">{SINK_LABEL[p.category]}</span>
                      <span className="row">
                        {added && <span className="badge">added</span>}
                        <span className={`rating r${p.severity}`}>{m.ratingLabels[p.severity - 1]}</span>
                      </span>
                    </span>
                    <span className="tl-title">{p.steps.map((id) => a.components.find((c) => c.id === id)?.name).join(' → ')}</span>
                    <span className="small muted">
                      {p.steps.length - 1} hops · {p.boundaries.length} boundar{p.boundaries.length === 1 ? 'y' : 'ies'}
                      {p.gated ? ' · approval gate' : ''}
                      {p.guarded ? ' · guardrail' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
            {!paths.length && <li className="small muted pad">No attack paths found. Paths need an attacker-reachable source, an AI component and a high-impact sink connected by flows across a trust boundary.</li>}
          </ul>
        ) : (
        <ul className="tl-items">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" className={`tl-item ${selectedId === t.id ? 'on' : ''} st-${t.status}`} onClick={() => select(t.id)}>
                <span className="row between">
                  <span className="q-id">{t.ref}</span>
                  <span className="row">
                    {t.stale && <span className="badge warn-b">stale</span>}
                    {!t.ruleId && <span className="badge">custom</span>}
                    <RatingBadge m={m} l={t.inherentLikelihood} i={t.inherentImpact} />
                  </span>
                </span>
                <span className="tl-title">{t.title || 'Untitled threat'}</span>
                <span className="small muted">{DOMAIN_NAME.get(t.domain)}</span>
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="small muted pad">
              {a.components.length === 0 ? 'Build the architecture first. Threats are generated from components, flows and boundaries.' : 'No threats in this view.'}
            </li>
          )}
        </ul>
        )}
      </aside>
      <section className="threat-detail">
        {view === 'paths' ? (
          selectedPath ? (
            <PathDetail p={selectedPath} onBack={() => setPathKey(null)} onAdded={() => setView('scenarios')} />
          ) : (
            <Overview />
          )
        ) : selected ? (
          <ThreatEditor t={selected} key={selected.id} />
        ) : (
          <Overview />
        )}
      </section>
    </div>
  );
}

function Overview() {
  const a = useStore((s) => s.assessment)!;
  return (
    <div className="pad-l">
      <h2>Stage 4 · Identify threats and abuse cases</h2>
      <p className="small muted">
        Threat rules walk every component, flow and trust boundary in your architecture (Appendix C domains). Answers and intake shape the suggested ratings. Each candidate
        is mapped to OWASP (AI and traditional lists), MITRE ATLAS, MITRE ATT&CK and STRIDE.
      </p>
      <ul className="small help">
        <li>
          <strong>Confirm</strong> a candidate if it is plausible for this system. <strong>Dismiss</strong> it with a reason if it is not. A dismissed threat is
          still recorded. Confirmed threats go to the risk register.
        </li>
        <li>Edit any field. Refresh never overwrites a scenario you have edited, and a threat whose architecture element is gone is marked <em>stale</em>.</li>
        <li>Add custom threats for anything the rules don't cover.</li>
      </ul>
      <h3 className="mt">Assessed against</h3>
      <table className="table small">
        <tbody>
          {Object.entries(a.frameworkVersions).map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TREATMENTS: { value: Treatment; label: string; hint: string }[] = [
  { value: 'avoid', label: 'Avoid', hint: 'Remove the capability, data, exposure or action authority.' },
  { value: 'mitigate', label: 'Mitigate', hint: 'Architectural first (isolation, authorization outside the model), then operational.' },
  { value: 'transfer', label: 'Transfer', hint: 'Contract or insurance. Does not replace technical controls.' },
  { value: 'accept', label: 'Accept risk', hint: 'Requires rationale, business risk owner, expiry/review date and compensating controls.' },
];

function ThreatEditor({ t }: { t: Threat }) {
  const a = useStore((s) => s.assessment)!;
  const update = useStore((s) => s.updateThreat);
  const remove = useStore((s) => s.removeThreat);
  const selectArch = useStore((s) => s.select);
  const setStep = useStore((s) => s.setStep);
  const m = a.settings.riskMatrix;
  const set = (patch: Partial<Threat>) => update(t.id, patch);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState(t.dismissReason);

  const comps = t.componentIds.map((id) => a.components.find((c) => c.id === id)).filter(Boolean);
  const goTo = (id: string) => {
    selectArch({ kind: 'component', id });
    setStep('architecture');
  };
  const acceptWarnings =
    t.treatment === 'accept' ? [!t.residualRationale && 'rationale', !t.riskOwner && 'risk owner', !t.reviewDate && 'expiry/review date'].filter(Boolean) : [];

  return (
    <div className="pad-l editor">
      <button type="button" className="btn small mobile-back" onClick={() => useStore.getState().selectThreat(null)}>
        ← All threats
      </button>
      <div className="row between wrap">
        <div>
          <span className="q-id">
            {t.ref}
            {t.ruleId ? ` · rule ${t.ruleId}` : ' · custom'}
          </span>
          <h2>{t.title || 'Untitled threat'}</h2>
        </div>
        <div className="row gap">
          {t.status !== 'accepted' && (
            <button type="button" className="btn small primary" onClick={() => set({ status: 'accepted', dismissReason: '' })}>
              Confirm threat
            </button>
          )}
          {t.status !== 'dismissed' && (
            <button type="button" className="btn small" onClick={() => setDismissing(true)}>
              Dismiss…
            </button>
          )}
          {t.status !== 'candidate' && t.ruleId && (
            <button type="button" className="btn small" onClick={() => set({ status: 'candidate' })}>
              Back to candidates
            </button>
          )}
          {!t.ruleId && (
            <button type="button" className="btn small danger" onClick={() => window.confirm(`Delete ${t.ref}?`) && remove(t.id)}>
              Delete
            </button>
          )}
        </div>
      </div>
      {t.stale && <p className="callout small">The architecture element this threat was generated from is gone. Your work is kept. Review it, then dismiss or update it.</p>}
      {t.status === 'dismissed' && t.dismissReason && (
        <p className="small muted">
          Dismissed: <em>{t.dismissReason}</em>
        </p>
      )}
      {dismissing && (
        <div className="card">
          <Field label="Why is this not applicable or not plausible?">
            <TextInput value={reason} onChange={setReason} placeholder="e.g. Component is read-only; no write scopes granted (evidence: IAM export)" />
          </Field>
          <div className="row gap">
            <button
              type="button"
              className="btn small primary"
              disabled={!reason.trim()}
              onClick={() => {
                set({ status: 'dismissed', dismissReason: reason.trim() });
                setDismissing(false);
              }}
            >
              Dismiss threat
            </button>
            <button type="button" className="btn small" onClick={() => setDismissing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="narrative">{narrative(t, a)}</div>

      <h3 className="mt">Scenario (Appendix E)</h3>
      <Field label="Title">
        <TextInput value={t.title} onChange={(v) => set({ title: v })} />
      </Field>
      <div className="grid2">
        <Field label="Threat domain (Appendix C)">
          <select className="input" value={t.domain} onChange={(e) => set({ domain: e.target.value })}>
            {DOMAINS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Component / flow / boundary</span>
          <span className="chips">
            {comps.map((c) => (
              <button key={c!.id} type="button" className="chip" onClick={() => goTo(c!.id)} title="Open in architecture">
                {c!.name}
              </button>
            ))}
            {!comps.length && <span className="small muted">System-wide</span>}
          </span>
        </div>
        <Field label="Threat actor / source">
          <TextInput value={t.actor} onChange={(v) => set({ actor: v })} />
        </Field>
        <Field label="Asset at risk">
          <TextInput value={t.asset} onChange={(v) => set({ asset: v })} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Security objectives affected</span>
        <span className="chips">
          {(Object.keys(OBJECTIVE_LABEL) as ObjectiveId[]).map((o) => {
            const on = t.objectives.includes(o);
            return (
              <button key={o} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ objectives: on ? t.objectives.filter((x) => x !== o) : [...t.objectives, o] })}>
                {OBJECTIVE_LABEL[o]}
              </button>
            );
          })}
        </span>
      </div>
      <Field label="Preconditions">
        <TextArea value={t.preconditions} onChange={(v) => set({ preconditions: v })} rows={2} />
      </Field>
      <Field label="Attack path (steps and trust-boundary crossings)">
        <TextArea value={t.attackPath} onChange={(v) => set({ attackPath: v })} rows={5} />
      </Field>
      <Field label="Impact">
        <TextArea value={t.impact} onChange={(v) => set({ impact: v })} rows={2} />
      </Field>

      <h3 className="mt">Framework mappings</h3>
      <FrameworkTags value={t.frameworks} onChange={(v) => set({ frameworks: v })} />
      <AtlasMitigations t={t} />

      <h3 className="mt">Existing controls & inherent risk (Stage 5)</h3>
      <div className="grid2">
        <Field label="Existing controls">
          <TextArea value={t.existingControls} onChange={(v) => set({ existingControls: v })} rows={2} />
        </Field>
        <Field label="Evidence (reference, test date, limitations)">
          <TextArea value={t.evidence} onChange={(v) => set({ evidence: v })} rows={2} />
        </Field>
      </div>
      <div className="grid3 align-end">
        <LevelSelect label="Inherent likelihood" value={t.inherentLikelihood} onChange={(v) => set({ inherentLikelihood: v })} labels={m.likelihoodLabels} />
        <LevelSelect label="Inherent impact" value={t.inherentImpact} onChange={(v) => set({ inherentImpact: v })} labels={m.impactLabels} />
        <div className="field">
          <span className="field-label">Inherent rating</span>
          <RatingBadge m={m} l={t.inherentLikelihood} i={t.inherentImpact} />
        </div>
      </div>
      {(t.ratingSuggested || t.signals.length > 0) && (
        <div className="small muted rationale">
          {t.ratingSuggested && <div>Suggested rating. It updates automatically until you change it.</div>}
          {t.ratingRationale && <div>{t.ratingRationale}</div>}
          {t.signals.length > 0 && (
            <ul>
              {t.signals.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h3 className="mt">Treatment & secure patterns (Stage 6)</h3>
      <div className="chips">
        {TREATMENTS.map((x) => (
          <button key={x.value} type="button" className={`chip ${t.treatment === x.value ? 'on' : ''}`} title={x.hint} onClick={() => set({ treatment: t.treatment === x.value ? '' : x.value })}>
            {x.label}
          </button>
        ))}
      </div>
      {t.treatment && <p className="small muted">{TREATMENTS.find((x) => x.value === t.treatment)?.hint}</p>}
      <div className="field">
        <span className="field-label">Secure patterns (Appendix D)</span>
        <span className="chips">
          {PATTERNS.map((p) => {
            const on = t.patterns.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                title={`${p.outcome}\nASVS 5.0: ${p.asvs.join(', ')}`}
                onClick={() => set({ patterns: on ? t.patterns.filter((x) => x !== p.id) : [...t.patterns, p.id] })}
              >
                {p.name}
              </button>
            );
          })}
        </span>
      </div>
      {t.patterns.length > 0 && (
        <ul className="small pattern-list">
          {t.patterns.map((id) => {
            const p = getPattern(id);
            return p ? (
              <li key={id}>
                <strong>{p.name}:</strong> {p.outcome} <span className="muted">(ASVS 5.0: {p.asvs.join(', ')})</span>
              </li>
            ) : null;
          })}
        </ul>
      )}
      <Field label="Security requirements / design changes">
        <TextArea value={t.requirements} onChange={(v) => set({ requirements: v })} rows={3} />
      </Field>
      <div className="grid3">
        <Field label="Implementation owner">
          <TextInput value={t.owner} onChange={(v) => set({ owner: v })} />
        </Field>
        <Field label="Due date">
          <input className="input" type="date" value={t.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <Field label="Validation notes">
          <TextInput value={t.validation} onChange={(v) => set({ validation: v })} />
        </Field>
      </div>
      <ControlsForThreat t={t} />

      <h3 className="mt">Residual risk</h3>
      <div className="grid3 align-end">
        <LevelSelect label="Residual likelihood" value={t.residualLikelihood} onChange={(v) => set({ residualLikelihood: v })} labels={m.likelihoodLabels} />
        <LevelSelect label="Residual impact" value={t.residualImpact} onChange={(v) => set({ residualImpact: v })} labels={m.impactLabels} />
        <div className="field">
          <span className="field-label">Residual rating</span>
          <RatingBadge m={m} l={t.residualLikelihood} i={t.residualImpact} />
        </div>
      </div>
      <Field label="Residual rationale">
        <TextArea value={t.residualRationale} onChange={(v) => set({ residualRationale: v })} rows={2} />
      </Field>
      <div className="grid2">
        <Field label="Business risk owner">
          <TextInput value={t.riskOwner} onChange={(v) => set({ riskOwner: v })} />
        </Field>
        <Field label="Expiry / review date">
          <input className="input" type="date" value={t.reviewDate} onChange={(e) => set({ reviewDate: e.target.value })} />
        </Field>
      </div>
      {acceptWarnings.length > 0 && <p className="small warn">Risk acceptance needs: {acceptWarnings.join(', ')} (Section 10).</p>}
    </div>
  );
}

function ControlsForThreat({ t }: { t: Threat }) {
  const a = useStore((s) => s.assessment)!;
  const selectControl = useStore((s) => s.selectControl);
  const setStep = useStore((s) => s.setStep);
  const ev = threatEvidence(a, t);
  if (!ev.controls.length && t.treatment !== 'mitigate') return null;
  return (
    <div className="field">
      <span className="field-label">Controls and evidence (Stage 7)</span>
      {ev.controls.length ? (
        <ul className="small plain">
          {ev.controls.map((c) => (
            <li key={c.id} className="row gap">
              <button
                type="button"
                className="link"
                onClick={() => {
                  selectControl(c.id);
                  setStep('validation');
                }}
              >
                {c.ref} {c.requirement.split(':')[0]}
              </button>
              <VerificationBadge v={verification(c)} />
            </li>
          ))}
        </ul>
      ) : (
        <span className="small muted">No tracked controls yet. Select patterns, then use "From treatments" on the Validation page.</span>
      )}
      {ev.unsupportedReduction && <span className="field-hint warn">The residual rating is lower than inherent, but no linked control is verified yet.</span>}
    </div>
  );
}

function PathDetail({ p, onBack, onAdded }: { p: AttackPath; onBack: () => void; onAdded: () => void }) {
  const a = useStore((s) => s.assessment)!;
  const addFromPath = useStore((s) => s.addThreatFromPath);
  const m = a.settings.riskMatrix;
  const name = (id: string) => a.components.find((c) => c.id === id)?.name ?? '?';
  const existing = a.threats.find((t) => t.signature === `PATH:${p.key}`);
  return (
    <div className="pad-l editor">
      <button type="button" className="btn small mobile-back" onClick={onBack}>
        ← All paths
      </button>
      <span className="q-id">Attack path</span>
      <h2 className="row wrap">
        {SINK_LABEL[p.category]} <span className={`rating r${p.severity}`}>{m.ratingLabels[p.severity - 1]}</span>
      </h2>
      <ol className="path-steps">
        {p.steps.map((id, i) => (
          <li key={id} className={p.pivots.includes(id) ? 'pivot' : i === p.steps.length - 1 ? 'sink' : i === 0 ? 'source' : ''}>
            {name(id)}
            {i === 0 && <span className="badge">attacker input</span>}
            {p.pivots.includes(id) && <span className="badge">AI interprets content</span>}
            {i === p.steps.length - 1 && <span className="badge warn-b">impact</span>}
          </li>
        ))}
      </ol>
      <p className="small">
        Crosses: {p.boundaries.map((b) => a.boundaries.find((x) => x.id === b)?.name).join(', ')}
        {p.dataLevel && ` · ${p.dataLevel} data on the path`}
      </p>
      <p className="small muted">
        {p.gated ? 'An approval gate is on this path, which lowers the severity. Confirm the approval is bound to the exact payload (Appendix D).' : 'No approval gate on this path: nothing deterministic stops the final action.'}
        {p.guarded ? ' A guardrail is on the path. Guardrails reduce likelihood but are not a security boundary.' : ''}
      </p>
      {existing ? (
        <button type="button" className="btn small" onClick={() => { useStore.getState().selectThreat(existing.id); onAdded(); }}>
          Open {existing.ref}
        </button>
      ) : (
        <button type="button" className="btn small primary" onClick={() => { addFromPath(p); onAdded(); }}>
          Add as threat scenario
        </button>
      )}
    </div>
  );
}

function AtlasMitigations({ t }: { t: Threat }) {
  const items = atlasMitigationsFor(t.frameworks.filter((f) => f.fw === 'atlas').map((f) => f.id));
  if (!items.length) return null;
  return (
    <details className="sub-card small">
      <summary>
        <strong>MITRE ATLAS mitigations</strong> for the mapped techniques ({items.length})
      </summary>
      <ul className="plain">
        {items.map(({ mitigation: m, how }) => (
          <li key={m.id} className="mitigation">
            <span className="q-id">{m.id}</span> <strong>{m.name}</strong>
            {m.categories.length > 0 && <span className="muted"> · {m.categories.join(', ')}</span>}
            {how.slice(0, 2).map((h) => (
              <div key={h} className="muted">
                {h}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}
