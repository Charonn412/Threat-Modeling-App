import type { Level, RiskMatrix } from '../model/types';
import { rating, ratingLabel, LEVELS } from '../logic/risk';

export function RatingBadge({ m, l, i, compact }: { m: RiskMatrix; l: Level; i: Level; compact?: boolean }) {
  const r = rating(m, l, i);
  return (
    <span className={`rating r${r}`} title={r ? `Likelihood ${m.likelihoodLabels[l - 1]} × Impact ${m.impactLabels[i - 1]}` : 'Not rated'}>
      {compact && r ? ratingLabel(m, r).charAt(0) : ratingLabel(m, r)}
    </span>
  );
}

export function LevelSelect({ value, onChange, labels, label }: { value: Level; onChange: (v: Level) => void; labels: string[]; label: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(Number(e.target.value) as Level)}>
        <option value={0}>— not rated —</option>
        {LEVELS.map((lv) => (
          <option key={lv} value={lv}>
            {labels[lv - 1]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Likelihood (rows, high at top) × impact (columns) heatmap with counts per cell. */
export function Heatmap({
  m,
  points,
  title,
  onCell,
}: {
  m: RiskMatrix;
  points: { l: Level; i: Level }[];
  title: string;
  onCell?: (l: Level, i: Level) => void;
}) {
  const count = (l: number, i: number) => points.filter((p) => p.l === l && p.i === i).length;
  return (
    <div className="heatmap">
      <div className="small strong">{title}</div>
      <table>
        <tbody>
          {[4, 3, 2, 1].map((l) => (
            <tr key={l}>
              <th scope="row" className="hm-axis">
                {m.likelihoodLabels[l - 1]}
              </th>
              {[1, 2, 3, 4].map((i) => {
                const n = count(l, i);
                return (
                  <td key={i} className={`hm-cell r${m.grid[l - 1][i - 1]}`}>
                    {onCell ? (
                      <button type="button" className="hm-btn" onClick={() => onCell(l as Level, i as Level)} aria-label={`Likelihood ${m.likelihoodLabels[l - 1]}, impact ${m.impactLabels[i - 1]}: ${n}`}>
                        {n || ''}
                      </button>
                    ) : (
                      n || ''
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th />
            {[1, 2, 3, 4].map((i) => (
              <th key={i} className="hm-axis">
                {m.impactLabels[i - 1]}
              </th>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="hm-legend small muted">Rows: likelihood · Columns: impact</div>
    </div>
  );
}
