import { useMemo, useState } from 'react';
import { computeGaps, completeness, type Gap } from '../logic/analysis';
import { TIER_LABEL } from '../model/types';
import { useStore } from '../state/store';
import { Progress } from './controls';
import { useTier } from './hooks';
import { overallPosture, weakAnswers } from '../logic/posture';

const SECTIONS: { kind: Gap['kind']; title: string; help: string }[] = [
  { kind: 'unknown', title: 'Unknowns (tracked gaps)', help: '"Unknown" is a tracked gap, not an implicit pass. Each one needs an owner and a resolution date (Part II).' },
  { kind: 'boundary-crossing-unlabeled', title: 'Boundary-crossing flows missing labels', help: 'Flows that cross a trust boundary must carry classification, protocol, authentication, encryption, origin and trust level (Section 7).' },
  { kind: 'flow-labels', title: 'Other flows missing labels', help: 'Label each flow so a request can be traced from entry to final effect.' },
  { kind: 'isolated', title: 'Components with no flows', help: 'Every component should be connected to the flows that reach it.' },
  { kind: 'unanswered', title: 'Unanswered questions', help: 'Mark each as Yes, No, N/A or Unknown and explain the answer.' },
];

export function GapsPage() {
  const a = useStore((s) => s.assessment)!;
  const select = useStore((s) => s.select);
  const setStep = useStore((s) => s.setStep);
  const tier = useTier();
  const gaps = useMemo(() => computeGaps(a, tier), [a, tier]);
  const c = completeness(a, tier);
  const [openUnanswered, setOpenUnanswered] = useState(false);

  const go = (g: Gap) => {
    const isFlow = g.kind === 'flow-labels' || g.kind === 'boundary-crossing-unlabeled';
    select({ kind: isFlow ? 'flow' : 'component', id: g.targetId });
    setStep('architecture');
  };

  return (
    <div className="page">
      <h1>Gaps & unknowns</h1>
      <p className="muted small">
        {TIER_LABEL[tier]} tier · {c.percent}% complete. Select an item to jump to it in the architecture.
      </p>
      <Progress value={c.percent} />
      <WeakAnswers />
      {SECTIONS.map((sec) => {
        const items = gaps.filter((g) => g.kind === sec.kind);
        const collapsible = sec.kind === 'unanswered';
        return (
          <section key={sec.kind} className="card">
            <div className="row between">
              <h2>
                {sec.title} <span className="count">{items.length}</span>
              </h2>
              {collapsible && items.length > 0 && (
                <button type="button" className="link small" onClick={() => setOpenUnanswered(!openUnanswered)}>
                  {openUnanswered ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
            <p className="small muted">{sec.help}</p>
            {items.length === 0 ? (
              <p className="small ok">None.</p>
            ) : (
              (!collapsible || openUnanswered) && (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Where</th>
                      <th>Detail</th>
                      {sec.kind === 'unknown' && <th>Owner</th>}
                      {sec.kind === 'unknown' && <th>Due</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((g, i) => (
                      <tr key={`${g.targetId}-${g.questionId ?? i}`}>
                        <td>
                          <button type="button" className="link" onClick={() => go(g)}>
                            {g.targetName}
                          </button>
                        </td>
                        <td>
                          {g.questionId && <span className="q-id">{g.questionId}</span>} {g.detail}
                        </td>
                        {sec.kind === 'unknown' && <td className={g.owner ? '' : 'warn'}>{g.owner || 'unassigned'}</td>}
                        {sec.kind === 'unknown' && <td className={g.dueDate ? '' : 'warn'}>{g.dueDate || 'no date'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

function WeakAnswers() {
  const a = useStore((s) => s.assessment)!;
  const select = useStore((s) => s.select);
  const setStep = useStore((s) => s.setStep);
  const weak = weakAnswers(a);
  const p = overallPosture(a);
  return (
    <section className="card">
      <h2>
        Weak answers (security findings) <span className="count">{weak.length}</span>
      </h2>
      <p className="small muted">
        Answers that indicate a weakness: the secure answer is the opposite. They raise the suggested likelihood of related threats.
        {p.score !== null && ` Overall posture: ${p.score}% secure (${p.secure} secure, ${p.weak} weak, ${p.gap} unknown).`}
      </p>
      {weak.length === 0 ? (
        <p className="small ok">None recorded.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Finding</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {weak.map((w) => (
              <tr key={`${w.component.id}-${w.question.id}`}>
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      select({ kind: 'component', id: w.component.id });
                      setStep('architecture');
                    }}
                  >
                    {w.component.name}
                  </button>
                </td>
                <td>
                  <span className="q-id">{w.question.id}</span> {w.question.text} <strong className="danger-text">{w.answer.status === 'yes' ? 'Yes' : 'No'}</strong>
                </td>
                <td className="small">{w.answer.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
