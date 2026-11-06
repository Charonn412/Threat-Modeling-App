import { useMemo, useState } from 'react';
import { CATALOGS } from '../library/frameworks';
import { COMPLIANCE_IDS, complianceCoverage, COVERAGE_LABEL, type CoverageStatus } from '../logic/compliance';
import { verification } from '../logic/controls';
import { useStore } from '../state/store';
import { VerificationBadge } from './ValidationPage';

/** Requirement-level traceability for the compliance frameworks. */
export function ComplianceView({ onBack }: { onBack: () => void }) {
  const a = useStore((s) => s.assessment)!;
  const selectControl = useStore((s) => s.selectControl);
  const selectThreat = useStore((s) => s.selectThreat);
  const setStep = useStore((s) => s.setStep);
  const [fw, setFw] = useState(COMPLIANCE_IDS[0]);
  const [filter, setFilter] = useState<CoverageStatus | ''>('');
  const cov = useMemo(() => complianceCoverage(a, fw), [a, fw]);
  const all = useMemo(() => Object.fromEntries(COMPLIANCE_IDS.map((id) => [id, complianceCoverage(a, id)])), [a]);
  const cat = CATALOGS.find((c) => c.id === fw)!;
  const rows = cov.rows.filter((r) => !filter || r.status === filter);

  return (
    <div className="page wide">
      <button type="button" className="btn small" onClick={onBack}>
        ← Controls
      </button>
      <h1>Compliance coverage</h1>
      <p className="small muted">
        Requirements are traced through secure patterns to controls and threats. <strong>Verified</strong> means at least one linked control passed its tests, including a
        negative test. Mappings are guidance for assessors, not a certification. Edit them under Libraries → Secure patterns.
      </p>
      <div className="cov-cards">
        {COMPLIANCE_IDS.map((id) => {
          const c = CATALOGS.find((x) => x.id === id)!;
          const v = all[id];
          const touched = v.rows.length;
          return (
            <button key={id} type="button" className={`card cov-card ${fw === id ? 'on' : ''}`} onClick={() => setFw(id)}>
              <strong>{c.short}</strong>
              <span className="small muted">{c.version}</span>
              <span className="small">
                <span className="ok">{v.verified} verified</span> · <span className="warn">{v.inProgress} in progress</span> · <span className="danger-text">{v.gaps} gaps</span>
              </span>
              <span className="small muted">{touched} of {c.items.length} items addressed</span>
            </button>
          );
        })}
      </div>
      <div className="row between wrap">
        <h2>
          {cat.name} <span className="small muted">{cat.version}</span>
        </h2>
        <select className="input narrow" value={filter} onChange={(e) => setFilter(e.target.value as CoverageStatus | '')} aria-label="Filter by status">
          <option value="">All addressed items ({cov.rows.length})</option>
          {(Object.keys(COVERAGE_LABEL) as CoverageStatus[]).map((s) => (
            <option key={s} value={s}>
              {COVERAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {cov.notAddressed > 0 && (
        <p className="small muted">
          {cov.notAddressed} items are not touched by this assessment's threats or controls. Many are organizational governance requirements outside a system threat model.
        </p>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Status</th>
              <th>Controls</th>
              <th>Threats</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item.id}>
                <td>
                  <span className="q-id">{r.item.id}</span> {r.item.name}
                </td>
                <td>
                  <span className={`badge cov-${r.status}`}>{COVERAGE_LABEL[r.status]}</span>
                </td>
                <td className="small">
                  {r.controls.map((c) => (
                    <div key={c.id} className="row gap">
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          selectControl(c.id);
                          onBack();
                        }}
                      >
                        {c.ref}
                      </button>
                      <VerificationBadge v={verification(c)} />
                    </div>
                  ))}
                  {!r.controls.length && '—'}
                </td>
                <td className="small">
                  {r.threats.slice(0, 6).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="link"
                      onClick={() => {
                        selectThreat(t.id);
                        setStep('threats');
                      }}
                    >
                      {t.ref}{' '}
                    </button>
                  ))}
                  {r.threats.length > 6 && <span className="muted">+{r.threats.length - 6}</span>}
                  {!r.threats.length && '—'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="small muted">
                  Nothing here yet. Confirm threats, choose treatments and patterns, and generate controls to build coverage.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
