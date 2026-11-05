import { useMemo, useState } from 'react';
import { PATTERNS, getPattern } from '../library/patterns';
import { newTest, testFromSuggestion, threatEvidence, verification, VERIFICATION_LABEL, type Verification } from '../logic/controls';
import { rating } from '../logic/risk';
import { CONTROL_STATUS_LABEL, type Control, type ControlStatus, type EvidenceType, type TestResult, type ValidationTest } from '../model/types';
import { useStore } from '../state/store';
import { Field, TextArea, TextInput } from './controls';
import { RatingBadge } from './risk';

const EVIDENCE: { value: EvidenceType; label: string; hint: string }[] = [
  { value: 'architecture', label: 'Architecture / configuration', hint: 'Diagrams, IAM policy exports, gateway config, network rules, tool allowlists, retention settings' },
  { value: 'testing', label: 'Testing', hint: 'Authorization, cross-tenant, prompt-injection, data-leakage, tool-misuse, schema, rate-limit, failover tests' },
  { value: 'operational', label: 'Operational', hint: 'Logs, alerts, runbooks, access reviews, key rotation records, dashboards, restore exercises' },
  { value: 'governance', label: 'Governance', hint: 'Data classification, privacy review, vendor due diligence, risk acceptance, model/system cards, change records' },
];

export function VerificationBadge({ v }: { v: Verification }) {
  return <span className={`badge ver-${v}`}>{VERIFICATION_LABEL[v]}</span>;
}

export function ValidationPage() {
  const a = useStore((s) => s.assessment)!;
  const generate = useStore((s) => s.generateControls);
  const addControl = useStore((s) => s.addControl);
  const selectedId = useStore((s) => s.selectedControl);
  const select = useStore((s) => s.selectControl);
  const selectThreat = useStore((s) => s.selectThreat);
  const setStep = useStore((s) => s.setStep);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState<Verification | ''>('');

  const byVer = useMemo(() => {
    const m = new Map<Verification, number>();
    for (const c of a.controls) m.set(verification(c), (m.get(verification(c)) ?? 0) + 1);
    return m;
  }, [a.controls]);
  const unsupported = useMemo(() => a.threats.filter((t) => t.status === 'accepted' && threatEvidence(a, t).unsupportedReduction), [a]);
  const treatedWithoutControl = a.threats.filter((t) => t.status === 'accepted' && t.treatment === 'mitigate' && !a.controls.some((c) => c.threatIds.includes(t.id)));
  const list = a.controls.filter((c) => !filter || verification(c) === filter);
  const selected = a.controls.find((c) => c.id === selectedId) ?? null;

  const runGenerate = () => {
    const r = generate();
    if (!r) return;
    setMsg(r.added || r.linked ? `${r.added} controls created, ${r.linked} threat links added from treatments and patterns.` : 'Controls already cover every pattern on treated threats.');
  };

  return (
    <div className="threats">
      <aside className="threat-list">
        <div className="tl-head">
          <div className="row between">
            <h2>Controls</h2>
            <button type="button" className="btn small" onClick={runGenerate} title="Create a control per secure pattern selected on treated threats, with suggested tests">
              ↻ From treatments
            </button>
          </div>
          {msg && <p className="small muted">{msg}</p>}
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value as Verification | '')} aria-label="Filter by verification">
            <option value="">All verification states ({a.controls.length})</option>
            {(Object.keys(VERIFICATION_LABEL) as Verification[]).map((v) => (
              <option key={v} value={v}>
                {VERIFICATION_LABEL[v]} ({byVer.get(v) ?? 0})
              </option>
            ))}
          </select>
          <button type="button" className="link small" onClick={addControl}>
            + Custom control
          </button>
        </div>
        <ul className="tl-items">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className={`tl-item ${selectedId === c.id ? 'on' : ''}`} onClick={() => select(c.id)}>
                <span className="row between">
                  <span className="q-id">{c.ref}</span>
                  <VerificationBadge v={verification(c)} />
                </span>
                <span className="tl-title">{c.patternId ? getPattern(c.patternId)?.name ?? c.requirement : c.requirement || 'Untitled control'}</span>
                <span className="small muted">
                  {CONTROL_STATUS_LABEL[c.status]} · {c.threatIds.length} threat{c.threatIds.length === 1 ? '' : 's'} · {c.tests.filter((t) => t.result).length}/{c.tests.length} tests run
                </span>
              </button>
            </li>
          ))}
          {!list.length && (
            <li className="small muted pad">
              {a.controls.length ? 'No controls in this view.' : 'No controls yet. Choose treatments and secure patterns on confirmed threats, then click "From treatments".'}
            </li>
          )}
        </ul>
      </aside>
      <section className="threat-detail">
        {selected ? (
          <ControlEditor c={selected} key={selected.id} />
        ) : (
          <div className="pad-l">
            <h2>Stage 7 · Validate implementation</h2>
            <p className="small muted">
              Section 11: a control is not "implemented" just because it appears in a design, prompt, policy, vendor brochure or backlog. For each material control, record
              the validation method, expected and actual result, evidence location, test date, tester and remediation owner. Include negative tests that prove unauthorized
              behavior is denied. A control counts as <strong>Verified</strong> only when every test that has run passed and at least one negative test passed.
            </p>
            <div className="ver-summary">
              {(Object.keys(VERIFICATION_LABEL) as Verification[]).map((v) => (
                <div key={v} className="card ver-card">
                  <VerificationBadge v={v} />
                  <div className="big-num">{byVer.get(v) ?? 0}</div>
                </div>
              ))}
            </div>
            {unsupported.length > 0 && (
              <div className="callout small">
                <strong>Residual risk relies on unverified controls ({unsupported.length}).</strong> These threats have a residual rating below their inherent rating, but none
                of their controls is verified:
                <ul>
                  {unsupported.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          selectThreat(t.id);
                          setStep('threats');
                        }}
                      >
                        {t.ref} {t.title}
                      </button>{' '}
                      <RatingBadge m={a.settings.riskMatrix} l={t.inherentLikelihood} i={t.inherentImpact} /> → <RatingBadge m={a.settings.riskMatrix} l={t.residualLikelihood} i={t.residualImpact} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {treatedWithoutControl.length > 0 && (
              <p className="small warn">
                {treatedWithoutControl.length} mitigated threat{treatedWithoutControl.length === 1 ? ' has' : 's have'} no tracked control. Select secure patterns on them and
                click "From treatments", or link them to a control.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ControlEditor({ c }: { c: Control }) {
  const a = useStore((s) => s.assessment)!;
  const update = useStore((s) => s.updateControl);
  const remove = useStore((s) => s.removeControl);
  const selectThreat = useStore((s) => s.selectThreat);
  const setStep = useStore((s) => s.setStep);
  const set = (p: Partial<Control>) => update(c.id, p);
  const setTest = (id: string, p: Partial<ValidationTest>) => set({ tests: c.tests.map((t) => (t.id === id ? { ...t, ...p } : t)) });
  const v = verification(c);
  const pattern = c.patternId ? getPattern(c.patternId) : undefined;
  const confirmed = a.threats.filter((t) => t.status === 'accepted');
  const [linking, setLinking] = useState('');
  const linkable = confirmed.filter((t) => !c.threatIds.includes(t.id));
  const suggestions = (pattern?.tests ?? []).filter((m) => !c.tests.some((t) => t.method === testFromSuggestion(m).method));

  return (
    <div className="pad-l editor">
      <div className="row between wrap">
        <div>
          <span className="q-id">
            {c.ref}
            {pattern ? ` · pattern: ${pattern.name}` : ' · custom'}
          </span>
          <h2 className="row">
            Control <VerificationBadge v={v} />
          </h2>
        </div>
        <button type="button" className="btn small danger" onClick={() => window.confirm(`Delete ${c.ref} and its test records?`) && remove(c.id)}>
          Delete
        </button>
      </div>
      <Field label="Requirement / control">
        <TextArea value={c.requirement} onChange={(x) => set({ requirement: x })} rows={3} />
      </Field>
      <div className="grid3">
        <Field label="Secure pattern (Appendix D)">
          <select className="input" value={c.patternId ?? ''} onChange={(e) => set({ patternId: e.target.value || null })}>
            <option value="">— none —</option>
            {PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <TextInput value={c.owner} onChange={(x) => set({ owner: x })} />
        </Field>
        <Field label="Due date">
          <input className="input" type="date" value={c.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <Field label="Claimed status">
          <select className="input" value={c.status} onChange={(e) => set({ status: e.target.value as ControlStatus })}>
            {(Object.keys(CONTROL_STATUS_LABEL) as ControlStatus[]).map((s) => (
              <option key={s} value={s}>
                {CONTROL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Evidence type (Section 11)" hint={EVIDENCE.find((x) => x.value === c.evidenceType)?.hint}>
          <select className="input" value={c.evidenceType} onChange={(e) => set({ evidenceType: e.target.value as EvidenceType })}>
            <option value="">— select —</option>
            {EVIDENCE.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Evidence-backed status</span>
          <span>
            <VerificationBadge v={v} />
          </span>
          {c.status === 'implemented' && v !== 'verified' && v !== 'not-applicable' && <span className="field-hint warn">Claimed implemented, but not verified by tests.</span>}
        </div>
      </div>

      <h3 className="mt">Threats addressed</h3>
      <ul className="small plain">
        {c.threatIds.map((id) => {
          const t = a.threats.find((x) => x.id === id);
          if (!t) return null;
          return (
            <li key={id} className="row gap">
              <button
                type="button"
                className="link"
                onClick={() => {
                  selectThreat(id);
                  setStep('threats');
                }}
              >
                {t.ref} {t.title}
              </button>
              <RatingBadge m={a.settings.riskMatrix} l={t.inherentLikelihood} i={t.inherentImpact} />
              <button type="button" className="chip-x" aria-label={`Unlink ${t.ref}`} onClick={() => set({ threatIds: c.threatIds.filter((x) => x !== id) })}>
                ×
              </button>
            </li>
          );
        })}
        {!c.threatIds.length && <li className="muted">Not linked to any threat.</li>}
      </ul>
      {linkable.length > 0 && (
        <div className="row gap">
          <select className="input" value={linking} onChange={(e) => setLinking(e.target.value)} aria-label="Link a threat">
            <option value="">Link a confirmed threat…</option>
            {linkable
              .sort((x, y) => rating(a.settings.riskMatrix, y.inherentLikelihood, y.inherentImpact) - rating(a.settings.riskMatrix, x.inherentLikelihood, x.inherentImpact))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ref} {t.title}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn small"
            disabled={!linking}
            onClick={() => {
              set({ threatIds: [...c.threatIds, linking] });
              setLinking('');
            }}
          >
            Link
          </button>
        </div>
      )}

      <h3 className="mt">Validation tests</h3>
      {c.tests.map((t, idx) => (
        <div key={t.id} className={`card test-card res-${t.result || 'none'}`}>
          <div className="row between wrap">
            <strong className="small">
              Test {idx + 1}
              {t.negative && <span className="badge neg">negative</span>}
            </strong>
            <div className="row gap">
              <label className="small toggle">
                <input type="checkbox" checked={t.negative} onChange={(e) => setTest(t.id, { negative: e.target.checked })} /> Negative test (unauthorized behavior must be denied)
              </label>
              <button type="button" className="chip-x" aria-label={`Remove test ${idx + 1}`} onClick={() => set({ tests: c.tests.filter((x) => x.id !== t.id) })}>
                ×
              </button>
            </div>
          </div>
          <Field label="Method">
            <TextArea value={t.method} onChange={(x) => setTest(t.id, { method: x })} rows={2} />
          </Field>
          <div className="grid2">
            <Field label="Expected result">
              <TextInput value={t.expected} onChange={(x) => setTest(t.id, { expected: x })} />
            </Field>
            <Field label="Actual result">
              <TextInput value={t.actual} onChange={(x) => setTest(t.id, { actual: x })} />
            </Field>
          </div>
          <div className="grid3">
            <div className="field">
              <span className="field-label">Result</span>
              <div className="seg" role="radiogroup" aria-label={`Result of test ${idx + 1}`}>
                {(['pass', 'fail', 'blocked'] as TestResult[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={t.result === r}
                    className={`seg-btn res-${r} ${t.result === r ? 'on' : ''}`}
                    onClick={() => setTest(t.id, { result: t.result === r ? '' : r, testDate: t.testDate || new Date().toISOString().slice(0, 10) })}
                  >
                    {r === 'pass' ? 'Pass' : r === 'fail' ? 'Fail' : 'Blocked'}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Test date">
              <input className="input" type="date" value={t.testDate} onChange={(e) => setTest(t.id, { testDate: e.target.value })} />
            </Field>
            <Field label="Tester">
              <TextInput value={t.tester} onChange={(x) => setTest(t.id, { tester: x })} />
            </Field>
          </div>
          <div className="grid2">
            <Field label="Evidence location">
              <TextInput value={t.evidenceLocation} onChange={(x) => setTest(t.id, { evidenceLocation: x })} placeholder="Link, ticket, report or file path" />
            </Field>
            <Field label="Remediation owner">
              <TextInput value={t.remediationOwner} onChange={(x) => setTest(t.id, { remediationOwner: x })} />
            </Field>
          </div>
        </div>
      ))}
      <div className="row gap wrap">
        <button type="button" className="btn small" onClick={() => set({ tests: [...c.tests, newTest()] })}>
          + Add test
        </button>
        <button type="button" className="btn small" onClick={() => set({ tests: [...c.tests, newTest('', true)] })}>
          + Add negative test
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="sub-card small">
          <strong>Suggested tests for this pattern</strong>
          <ul className="plain">
            {suggestions.map((m) => (
              <li key={m} className="row between gap">
                <span>{m}</span>
                <button type="button" className="link" onClick={() => set({ tests: [...c.tests, testFromSuggestion(m)] })}>
                  Add
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3 className="mt">Residual gap</h3>
      <Field label="Remaining gap, compensating control or exception">
        <TextArea value={c.residualGap} onChange={(x) => set({ residualGap: x })} rows={2} />
      </Field>
    </div>
  );
}
