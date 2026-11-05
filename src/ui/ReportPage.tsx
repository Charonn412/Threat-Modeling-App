import { useMemo, useState } from 'react';
import { buildReport, defaultReportOptions, SECTIONS, type ReportOptions } from '../report/build';
import type { Block, Cell } from '../report/blocks';
import { DECISION_LABEL, REASSESSMENT_TRIGGERS, type Decision, type SignOff } from '../model/types';
import { definitionOfDone } from '../logic/controls';
import { useTier } from './hooks';
import { useStore } from '../state/store';
import { Field, TextArea, TextInput } from './controls';
import { downloadBlob, fileBase } from '../io/file';

export function ReportPage() {
  const a = useStore((s) => s.assessment)!;
  const update = useStore((s) => s.updateSignOff);
  const [opts, setOpts] = useState<ReportOptions>(defaultReportOptions);
  const [busy, setBusy] = useState<'' | 'pdf' | 'docx'>('');
  const [error, setError] = useState('');
  const blocks = useMemo(() => buildReport(a, opts), [a, opts]);
  const title = `${a.intake.systemName || 'Untitled AI system'}: AI threat model`;
  const s = a.signOff;
  const set = (patch: Partial<SignOff>) => update(patch);
  const tier = useTier();
  const dod = useMemo(() => definitionOfDone(a, tier), [a, tier]);

  const exportPdf = async () => {
    setBusy('pdf');
    setError('');
    try {
      const { renderPdf } = await import('../report/pdf');
      downloadBlob(`${fileBase(a)}-threat-model.pdf`, await renderPdf(buildReport(a, opts), title));
    } catch (e) {
      setError(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };
  const exportDocx = async () => {
    setBusy('docx');
    setError('');
    try {
      const { renderDocx, svgToPng } = await import('../report/docx');
      const b = buildReport(a, opts);
      const pngs = await Promise.all(b.filter((x): x is Extract<Block, { t: 'diagram' }> => x.t === 'diagram').map((x) => svgToPng(x.svg, x.width, x.height)));
      downloadBlob(`${fileBase(a)}-threat-model.docx`, await renderDocx(b, title, pngs));
    } catch (e) {
      setError(`Word export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="report-page">
      <aside className="report-side no-print">
        <h2>Report</h2>
        <div className="col gap">
          <button type="button" className="btn primary block" onClick={exportPdf} disabled={!!busy}>
            {busy === 'pdf' ? 'Building PDF…' : '⬇ Download PDF'}
          </button>
          <button type="button" className="btn primary block" onClick={exportDocx} disabled={!!busy}>
            {busy === 'docx' ? 'Building Word…' : '⬇ Download Word (.docx)'}
          </button>
          <button type="button" className="btn block" onClick={() => window.print()}>
            🖨 Print
          </button>
          {error && <p className="small warn">{error}</p>}
          <p className="small muted">Generated in your browser. Nothing is uploaded.</p>
        </div>

        <h3 className="mt">
          Definition of done ({dod.filter((d) => d.done).length}/{dod.length})
        </h3>
        <ul className="small plain dod">
          {dod.map((d) => (
            <li key={d.label} title={d.label}>
              <span className={d.done ? 'ok' : 'warn'}>{d.done ? '✓' : '○'}</span> {d.label.split(';')[0].split(',')[0].replace(/\.$/, '')}
              {!d.done && <div className="muted">{d.detail}</div>}
            </li>
          ))}
        </ul>

        <h3 className="mt">Sections</h3>
        {SECTIONS.map((sec) => (
          <label key={sec.id} className="small toggle block-label">
            <input type="checkbox" checked={opts.sections[sec.id]} onChange={(e) => setOpts({ ...opts, sections: { ...opts.sections, [sec.id]: e.target.checked } })} /> {sec.title}
          </label>
        ))}
        <h3 className="mt">Options</h3>
        <label className="small toggle block-label">
          <input type="checkbox" checked={opts.includeDismissed} onChange={(e) => setOpts({ ...opts, includeDismissed: e.target.checked })} /> Include dismissed threats with reasons
        </label>
        <label className="small toggle block-label">
          <input type="checkbox" checked={opts.includeUnanswered} onChange={(e) => setOpts({ ...opts, includeUnanswered: e.target.checked })} /> Include unanswered questions
        </label>

        <h3 className="mt">Approval & sign-off (Appendix H)</h3>
        <Field label="Assessment ID">
          <TextInput value={s.assessmentId} onChange={(v) => set({ assessmentId: v })} />
        </Field>
        <div className="grid2">
          <Field label="Version">
            <TextInput value={s.version} onChange={(v) => set({ version: v })} />
          </Field>
          <Field label="Assessment date">
            <input className="input" type="date" value={s.assessmentDate} onChange={(e) => set({ assessmentDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Business owner / accountable executive">
          <TextInput value={s.businessOwner} onChange={(v) => set({ businessOwner: v })} placeholder={a.intake.owner} />
        </Field>
        <Field label="Technical owner / architect">
          <TextInput value={s.technicalOwner} onChange={(v) => set({ technicalOwner: v })} />
        </Field>
        <Field label="Security reviewer / facilitator">
          <TextInput value={s.securityReviewer} onChange={(v) => set({ securityReviewer: v })} />
        </Field>
        <Field label="Privacy / Legal / Risk reviewers">
          <TextInput value={s.privacyLegalRisk} onChange={(v) => set({ privacyLegalRisk: v })} />
        </Field>
        <Field label="Decision (Section 12)">
          <select className="input" value={s.decision} onChange={(e) => set({ decision: e.target.value as Decision })}>
            <option value="">Not yet decided</option>
            {(Object.keys(DECISION_LABEL) as Exclude<Decision, ''>[]).map((d) => (
              <option key={d} value={d}>
                {DECISION_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Residual risk acceptance authority">
          <TextInput value={s.acceptanceAuthority} onChange={(v) => set({ acceptanceAuthority: v })} />
        </Field>
        <Field label="Conditions and expiry">
          <TextArea value={s.conditions} onChange={(v) => set({ conditions: v })} rows={2} />
        </Field>
        <div className="grid2">
          <Field label="Reassessment date">
            <input className="input" type="date" value={s.reassessmentDate} onChange={(e) => set({ reassessmentDate: e.target.value })} />
          </Field>
          <Field label="Evidence repository">
            <TextInput value={s.evidenceRepository} onChange={(v) => set({ evidenceRepository: v })} />
          </Field>
        </div>

        <h3 className="mt">Maintain and re-open (Stage 9)</h3>
        <div className="grid2">
          <Field label="Review cadence">
            <TextInput value={s.reviewCadence} onChange={(v) => set({ reviewCadence: v })} placeholder="e.g. Every 6 months" />
          </Field>
          <Field label="Monitoring owner">
            <TextInput value={s.monitoringOwner} onChange={(v) => set({ monitoringOwner: v })} />
          </Field>
        </div>
        <div className="field">
          <span className="field-label">Reassessment triggers to monitor (Section 13)</span>
          {REASSESSMENT_TRIGGERS.map((t) => (
            <label key={t.id} className="small toggle block-label">
              <input
                type="checkbox"
                checked={s.triggers.includes(t.id)}
                onChange={(e) => set({ triggers: e.target.checked ? [...s.triggers, t.id] : s.triggers.filter((x) => x !== t.id) })}
              />{' '}
              {t.label}
            </label>
          ))}
          <button type="button" className="link small" onClick={() => set({ triggers: REASSESSMENT_TRIGGERS.map((t) => t.id) })}>
            Select all
          </button>
        </div>
      </aside>
      <div className="report-scroll">
        <article className="paper" aria-label="Report preview">
          {blocks.map((b, i) => (
            <BlockView key={i} b={b} />
          ))}
        </article>
      </div>
    </div>
  );
}

function CellView({ c, as: Tag = 'td' }: { c: Cell; as?: 'td' | 'th' }) {
  if (typeof c === 'string') return <Tag>{c}</Tag>;
  return (
    <Tag style={{ background: c.fill, color: c.color, fontWeight: c.bold ? 700 : undefined }} className={c.fill ? 'filled' : undefined}>
      {c.text}
    </Tag>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'title':
      return (
        <header className="r-title">
          <h1>{b.text}</h1>
          <p>{b.subtitle}</p>
        </header>
      );
    case 'h1':
      return <h2 className="r-h1">{b.text}</h2>;
    case 'h2':
      return <h3 className="r-h2">{b.text}</h3>;
    case 'h3':
      return <h4 className="r-h3">{b.text}</h4>;
    case 'p':
      return <p className={`r-p ${b.style ?? ''}`}>{b.text}</p>;
    case 'list':
      return (
        <ul className="r-list">
          {b.items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      );
    case 'kv':
      return (
        <table className="r-table kv">
          <tbody>
            {b.rows.map(([k, v], i) => (
              <tr key={i}>
                <th>{k}</th>
                <CellView c={v} />
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'table': {
      const sum = (b.widths ?? []).reduce((x, y) => x + y, 0);
      return (
        <table className={`r-table ${b.small ? 'small' : ''}`}>
          {b.widths && (
            <colgroup>
              {b.widths.map((w, i) => (
                <col key={i} style={{ width: `${(w / sum) * 100}%` }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {b.head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <CellView key={j} c={c} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'diagram':
      return <div className="r-diagram" dangerouslySetInnerHTML={{ __html: b.svg }} />;
    case 'pagebreak':
      return <div className="r-pagebreak" />;
  }
}
