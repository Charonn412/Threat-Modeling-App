import { CATALOGS } from '../library/frameworks';
import { THREAT_RULES } from '../library/threatRules';
import { defaultRiskMatrix, type Level, type RiskMatrix } from '../model/types';
import { useStore } from '../state/store';

export function SettingsPage() {
  const a = useStore((s) => s.assessment)!;
  const updateMatrix = useStore((s) => s.updateRiskMatrix);
  const m = a.settings.riskMatrix;

  const setLabel = (key: 'likelihoodLabels' | 'impactLabels' | 'ratingLabels', idx: number, v: string) => {
    const next = [...m[key]] as RiskMatrix[typeof key];
    next[idx] = v;
    updateMatrix({ ...m, [key]: next });
  };
  const cycle = (l: number, i: number) => {
    const grid = m.grid.map((row) => [...row]);
    grid[l][i] = ((grid[l][i] % 4) + 1) as Level;
    updateMatrix({ ...m, grid });
  };

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="card">
        <div className="row between">
          <h2>Risk matrix</h2>
          <button type="button" className="btn small" onClick={() => window.confirm('Reset the matrix to the methodology default?') && updateMatrix(defaultRiskMatrix())}>
            Reset to default
          </button>
        </div>
        <p className="small muted">
          Section 9: use the organization's approved risk matrix where one exists. Rename the levels and click a cell to change its rating. Changes apply to this assessment.
        </p>
        <div className="grid3">
          {(['likelihoodLabels', 'impactLabels', 'ratingLabels'] as const).map((key) => (
            <div key={key} className="field">
              <span className="field-label">{key === 'likelihoodLabels' ? 'Likelihood levels' : key === 'impactLabels' ? 'Impact levels' : 'Rating levels'}</span>
              {m[key].map((v, idx) => (
                <input key={idx} className="input" value={v} aria-label={`${key} ${idx + 1}`} onChange={(e) => setLabel(key, idx, e.target.value)} />
              ))}
            </div>
          ))}
        </div>
        <div className="heatmap">
          <table>
            <tbody>
              {[3, 2, 1, 0].map((l) => (
                <tr key={l}>
                  <th scope="row" className="hm-axis">
                    {m.likelihoodLabels[l]}
                  </th>
                  {[0, 1, 2, 3].map((i) => (
                    <td key={i} className={`hm-cell r${m.grid[l][i]}`}>
                      <button type="button" className="hm-btn" onClick={() => cycle(l, i)} aria-label={`Change rating for likelihood ${m.likelihoodLabels[l]}, impact ${m.impactLabels[i]}`}>
                        {m.ratingLabels[m.grid[l][i] - 1]}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th />
                {[0, 1, 2, 3].map((i) => (
                  <th key={i} className="hm-axis">
                    {m.impactLabels[i]}
                  </th>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="hm-legend small muted">Rows: likelihood · Columns: impact</div>
        </div>
      </section>

      <section className="card">
        <h2>Framework catalogs</h2>
        <p className="small muted">
          MITRE ATLAS and ATT&CK are generated from MITRE's official data (scripts/extract_frameworks.py). OWASP lists and STRIDE are maintained in the app. This assessment records the
          versions it was assessed against. Edit or import catalogs under Libraries (📚).
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Framework</th>
              <th>Type</th>
              <th>Catalog version</th>
              <th>Items</th>
              <th>Assessed against</th>
            </tr>
          </thead>
          <tbody>
            {CATALOGS.map((c) => (
              <tr key={c.id}>
                <td>
                  <a href={c.source} target="_blank" rel="noreferrer">
                    {c.name}
                  </a>
                </td>
                <td>{c.kind === 'ai' ? 'AI' : c.kind === 'compliance' ? 'Compliance' : 'Traditional'}</td>
                <td>{c.version}</td>
                <td>{c.items.length}</td>
                <td className={a.frameworkVersions[c.name] && a.frameworkVersions[c.name] !== c.version ? 'warn' : ''}>{a.frameworkVersions[c.name] ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">{THREAT_RULES.length} threat rules loaded.</p>
      </section>
    </div>
  );
}
