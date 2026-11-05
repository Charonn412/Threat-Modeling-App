import { useMemo, useState } from 'react';
import { DOMAINS } from '../library/threatRules';
import { getPattern } from '../library/patterns';
import { autonomyReach, rating } from '../logic/risk';
import type { Level, Threat } from '../model/types';
import { useStore } from '../state/store';
import { Heatmap, RatingBadge } from './risk';

const DOMAIN_NAME = new Map(DOMAINS.map((d) => [d.id, d.name]));

export function RiskPage() {
  const a = useStore((s) => s.assessment)!;
  const selectThreat = useStore((s) => s.selectThreat);
  const setStep = useStore((s) => s.setStep);
  const m = a.settings.riskMatrix;
  const [cell, setCell] = useState<{ which: 'inherent' | 'residual'; l: Level; i: Level } | null>(null);

  const accepted = a.threats.filter((t) => t.status === 'accepted');
  const reach = autonomyReach(a);

  const issues = useMemo(() => {
    const unrated = accepted.filter((t) => !rating(m, t.inherentLikelihood, t.inherentImpact));
    const untreated = accepted.filter((t) => !t.treatment);
    const noOwner = accepted.filter((t) => t.treatment && t.treatment !== 'accept' && !t.owner);
    const badAccept = accepted.filter((t) => t.treatment === 'accept' && (!t.riskOwner || !t.reviewDate || !t.residualRationale));
    const noResidual = accepted.filter((t) => t.treatment && !rating(m, t.residualLikelihood, t.residualImpact));
    return { unrated, untreated, noOwner, badAccept, noResidual };
  }, [accepted, m]);

  const rows = [...accepted]
    .filter((t) => {
      if (!cell) return true;
      return cell.which === 'inherent' ? t.inherentLikelihood === cell.l && t.inherentImpact === cell.i : t.residualLikelihood === cell.l && t.residualImpact === cell.i;
    })
    .sort((x, y) => rating(m, y.inherentLikelihood, y.inherentImpact) - rating(m, x.inherentLikelihood, x.inherentImpact) || x.ref.localeCompare(y.ref));

  const open = (t: Threat) => {
    selectThreat(t.id);
    setStep('threats');
  };
  const candidates = a.threats.filter((t) => t.status === 'candidate').length;

  return (
    <div className="page wide">
      <h1>Stages 5–6 · Risk register & treatment</h1>
      <p className="small muted">
        Confirmed threats only. Inherent and residual risk are recorded separately (Section 9). Click a heatmap cell to filter, and a row to edit.
      </p>
      {candidates > 0 && (
        <p className="callout small">
          {candidates} candidate threat{candidates === 1 ? '' : 's'} still need review on the Threats page.{' '}
          <button type="button" className="link" onClick={() => setStep('threats')}>
            Review now
          </button>
        </p>
      )}

      <div className="risk-top">
        <Heatmap m={m} title="Inherent risk" points={accepted.map((t) => ({ l: t.inherentLikelihood, i: t.inherentImpact }))} onCell={(l, i) => setCell({ which: 'inherent', l, i })} />
        <Heatmap m={m} title="Residual risk" points={accepted.map((t) => ({ l: t.residualLikelihood, i: t.residualImpact }))} onCell={(l, i) => setCell({ which: 'residual', l, i })} />
        <div className="card reach">
          <h3>Autonomy / reach modifier</h3>
          <div className={`rating r${reach.level}`}>{m.ratingLabels[reach.level - 1]}</div>
          <p className="small muted">Section 9: informs likelihood and impact judgments. It is not a multiplier.</p>
          <ul className="small plain">
            {reach.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="card reach">
          <h3>Register health</h3>
          <ul className="small plain">
            <Issue n={issues.unrated.length} text="confirmed threats not rated" />
            <Issue n={issues.untreated.length} text="without a treatment decision" />
            <Issue n={issues.noOwner.length} text="treated but no implementation owner" />
            <Issue n={issues.noResidual.length} text="treated but residual risk not rated" />
            <Issue n={issues.badAccept.length} text="accepted risks missing owner, expiry or rationale" />
          </ul>
        </div>
      </div>

      {cell && (
        <p className="small">
          Filtered to {cell.which} likelihood {m.likelihoodLabels[cell.l - 1]} × impact {m.impactLabels[cell.i - 1]}.{' '}
          <button type="button" className="link" onClick={() => setCell(null)}>
            Clear filter
          </button>
        </p>
      )}
      <div className="table-wrap">
        <table className="table register">
          <thead>
            <tr>
              <th>ID</th>
              <th>Threat</th>
              <th>Inherent</th>
              <th>Treatment</th>
              <th>Patterns</th>
              <th>Owner / due</th>
              <th>Residual</th>
              <th>Risk owner / review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} onClick={() => open(t)} className="clickable">
                <td className="q-id">{t.ref}</td>
                <td>
                  <button type="button" className="link" onClick={() => open(t)}>
                    {t.title}
                  </button>
                  <div className="small muted">{DOMAIN_NAME.get(t.domain)}</div>
                </td>
                <td>
                  <RatingBadge m={m} l={t.inherentLikelihood} i={t.inherentImpact} />
                </td>
                <td>{t.treatment ? t.treatment.charAt(0).toUpperCase() + t.treatment.slice(1) : <span className="warn">—</span>}</td>
                <td className="small">{t.patterns.map((p) => getPattern(p)?.name).filter(Boolean).join('; ')}</td>
                <td className="small">
                  {t.owner || <span className="muted">—</span>}
                  {t.dueDate && <div className="muted">{t.dueDate}</div>}
                </td>
                <td>
                  <RatingBadge m={m} l={t.residualLikelihood} i={t.residualImpact} />
                </td>
                <td className="small">
                  {t.riskOwner || <span className="muted">—</span>}
                  {t.reviewDate && <div className="muted">{t.reviewDate}</div>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted small">
                  No confirmed threats{cell ? ' in this cell' : ''}. Confirm threats on the Threats page to build the register.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Issue({ n, text }: { n: number; text: string }) {
  return (
    <li className={n ? 'warn' : 'ok'}>
      {n ? '⚠' : '✓'} {n} {text}
    </li>
  );
}
