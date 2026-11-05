import { Fragment, useMemo, useState } from 'react';
import { getComponentType } from '../library/catalog';
import { RuleBasedAnalyzer, applySuggestions, type Suggestion } from '../logic/describe';
import { newAssessment } from '../model/factory';
import { useStore } from '../state/store';

const analyzer = new RuleBasedAnalyzer();

const EXAMPLE =
  'An internal HR assistant for employees. Users chat in Microsoft Teams and sign in with Okta SSO. ' +
  'The backend runs on AWS Lambda and calls Claude through AWS Bedrock. It retrieves policy documents from SharePoint ' +
  'that are ingested into a Pinecone vector database. The agent can create Jira tickets and send email on the user\'s behalf, ' +
  'but updates to employee records in Workday require human approval. Conversation history is stored in DynamoDB and logs go to Splunk.';

export function DescribePanel({ mode, onDone }: { mode: 'new' | 'existing'; onDone: () => void }) {
  const current = useStore((s) => s.assessment);
  const load = useStore((s) => s.load);
  const replace = useStore((s) => s.replaceAssessment);
  const setStep = useStore((s) => s.setStep);

  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [autoWire, setAutoWire] = useState(true);

  const analyze = () => {
    const s = analyzer.analyze(text);
    setSuggestions(s);
    setAccepted(new Set(s.filter((x) => x.confidence !== 'low').map((x) => x.id)));
  };

  const toggle = (id: string) => {
    const next = new Set(accepted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAccepted(next);
  };

  const apply = () => {
    if (!suggestions) return;
    const chosen = suggestions.filter((s) => accepted.has(s.id));
    const base = mode === 'new' || !current ? newAssessment() : current;
    let next = applySuggestions(base, chosen, autoWire);
    const types = new Set([...next.intake.systemTypes, ...chosen.flatMap((s) => s.systemTypes)]);
    next = {
      ...next,
      intake: { ...next.intake, systemTypes: [...types], purpose: next.intake.purpose || text.trim() },
    };
    if (mode === 'new' || !current) load(next);
    else replace(next);
    setStep('architecture');
    onDone();
  };

  const highlights = useMemo(() => {
    if (!suggestions) return [];
    const spans = suggestions.flatMap((s) => s.matches.map((m) => ({ start: m.index, end: m.index + m.text.length, on: accepted.has(s.id) })));
    return spans.sort((x, y) => x.start - y.start);
  }, [suggestions, accepted]);

  return (
    <div className="describe">
      <div className="row between">
        <h2>Describe the system</h2>
        <button type="button" className="btn small" onClick={onDone}>
          Close
        </button>
      </div>
      <p className="small muted">
        Paste or type a description of the AI tool. The app matches it against a keyword library and suggests components. Review each suggestion. Nothing is added
        unless you accept it. (No data leaves your browser.)
      </p>
      <textarea className="input" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. A customer support copilot that…" />
      <div className="row gap">
        <button type="button" className="btn primary" onClick={analyze} disabled={!text.trim()}>
          Analyze description
        </button>
        <button type="button" className="link small" onClick={() => setText(EXAMPLE)}>
          Use an example
        </button>
      </div>

      {suggestions && (
        <>
          <div className="highlighted small">
            <Highlighted text={text} spans={highlights} />
          </div>
          {suggestions.length === 0 ? (
            <p className="warn small">No components recognized. Add more technical detail (products, data stores, tools, who uses it), or build the diagram from the palette.</p>
          ) : (
            <>
              <div className="row between">
                <strong>{suggestions.length} suggestions</strong>
                <span className="small">
                  <button type="button" className="link" onClick={() => setAccepted(new Set(suggestions.map((s) => s.id)))}>
                    Accept all
                  </button>{' '}
                  ·{' '}
                  <button type="button" className="link" onClick={() => setAccepted(new Set())}>
                    Reject all
                  </button>
                </span>
              </div>
              <div className="suggestions">
                {suggestions.map((s) => {
                  const t = getComponentType(s.type);
                  const on = accepted.has(s.id);
                  return (
                    <label key={s.id} className={`suggestion ${on ? 'on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                      <span className="sg-glyph" aria-hidden>
                        {t.glyph}
                      </span>
                      <span className="sg-body">
                        <strong>{s.name}</strong>
                        <span className="small muted">
                          {t.label}
                          {s.provider ? ` · ${s.provider}` : ''}
                        </span>
                        <span className="small">matched: {[...new Set(s.matches.map((m) => `“${m.text}”`))].join(', ')}</span>
                      </span>
                      <span className={`conf ${s.confidence}`}>{s.confidence}</span>
                    </label>
                  );
                })}
              </div>
              <label className="small toggle">
                <input type="checkbox" checked={autoWire} onChange={(e) => setAutoWire(e.target.checked)} /> Propose default flows between components (review them
                after)
              </label>
              <div className="row gap">
                <button type="button" className="btn primary" onClick={apply} disabled={accepted.size === 0}>
                  Add {accepted.size} component{accepted.size === 1 ? '' : 's'} to {mode === 'new' ? 'a new assessment' : 'the diagram'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Highlighted({ text, spans }: { text: string; spans: { start: number; end: number; on: boolean }[] }) {
  const parts: JSX.Element[] = [];
  let pos = 0;
  spans.forEach((s, i) => {
    if (s.start < pos) return; // overlapping match
    if (s.start > pos) parts.push(<Fragment key={`t${i}`}>{text.slice(pos, s.start)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className={s.on ? 'on' : 'off'}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    pos = s.end;
  });
  parts.push(<Fragment key="end">{text.slice(pos)}</Fragment>);
  return <>{parts}</>;
}
