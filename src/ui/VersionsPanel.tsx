import { useMemo, useState } from 'react';
import { deleteVersion, getVersion, listVersions, saveVersion, StorageFullError } from '../state/workspace';
import { diffAssessments } from '../logic/diff';
import { useStore } from '../state/store';
import { TextInput } from './controls';

/** Stage 9: named version snapshots, comparison and restore. */
export function VersionsPanel({ baselineId, onBaseline }: { baselineId: string; onBaseline: (id: string) => void }) {
  const a = useStore((s) => s.assessment)!;
  const replace = useStore((s) => s.replaceAssessment);
  const [label, setLabel] = useState('');
  const [tick, setTick] = useState(0);
  const [comparing, setComparing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const versions = useMemo(() => listVersions(a.id), [a.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    setError('');
    try {
      saveVersion(a, label || `${a.signOff.version || 'Version'} ${new Date().toISOString().slice(0, 10)}`);
      setLabel('');
      setTick((x) => x + 1);
    } catch (e) {
      setError(e instanceof StorageFullError ? e.message : String(e));
    }
  };

  return (
    <>
      <h3 className="mt">Versions</h3>
      <p className="small muted">Save a snapshot when the assessment is approved. Later, compare against it to see what changed and which reassessment triggers were hit.</p>
      <div className="row gap">
        <TextInput value={label} onChange={setLabel} placeholder="e.g. v1.0 approved" />
        <button type="button" className="btn small primary" onClick={save}>
          Save version
        </button>
      </div>
      {error && <p className="small warn">{error}</p>}
      {versions.length > 0 && (
        <ul className="small plain versions">
          {[...versions].reverse().map((v) => (
            <li key={v.id}>
              <div className="row between">
                <strong>{v.label}</strong>
                <span className="muted">{new Date(v.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="row gap wrap">
                <button type="button" className="link" onClick={() => setComparing(comparing === v.id ? null : v.id)}>
                  {comparing === v.id ? 'Hide changes' : 'Compare'}
                </button>
                <button type="button" className="link" onClick={() => onBaseline(baselineId === v.id ? '' : v.id)}>
                  {baselineId === v.id ? 'Remove from report' : 'Use as report baseline'}
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    const data = getVersion(a.id, v.id);
                    if (data && window.confirm(`Restore "${v.label}"? The current state is saved as a version first.`)) {
                      saveVersion(a, `Before restoring ${v.label}`);
                      replace({ ...data, id: a.id });
                      setTick((x) => x + 1);
                    }
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="link danger-text"
                  onClick={() => {
                    if (window.confirm(`Delete version "${v.label}"?`)) {
                      deleteVersion(a.id, v.id);
                      if (baselineId === v.id) onBaseline('');
                      setTick((x) => x + 1);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
              {comparing === v.id && <Comparison versionId={v.id} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Comparison({ versionId }: { versionId: string }) {
  const a = useStore((s) => s.assessment)!;
  const before = getVersion(a.id, versionId);
  if (!before) return null;
  const d = diffAssessments(before, a);
  return (
    <div className="sub-card">
      {d.triggers.length > 0 ? (
        <>
          <strong className="warn">Reassessment triggers hit</strong>
          <ul>
            {d.triggers.map((t) => (
              <li key={t.id}>
                {t.label}
                <div className="muted">{t.because.join('; ')}</div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="ok">No reassessment triggers hit.</p>
      )}
      <strong>{d.changes.length} changes</strong>
      <ul>
        {d.changes.slice(0, 40).map((c, i) => (
          <li key={i}>
            <span className={`badge diff-${c.kind}`}>{c.kind}</span> {c.area}: {c.label}
            {c.detail && <span className="muted"> · {c.detail}</span>}
          </li>
        ))}
        {d.changes.length > 40 && <li className="muted">…and {d.changes.length - 40} more (see the report)</li>}
      </ul>
    </div>
  );
}
