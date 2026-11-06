import { useState } from 'react';
import { getComponentType } from '../library/catalog';
import { getArea, type Question } from '../library/questions';
import { answerKey, TIER_LABEL, type AnswerStatus, type Component } from '../model/types';
import { questionsFor } from '../logic/analysis';
import { questionsForAreas } from '../library/questions';
import { useStore } from '../state/store';
import { useTier } from './hooks';
import { classify } from '../logic/posture';

const STATUSES: { value: AnswerStatus; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
  { value: 'unknown', label: 'Unknown' },
];

export function QuestionList({ component }: { component: Component }) {
  const tier = useTier();
  const showAll = useStore((s) => s.showAllTiers);
  const setShowAll = useStore((s) => s.setShowAllTiers);
  const t = getComponentType(component.type);
  const all = questionsForAreas(t.areas);
  const visible = showAll ? all : questionsFor(component, tier);
  const hidden = all.length - visible.length;

  if (!t.areas.length) {
    return <p className="muted small">No Appendix B questions for this actor. Describe it in notes, and capture its access in the flows.</p>;
  }

  return (
    <div className="questions">
      <div className="row between">
        <span className="small muted">
          {TIER_LABEL[tier]} tier · {visible.length} question{visible.length === 1 ? '' : 's'}
          {hidden > 0 && !showAll ? ` (${hidden} deeper hidden)` : ''}
        </span>
        <label className="small toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all tiers
        </label>
      </div>
      {t.areas.map((areaId) => {
        const qs = visible.filter((x) => x.area === areaId);
        if (!qs.length) return null;
        const area = getArea(areaId);
        return (
          <section key={areaId} className="area">
            <h4>
              {area.id} · {area.title}
            </h4>
            {qs.map((qq) => (
              <QuestionItem key={qq.id} component={component} q={qq} />
            ))}
            <details className="pattern">
              <summary>Standard secure pattern</summary>
              <p>{area.securePattern}</p>
            </details>
          </section>
        );
      })}
    </div>
  );
}

function QuestionItem({ component, q }: { component: Component; q: Question }) {
  const answer = useStore((s) => s.assessment?.answers[answerKey(component.id, q.id)]);
  const flows = useStore((s) => s.assessment?.flows ?? []);
  const components = useStore((s) => s.assessment?.components ?? []);
  const setAnswer = useStore((s) => s.setAnswer);
  const clearAnswer = useStore((s) => s.clearAnswer);
  const applySuggestion = useStore((s) => s.applyDiagramSuggestion);
  const [open, setOpen] = useState(false);

  const suggestion = q.suggest;
  const alreadyConnected =
    suggestion &&
    flows.some((f) => {
      const otherId = f.source === component.id ? f.target : f.target === component.id ? f.source : null;
      return otherId && components.find((c) => c.id === otherId)?.type === suggestion.addType;
    });
  const showSuggestion = suggestion && answer?.status === 'yes' && !alreadyConnected;
  const expanded = open || answer?.status === 'unknown';

  const finding = classify(q, answer);
  return (
    <div className={`question status-${answer?.status ?? 'none'} finding-${finding}`}>
      <div className="q-text">
        <span className="q-id">{q.id}</span> {q.text}
        <span className={`tag ${q.kind}`}>{q.kind === 'ai' ? 'AI' : 'Traditional'}</span>
        {finding === 'weak' && (
          <span className="tag weak" title={`The secure answer is ${q.secure === 'no' ? 'No' : 'Yes'}. This answer is a security finding.`}>
            Weak
          </span>
        )}
        {finding === 'secure' && <span className="tag secure">Secure</span>}
        {q.secure === 'info' && <span className="tag" title="Describes a capability, not security posture">Info</span>}
      </div>
      <div className="row between">
        <div className="seg" role="radiogroup" aria-label={`Answer ${q.id}`}>
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={answer?.status === s.value}
              className={`seg-btn ${s.value} ${answer?.status === s.value ? 'on' : ''}`}
              onClick={() => (answer?.status === s.value ? clearAnswer(component.id, q.id) : setAnswer(component.id, q.id, { status: s.value }))}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" className="link small" onClick={() => setOpen(!open)}>
          {expanded ? 'Hide details' : 'Details'}
        </button>
      </div>
      {showSuggestion && (
        <div className="suggest-box">
          <span>{suggestion.prompt}</span>
          <button type="button" className="btn small primary" onClick={() => applySuggestion(component.id, suggestion)}>
            Add {getComponentType(suggestion.addType).label}
          </button>
        </div>
      )}
      {expanded && (
        <div className="q-details">
          {answer?.status === 'unknown' && <p className="small warn">Unknown is a tracked gap. Assign an owner and a resolution date.</p>}
          <textarea
            className="input"
            rows={2}
            placeholder="Answer / explanation"
            value={answer?.note ?? ''}
            onChange={(e) => setAnswer(component.id, q.id, { note: e.target.value })}
          />
          <input
            className="input"
            placeholder="Evidence (link, config export, test ID)"
            value={answer?.evidence ?? ''}
            onChange={(e) => setAnswer(component.id, q.id, { evidence: e.target.value })}
          />
          <div className="row gap">
            <input className="input" placeholder="Owner" value={answer?.owner ?? ''} onChange={(e) => setAnswer(component.id, q.id, { owner: e.target.value })} />
            <input
              className="input"
              type="date"
              aria-label="Due date"
              value={answer?.dueDate ?? ''}
              onChange={(e) => setAnswer(component.id, q.id, { dueDate: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
