import { useState } from 'react';
import { deleteAssessment, duplicateAssessment, listAssessments, loadAssessment, workspaceBytes } from '../state/workspace';
import { downloadText, fileNameFor, serialize } from '../io/file';
import { useStore } from '../state/store';

/** Home-page list of every assessment saved in this browser. */
export function AssessmentList() {
  const current = useStore((s) => s.assessment);
  const load = useStore((s) => s.load);
  const close = useStore((s) => s.close);
  const [tick, setTick] = useState(0);
  const items = listAssessments();
  void tick;
  if (!items.length) return null;
  const refresh = () => setTick((x) => x + 1);
  const kb = Math.round(workspaceBytes() / 1024);

  return (
    <section className="card">
      <div className="row between wrap">
        <h2>Your assessments</h2>
        <span className="small muted">Saved in this browser · {kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`} used</span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>System</th>
              <th>Last edited</th>
              <th>Components</th>
              <th>Confirmed threats</th>
              <th>Versions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className={current?.id === e.id ? 'current-row' : ''}>
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      const a = loadAssessment(e.id);
                      if (a) load(a);
                    }}
                  >
                    {e.name}
                  </button>
                  {current?.id === e.id && <span className="badge">open</span>}
                </td>
                <td className="small">{new Date(e.updatedAt).toLocaleString()}</td>
                <td>{e.components}</td>
                <td>{e.confirmedThreats}</td>
                <td>{e.versions}</td>
                <td>
                  <div className="row gap">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        const a = loadAssessment(e.id);
                        if (a) downloadText(fileNameFor(a), serialize(a));
                      }}
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        duplicateAssessment(e.id);
                        refresh();
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={() => {
                        if (!window.confirm(`Delete "${e.name}" and its ${e.versions} saved version${e.versions === 1 ? '' : 's'} from this browser? Export it first if you need a copy.`)) return;
                        deleteAssessment(e.id);
                        if (current?.id === e.id) close();
                        refresh();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
