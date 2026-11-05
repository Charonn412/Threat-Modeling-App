import { useState } from 'react';
import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { getComponentType } from '../library/catalog';
import { parse, pickFile } from '../io/file';
import { useStore } from '../state/store';
import { DescribePanel } from './DescribePanel';

export function StartPage() {
  const current = useStore((s) => s.assessment);
  const setStep = useStore((s) => s.setStep);
  const load = useStore((s) => s.load);
  const startBlank = useStore((s) => s.startBlank);
  const [describing, setDescribing] = useState(false);
  const [error, setError] = useState('');

  const confirmReplace = () => !current || window.confirm('Start a new assessment? The current one stays only in this browser until replaced. Save it to a file first if you need it.');

  const open = async () => {
    setError('');
    const text = await pickFile();
    if (!text) return;
    try {
      if (confirmReplace()) load(parse(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open file.');
    }
  };

  if (describing) {
    return (
      <div className="page narrow">
        <DescribePanel mode="new" onDone={() => setDescribing(false)} />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>AI threat modeling</h1>
        <p className="muted">
          A guided assessment that follows the Enterprise AI Security methodology: intake, architecture discovery, trust boundaries and gaps. Threats, risk and reports come next. Everything stays in your browser.
        </p>
      </header>

      {current && (
        <div className="card continue">
          <div>
            <strong>Continue: {current.intake.systemName || 'Untitled assessment'}</strong>
            <div className="small muted">
              {current.components.length} components · {current.flows.length} flows · last edited {new Date(current.updatedAt).toLocaleString()}
            </div>
          </div>
          <button type="button" className="btn primary" onClick={() => setStep('intake')}>
            Continue
          </button>
        </div>
      )}

      <div className="start-grid">
        <button type="button" className="card action" onClick={() => confirmReplace() && startBlank()}>
          <span className="big" aria-hidden>
            ＋
          </span>
          <strong>Blank assessment</strong>
          <span className="small muted">Start from intake and build the architecture yourself.</span>
        </button>
        <button type="button" className="card action" onClick={() => confirmReplace() && setDescribing(true)}>
          <span className="big" aria-hidden>
            ✍️
          </span>
          <strong>Describe your system</strong>
          <span className="small muted">Type what the tool does. Components are suggested for you to review.</span>
        </button>
        <button type="button" className="card action" onClick={open}>
          <span className="big" aria-hidden>
            📂
          </span>
          <strong>Open assessment file</strong>
          <span className="small muted">Load a saved .tm.json file.</span>
        </button>
      </div>
      {error && <p className="warn">{error}</p>}

      <h2>Starter templates</h2>
      <p className="small muted">
        Templates, questions, threat rules, keywords, patterns and frameworks are editable under{' '}
        <button type="button" className="link" onClick={() => setStep('libraries')}>
          📚 Libraries
        </button>
        .
      </p>
      <div className="start-grid">
        {TEMPLATES.map((t) => (
          <button type="button" key={t.id} className="card action template" onClick={() => confirmReplace() && load(instantiateTemplate(t))}>
            <strong>{t.name}</strong>
            <span className="small muted">{t.description}</span>
            <span className="glyph-row" aria-hidden>
              {[...new Set(t.components.map((c) => getComponentType(c.type).glyph))].join(' ')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
