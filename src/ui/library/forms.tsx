import { useMemo, useState } from 'react';
import { CATEGORY_LABEL, CATEGORY_ORDER, COMPONENT_TYPES, type ComponentType } from '../../library/catalog';
import { AREAS, type Question } from '../../library/questions';
import { DOMAINS, type ThreatRule, type Signal } from '../../library/threatRules';
import type { LexiconEntry } from '../../library/lexicon';
import { PATTERNS, type Pattern } from '../../library/patterns';
import { editorItems, itemState, useLibrary, validateConds, type CollectionId } from '../../library/registry';
import { RuleBasedAnalyzer } from '../../logic/describe';
import { generateCandidates } from '../../logic/threats';
import { INTAKE_SECTIONS } from '../../library/intake';
import { OBJECTIVE_LABEL, type AreaId, type ObjectiveId } from '../../model/types';
import { useStore } from '../../state/store';
import { Field, TextArea, TextInput } from '../controls';
import { FrameworkTags } from '../FrameworkTags';
import { EditorActions, ID_RE, JsonField, lines } from './common';

/** Shared draft handling: tracks dirtiness and validates ID on new items. */
function useDraft<T extends { id: string }>(collection: CollectionId, initial: T, isNew: boolean) {
  const pack = useLibrary((s) => s.pack);
  const [draft, setDraft] = useState<T>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const existing = useMemo(() => new Set(editorItems(pack, collection).map((x) => x.item.id)), [pack, collection]);
  let idError: string | null = null;
  if (isNew) {
    if (!draft.id) idError = 'ID is required.';
    else if (!ID_RE.test(draft.id)) idError = 'ID may contain letters, digits and . _ : - only.';
    else if (existing.has(draft.id)) idError = `ID "${draft.id}" already exists.`;
  }
  const state = isNew ? null : itemState(pack, collection, initial.id);
  return { draft, setDraft, dirty, idError, state, reset: () => setDraft(initial) };
}

interface FormProps<T> {
  item: T;
  isNew: boolean;
  onSaved: (id: string) => void;
  onCancelNew: () => void;
}

function IdField({ value, isNew, onChange }: { value: string; isNew: boolean; onChange: (v: string) => void }) {
  return (
    <Field label="ID" hint={isNew ? 'Permanent once added. Answers, threats and mappings reference it.' : undefined}>
      <input className="input mono" value={value} disabled={!isNew} onChange={(e) => onChange(e.target.value.trim())} />
    </Field>
  );
}

// ── Components ────────────────────────────────────────────────────────────
export function ComponentForm({ item, isNew, onSaved, onCancelNew }: FormProps<ComponentType>) {
  const { draft, setDraft, dirty, idError, state, reset } = useDraft('components', item, isNew);
  const set = (p: Partial<ComponentType>) => setDraft({ ...draft, ...p });
  const error = idError ?? (!draft.label.trim() ? 'Label is required.' : null);
  return (
    <div className="lib-form">
      <IdField value={draft.id} isNew={isNew} onChange={(v) => set({ id: v })} />
      <div className="grid3">
        <Field label="Label">
          <TextInput value={draft.label} onChange={(v) => set({ label: v })} />
        </Field>
        <Field label="Glyph (emoji)">
          <TextInput value={draft.glyph} onChange={(v) => set({ glyph: v })} />
        </Field>
        <Field label="Palette category">
          <select className="input" value={draft.category} onChange={(e) => set({ category: e.target.value as ComponentType['category'] })}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid2">
        <Field label="Default plane">
          <select className="input" value={draft.plane} onChange={(e) => set({ plane: e.target.value as ComponentType['plane'] })}>
            <option value="data">Data plane</option>
            <option value="control">Control plane</option>
          </select>
        </Field>
        <Field label="Description">
          <TextInput value={draft.description} onChange={(v) => set({ description: v })} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Appendix B areas (questions shown for this component)</span>
        <span className="chips">
          {AREAS.map((a) => {
            const on = draft.areas.includes(a.id);
            return (
              <button key={a.id} type="button" title={a.title} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ areas: on ? draft.areas.filter((x) => x !== a.id) : [...draft.areas, a.id] })}>
                {a.id}
              </button>
            );
          })}
        </span>
      </div>
      <EditorActions
        collection="components"
        id={item.id}
        state={state}
        isNew={isNew}
        dirty={dirty}
        error={error}
        onSave={() => {
          useLibrary.getState().upsert('components', draft);
          onSaved(draft.id);
        }}
        onCancel={isNew ? onCancelNew : reset}
        onDeleted={onCancelNew}
      />
    </div>
  );
}

// ── Questions ─────────────────────────────────────────────────────────────
export function QuestionForm({ item, isNew, onSaved, onCancelNew }: FormProps<Question>) {
  const { draft, setDraft, dirty, idError, state, reset } = useDraft('questions', item, isNew);
  const set = (p: Partial<Question>) => setDraft({ ...draft, ...p });
  const sg = draft.suggest;
  const error = idError ?? (!draft.text.trim() ? 'Question text is required.' : sg && (!sg.flowLabel.trim() || !sg.prompt.trim()) ? 'Suggestion needs a flow label and prompt.' : null);
  return (
    <div className="lib-form">
      <IdField value={draft.id} isNew={isNew} onChange={(v) => set({ id: v })} />
      <div className="grid3">
        <Field label="Area (Appendix B)">
          <select className="input" value={draft.area} onChange={(e) => set({ area: e.target.value as AreaId })}>
            {AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} · {a.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assurance tier">
          <select className="input" value={draft.tier} onChange={(e) => set({ tier: Number(e.target.value) as Question['tier'] })}>
            <option value={1}>Light (always shown)</option>
            <option value={2}>Standard</option>
            <option value={3}>Deep</option>
          </select>
        </Field>
        <Field label="Kind">
          <select className="input" value={draft.kind} onChange={(e) => set({ kind: e.target.value as Question['kind'] })}>
            <option value="ai">AI-specific</option>
            <option value="traditional">Traditional security</option>
          </select>
        </Field>
      </div>
      <Field label="Secure answer" hint="Drives the posture score: an answer opposite to the secure one is a security finding.">
        <select className="input" value={draft.secure ?? 'yes'} onChange={(e) => set({ secure: e.target.value as Question['secure'] })}>
          <option value="yes">Yes is secure (e.g. "Is authorization enforced?")</option>
          <option value="no">No is secure (e.g. "Can users influence instructions?")</option>
          <option value="info">Informational: describes a capability, not posture</option>
        </select>
      </Field>
      <Field label="Question">
        <TextArea value={draft.text} onChange={(v) => set({ text: v })} rows={3} />
      </Field>
      <label className="small toggle">
        <input
          type="checkbox"
          checked={!!sg}
          onChange={(e) => set({ suggest: e.target.checked ? { addType: COMPONENT_TYPES[0].id, direction: 'out', flowLabel: '', prompt: '' } : undefined })}
        />{' '}
        Answering "Yes" offers to add a component to the diagram (two-way sync)
      </label>
      {sg && (
        <div className="grid2 sub-card">
          <Field label="Component to add">
            <select className="input" value={sg.addType} onChange={(e) => set({ suggest: { ...sg, addType: e.target.value } })}>
              {COMPONENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Flow direction">
            <select className="input" value={sg.direction} onChange={(e) => set({ suggest: { ...sg, direction: e.target.value as 'in' | 'out' } })}>
              <option value="out">This component → new component</option>
              <option value="in">New component → this component</option>
            </select>
          </Field>
          <Field label="Flow label">
            <TextInput value={sg.flowLabel} onChange={(v) => set({ suggest: { ...sg, flowLabel: v } })} />
          </Field>
          <Field label="Prompt shown to the user">
            <TextInput value={sg.prompt} onChange={(v) => set({ suggest: { ...sg, prompt: v } })} />
          </Field>
        </div>
      )}
      <EditorActions
        collection="questions"
        id={item.id}
        state={state}
        isNew={isNew}
        dirty={dirty}
        error={error}
        onSave={() => {
          useLibrary.getState().upsert('questions', draft);
          onSaved(draft.id);
        }}
        onCancel={isNew ? onCancelNew : reset}
        onDeleted={onCancelNew}
      />
    </div>
  );
}

// ── Threat rules ──────────────────────────────────────────────────────────
const SIGNAL_STATUSES = new Set(['yes', 'no', 'na', 'unknown']);
function validateSignals(v: unknown): string | null {
  if (!Array.isArray(v)) return 'Signals must be a JSON array.';
  for (const [i, s] of v.entries()) {
    if (!s || typeof s !== 'object') return `[${i}] must be an object`;
    const o = s as Signal;
    if (typeof o.q !== 'string') return `[${i}] needs "q" (question ID)`;
    if (!Array.isArray(o.in) || !o.in.every((x) => SIGNAL_STATUSES.has(x))) return `[${i}] "in" must list yes/no/na/unknown`;
    if (typeof o.note !== 'string') return `[${i}] needs a "note"`;
  }
  return null;
}

export function RuleForm({ item, isNew, onSaved, onCancelNew }: FormProps<ThreatRule>) {
  const { draft, setDraft, dirty, idError, state, reset } = useDraft('rules', item, isNew);
  const [jsonErrors, setJsonErrors] = useState<{ when: string | null; signals: string | null }>({ when: null, signals: null });
  // Bumped on revert so the JSON editors re-read the draft instead of keeping invalid text.
  const [resetKey, setResetKey] = useState(0);
  const jsonInvalid = !!(jsonErrors.when || jsonErrors.signals);
  const assessment = useStore((s) => s.assessment);
  const set = (p: Partial<ThreatRule>) => setDraft({ ...draft, ...p });
  const error = idError ?? jsonErrors.when ?? jsonErrors.signals ?? (!draft.title.trim() ? 'Title is required.' : !draft.tags.some((t) => t.fw === 'stride') ? 'Add at least one STRIDE category (traditional mapping is required on every rule).' : null);

  const matches = useMemo(() => {
    if (!assessment || jsonErrors.when) return null;
    try {
      return generateCandidates(assessment, [draft]);
    } catch {
      return null;
    }
  }, [assessment, draft, jsonErrors.when]);

  return (
    <div className="lib-form">
      <IdField value={draft.id} isNew={isNew} onChange={(v) => set({ id: v })} />
      <div className="grid3">
        <Field label="Domain (Appendix C)">
          <select className="input" value={draft.domain} onChange={(e) => set({ domain: e.target.value })}>
            {DOMAINS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Evaluated per">
          <select className="input" value={draft.scope} onChange={(e) => set({ scope: e.target.value as ThreatRule['scope'] })}>
            <option value="component">Component</option>
            <option value="flow">Flow</option>
            <option value="system">Whole system</option>
          </select>
        </Field>
        <div className="grid2">
          <Field label="Base likelihood">
            <select className="input" value={draft.likelihood} onChange={(e) => set({ likelihood: Number(e.target.value) as ThreatRule['likelihood'] })}>
              {[1, 2, 3, 4].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Base impact">
            <select className="input" value={draft.impactLevel} onChange={(e) => set({ impactLevel: Number(e.target.value) as ThreatRule['impactLevel'] })}>
              {[1, 2, 3, 4].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <JsonField
        key={`when-${resetKey}`}
        label="When (all conditions must match)"
        value={draft.when}
        rows={7}
        validate={validateConds}
        onChange={(v, err) => {
          setJsonErrors((e) => ({ ...e, when: err }));
          if (!err) set({ when: v as ThreatRule['when'] });
        }}
        help={
          <>
            Kinds: <code>type</code>, <code>flow</code> (source, target, origin, crosses, crossKinds, plane, encrypted), <code>has</code>, <code>lacks</code>,{' '}
            <code>connected</code> (types, direction), <code>intake</code> (field, in), <code>answer</code> (q, in), <code>any</code>, <code>all</code>, <code>not</code>.
          </>
        }
      />
      {draft.scope === 'system' && (
        <Field label="Linked component types (system scope)" hint="Comma-separated component type IDs">
          <TextInput value={(draft.involves ?? []).join(', ')} onChange={(v) => set({ involves: v.split(',').map((x) => x.trim()).filter(Boolean) })} />
        </Field>
      )}
      {matches && (
        <p className="small callout">
          Matches in the open assessment: <strong>{matches.length}</strong>
          {matches.length > 0 && ` (${matches.slice(0, 5).map((m) => m.vars.name ?? (m.vars.src ? `${m.vars.src} → ${m.vars.dst}` : 'whole system')).join('; ')}${matches.length > 5 ? '…' : ''})`}
        </p>
      )}
      <Field label="Title template" hint="Use {name} for the component, {src}/{dst} for flow endpoints, {system} for the system name.">
        <TextInput value={draft.title} onChange={(v) => set({ title: v })} />
      </Field>
      <div className="grid2">
        <Field label="Threat actor">
          <TextInput value={draft.actor} onChange={(v) => set({ actor: v })} />
        </Field>
        <Field label="Asset">
          <TextInput value={draft.asset} onChange={(v) => set({ asset: v })} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Security objectives</span>
        <span className="chips">
          {(Object.keys(OBJECTIVE_LABEL) as ObjectiveId[]).map((o) => {
            const on = draft.objectives.includes(o);
            return (
              <button key={o} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ objectives: on ? draft.objectives.filter((x) => x !== o) : [...draft.objectives, o] })}>
                {OBJECTIVE_LABEL[o]}
              </button>
            );
          })}
        </span>
      </div>
      <Field label="Preconditions">
        <TextArea value={draft.preconditions} onChange={(v) => set({ preconditions: v })} rows={2} />
      </Field>
      <Field label="Attack path">
        <TextArea value={draft.attackPath} onChange={(v) => set({ attackPath: v })} rows={4} />
      </Field>
      <Field label="Impact">
        <TextArea value={draft.impact} onChange={(v) => set({ impact: v })} rows={2} />
      </Field>
      <label className="small toggle">
        <input type="checkbox" checked={!!draft.external} onChange={(e) => set({ external: e.target.checked })} /> Likelihood +1 when the system is publicly exposed
      </label>
      <div className="field">
        <span className="field-label">Framework mappings</span>
        <FrameworkTags value={draft.tags} onChange={(v) => set({ tags: v })} />
      </div>
      <div className="field">
        <span className="field-label">Secure patterns</span>
        <span className="chips">
          {PATTERNS.map((p) => {
            const on = draft.patterns.includes(p.id);
            return (
              <button key={p.id} type="button" title={p.outcome} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ patterns: on ? draft.patterns.filter((x) => x !== p.id) : [...draft.patterns, p.id] })}>
                {p.name}
              </button>
            );
          })}
        </span>
      </div>
      <JsonField
        key={`signals-${resetKey}`}
        label="Rating signals (answers that raise likelihood)"
        value={draft.signals ?? []}
        rows={5}
        validate={validateSignals}
        onChange={(v, err) => {
          setJsonErrors((e) => ({ ...e, signals: err }));
          if (!err) set({ signals: v as Signal[] });
        }}
        help={
          <>
            e.g. <code>{'[{"q":"B8.4","in":["no"],"note":"High-impact actions not gated","bump":1}]'}</code>
          </>
        }
      />
      <EditorActions
        collection="rules"
        id={item.id}
        state={state}
        isNew={isNew}
        dirty={dirty || jsonInvalid}
        error={error}
        onSave={() => {
          useLibrary.getState().upsert('rules', draft);
          onSaved(draft.id);
        }}
        onCancel={() => {
          if (isNew) onCancelNew();
          else {
            reset();
            setJsonErrors({ when: null, signals: null });
            setResetKey((k) => k + 1);
          }
        }}
        onDeleted={onCancelNew}
      />
    </div>
  );
}

// ── Lexicon ───────────────────────────────────────────────────────────────
const SYSTEM_TYPES = INTAKE_SECTIONS.flatMap((s) => s.fields).find((f) => f.key === 'systemTypes');

export function LexiconForm({ item, isNew, onSaved, onCancelNew }: FormProps<LexiconEntry>) {
  const { draft, setDraft, dirty, idError, state, reset } = useDraft('lexicon', item, isNew);
  const [patternText, setPatternText] = useState(item.patterns.join('\n'));
  const [sample, setSample] = useState('');
  const set = (p: Partial<LexiconEntry>) => setDraft({ ...draft, ...p });
  let patternError: string | null = null;
  for (const p of draft.patterns) {
    try {
      new RegExp(p, 'i');
    } catch {
      patternError = `Invalid pattern: ${p}`;
    }
  }
  const error = idError ?? patternError ?? (!draft.patterns.length ? 'Add at least one pattern.' : !draft.type ? 'Choose a component type.' : null);
  const results = useMemo(() => {
    if (!sample.trim() || patternError || !draft.type) return null;
    return new RuleBasedAnalyzer([draft]).analyze(sample);
  }, [sample, draft, patternError]);
  const options = SYSTEM_TYPES && 'options' in SYSTEM_TYPES ? SYSTEM_TYPES.options : [];

  return (
    <div className="lib-form">
      <IdField value={draft.id} isNew={isNew} onChange={(v) => set({ id: v })} />
      <Field label="Patterns (one per line, case-insensitive regular expressions matched as whole words)">
        <textarea
          className="input mono"
          rows={4}
          value={patternText}
          onChange={(e) => {
            setPatternText(e.target.value);
            set({ patterns: lines(e.target.value) });
          }}
        />
      </Field>
      <div className="grid3">
        <Field label="Suggests component">
          <select className="input" value={draft.type ?? ''} onChange={(e) => set({ type: e.target.value || undefined })}>
            <option value="">— choose —</option>
            {COMPONENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Suggested name" hint='Use $0 for the matched text, e.g. "$0 tool".'>
          <TextInput value={draft.name ?? ''} onChange={(v) => set({ name: v || undefined })} />
        </Field>
        <Field label="Provider">
          <TextInput value={draft.provider ?? ''} onChange={(v) => set({ provider: v || undefined })} />
        </Field>
      </div>
      <div className="row gap">
        <Field label="Confidence">
          <select className="input" value={draft.confidence} onChange={(e) => set({ confidence: e.target.value as LexiconEntry['confidence'] })}>
            <option value="high">High (pre-selected)</option>
            <option value="medium">Medium (pre-selected)</option>
            <option value="low">Low (not pre-selected)</option>
          </select>
        </Field>
        <label className="small toggle">
          <input type="checkbox" checked={!!draft.generic} onChange={(e) => set({ generic: e.target.checked || undefined })} /> Generic term (folds into a specific product of the same type)
        </label>
        <label className="small toggle">
          <input type="checkbox" checked={!!draft.platform} onChange={(e) => set({ platform: e.target.checked || undefined })} /> Model hosting platform (merges with a model family)
        </label>
      </div>
      <div className="field">
        <span className="field-label">Implies system types</span>
        <span className="chips">
          {options.map((o) => {
            const on = (draft.systemTypes ?? []).includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => set({ systemTypes: on ? (draft.systemTypes ?? []).filter((x) => x !== o.value) : [...(draft.systemTypes ?? []), o.value] })}
              >
                {o.label}
              </button>
            );
          })}
        </span>
      </div>
      <Field label="Try it">
        <TextInput value={sample} onChange={setSample} placeholder="Type a sentence to test this entry…" />
      </Field>
      {results && <p className="small callout">{results.length ? results.map((r) => `${r.name} ← ${r.matches.map((m) => `“${m.text}”`).join(', ')}`).join('; ') : 'No match.'}</p>}
      <EditorActions
        collection="lexicon"
        id={item.id}
        state={state}
        isNew={isNew}
        dirty={dirty}
        error={error}
        onSave={() => {
          useLibrary.getState().upsert('lexicon', draft);
          onSaved(draft.id);
        }}
        onCancel={() => {
          if (isNew) onCancelNew();
          else {
            reset();
            setPatternText(item.patterns.join('\n'));
          }
        }}
        onDeleted={onCancelNew}
      />
    </div>
  );
}

// ── Patterns ──────────────────────────────────────────────────────────────
export function PatternForm({ item, isNew, onSaved, onCancelNew }: FormProps<Pattern>) {
  const { draft, setDraft, dirty, idError, state, reset } = useDraft('patterns', item, isNew);
  const [asvsText, setAsvsText] = useState(item.asvs.join('\n'));
  const [testsText, setTestsText] = useState((item.tests ?? []).join('\n'));
  const set = (p: Partial<Pattern>) => setDraft({ ...draft, ...p });
  const error = idError ?? (!draft.name.trim() ? 'Name is required.' : null);
  return (
    <div className="lib-form">
      <IdField value={draft.id} isNew={isNew} onChange={(v) => set({ id: v })} />
      <Field label="Name">
        <TextInput value={draft.name} onChange={(v) => set({ name: v })} />
      </Field>
      <Field label="Expected implementation outcome">
        <TextArea value={draft.outcome} onChange={(v) => set({ outcome: v })} rows={4} />
      </Field>
      <Field label="Verification references (one per line, e.g. ASVS chapters or internal standards)">
        <textarea
          className="input"
          rows={3}
          value={asvsText}
          onChange={(e) => {
            setAsvsText(e.target.value);
            set({ asvs: lines(e.target.value) });
          }}
        />
      </Field>
      <Field label='Suggested validation tests (one per line; start with "Negative:" for tests that prove unauthorized behavior is denied)'>
        <textarea
          className="input"
          rows={4}
          value={testsText}
          onChange={(e) => {
            setTestsText(e.target.value);
            set({ tests: lines(e.target.value) });
          }}
        />
      </Field>
      <EditorActions
        collection="patterns"
        id={item.id}
        state={state}
        isNew={isNew}
        dirty={dirty}
        error={error}
        onSave={() => {
          useLibrary.getState().upsert('patterns', draft);
          onSaved(draft.id);
        }}
        onCancel={() => {
          if (isNew) onCancelNew();
          else {
            reset();
            setAsvsText(item.asvs.join('\n'));
            setTestsText((item.tests ?? []).join('\n'));
          }
        }}
        onDeleted={onCancelNew}
      />
    </div>
  );
}
