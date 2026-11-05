import { getComponentType } from '../library/catalog';
import { OBJECTIVE_LABEL, type ObjectiveId, type Objectives } from '../model/types';
import { useStore } from '../state/store';

/** Section 8: required design question and baseline expectation per objective. */
const OBJECTIVES: { id: ObjectiveId; question: string; baseline: string }[] = [
  { id: 'confidentiality', question: 'Can prompts, context, retrieved records, model outputs, logs, embeddings or provider telemetry expose sensitive data across users, tenants, tools or providers?', baseline: 'Data is only disclosed to principals entitled to it. Enforce data minimization, access checks, isolation, encryption and retention controls across prompts, context, retrieval, outputs, logs and provider processing.' },
  { id: 'integrity', question: 'Can untrusted content, poisoned data, model outputs, tools or agents alter authoritative data or decisions?', baseline: 'Authoritative data and decisions change only through validated, independently authorized operations. Inputs and outputs are validated; model output never authorizes a state change.' },
  { id: 'availability', question: 'Can prompt flooding, recursive agents, oversized context, expensive tools, provider failure or dependency exhaustion degrade service?', baseline: 'Service remains within agreed SLOs under abuse and dependency failure. Apply quotas, budgets, timeouts, circuit breakers and graceful degradation.' },
  { id: 'identity', question: 'Can every user, service, agent, tool and approver be authenticated and attributed?', baseline: 'Every action is attributable to an authenticated principal. Use unique workload identities, scoped credentials, traceable actions and auditable delegation.' },
  { id: 'safety', question: 'Could an output or action cause material harm?', baseline: 'Autonomy is bounded. Consequential actions require approval; the system supports stop/rollback and fails to a defined safe state.' },
  { id: 'privacy', question: 'Are purpose, consent/notice, minimization, retention, data residency, rights handling and third-party processing understood and approved?', baseline: 'Personal data is processed only for the approved purpose, minimized, retained per policy, kept in approved regions, and subject rights can be honored.' },
  { id: 'transparency', question: 'Can users understand when AI is involved, the limits of outputs, sources used, and how to challenge or escalate consequential outcomes?', baseline: 'Users are told when AI is used and its limits; sources are cited where appropriate; consequential outcomes can be challenged and escalated to a human.' },
];

export function ObjectivesPage() {
  const a = useStore((s) => s.assessment)!;
  const update = useStore((s) => s.updateObjectives);
  const setStep = useStore((s) => s.setStep);
  const o = a.objectives;

  const actionCandidates = a.components.filter((c) => ['downstream_action', 'tool_connector', 'mcp_server', 'code_sandbox', 'browser_automation', 'enterprise_api'].includes(c.type));
  const listed = (o.neverDo + '\n' + o.withApproval + '\n' + o.autonomous).toLowerCase();

  const append = (key: 'neverDo' | 'withApproval' | 'autonomous', line: string) => {
    const cur = o[key].trim();
    update({ [key]: cur ? `${cur}\n${line}` : line } as Partial<Objectives>);
  };

  return (
    <div className="page">
      <h1>Stage 3 · Security objectives</h1>
      <p className="muted small">
        Translate business needs into security objectives (Section 8). Then define what the system must never do, what it may do only with approval, and what it may do on
        its own.
      </p>

      <section className="card">
        <h2>Action authority</h2>
        {a.intake.prohibitedUses && (
          <p className="small">
            <strong>Prohibited uses (from intake):</strong> {a.intake.prohibitedUses}
          </p>
        )}
        {actionCandidates.length > 0 && (
          <div className="small">
            <span className="muted">Capabilities and effects in the architecture, so you can classify each one:</span>
            <div className="chips mt-s">
              {actionCandidates.map((c) => {
                const done = listed.includes(c.name.toLowerCase());
                return (
                  <span key={c.id} className={`chip static ${done ? 'on' : ''}`} title={getComponentType(c.type).label}>
                    {getComponentType(c.type).glyph} {c.name}
                    {!done && (
                      <>
                        {' '}
                        <button type="button" className="link tiny" onClick={() => append('neverDo', `${c.name}: `)}>
                          never
                        </button>{' '}
                        <button type="button" className="link tiny" onClick={() => append('withApproval', `${c.name}: `)}>
                          approval
                        </button>{' '}
                        <button type="button" className="link tiny" onClick={() => append('autonomous', `${c.name}: `)}>
                          autonomous
                        </button>
                      </>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div className="grid3">
          <label className="field">
            <span className="field-label">Must never do</span>
            <textarea className="input" rows={6} value={o.neverDo} onChange={(e) => update({ neverDo: e.target.value })} placeholder="One per line, e.g. Delete customer records" />
          </label>
          <label className="field">
            <span className="field-label">Only with approval</span>
            <textarea className="input" rows={6} value={o.withApproval} onChange={(e) => update({ withApproval: e.target.value })} placeholder="e.g. Issue refunds over $100" />
          </label>
          <label className="field">
            <span className="field-label">May do autonomously</span>
            <textarea className="input" rows={6} value={o.autonomous} onChange={(e) => update({ autonomous: e.target.value })} placeholder="e.g. Read knowledge articles" />
          </label>
        </div>
      </section>

      {OBJECTIVES.map((obj) => (
        <section key={obj.id} className="card">
          <div className="row between">
            <h2>{OBJECTIVE_LABEL[obj.id]}</h2>
            {!o.statements[obj.id] && (
              <button type="button" className="btn small" onClick={() => update({ statements: { ...o.statements, [obj.id]: obj.baseline } })}>
                Insert baseline
              </button>
            )}
          </div>
          <p className="small muted">{obj.question}</p>
          <textarea
            className="input"
            rows={3}
            aria-label={`${OBJECTIVE_LABEL[obj.id]} objective`}
            value={o.statements[obj.id]}
            onChange={(e) => update({ statements: { ...o.statements, [obj.id]: e.target.value } })}
            placeholder="Objective for this system…"
          />
        </section>
      ))}
      <div className="row end">
        <button type="button" className="btn primary" onClick={() => setStep('threats')}>
          Continue to threats →
        </button>
      </div>
    </div>
  );
}
