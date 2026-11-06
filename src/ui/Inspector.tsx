import { getComponentType, CATEGORY_LABEL } from '../library/catalog';
import { useStore } from '../state/store';
import { completeness, crossedBoundaries, membership, missingFlowLabels } from '../logic/analysis';
import type { Component, Flow, TrustBoundary } from '../model/types';
import { TIER_LABEL } from '../model/types';
import { DATA_CLASS_OPTIONS, Field, Progress, Select, TextArea, TextInput } from './controls';
import { QuestionList } from './QuestionList';
import { BOUNDARY_KIND_OPTIONS, CONTENT_ORIGIN_OPTIONS, PLANE_OPTIONS, TRUST_OPTIONS, YNU_OPTIONS } from './labels';
import { useTier } from './hooks';
import { componentPosture, overallPosture, type Posture } from '../logic/posture';
import { CLASS_LABEL, CLASS_RANK, heldLevel, propagate, received } from '../logic/dataflow';

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const a = useStore((s) => s.assessment)!;
  if (selection?.kind === 'component') {
    const c = a.components.find((x) => x.id === selection.id);
    if (c) return <ComponentInspector c={c} />;
  }
  if (selection?.kind === 'flow') {
    const f = a.flows.find((x) => x.id === selection.id);
    if (f) return <FlowInspector f={f} />;
  }
  if (selection?.kind === 'boundary') {
    const b = a.boundaries.find((x) => x.id === selection.id);
    if (b) return <BoundaryInspector b={b} />;
  }
  return <Summary />;
}

function Summary() {
  const a = useStore((s) => s.assessment)!;
  const tier = useTier();
  const c = completeness(a, tier);
  return (
    <div className="inspector">
      <h3>Architecture</h3>
      <p className="small muted">
        Assurance tier: <strong>{TIER_LABEL[tier]}</strong>
      </p>
      <Progress value={c.percent} />
      <PostureLine p={overallPosture(a)} label="Overall security posture" />
      <p className="small">
        {c.percent}% complete · {c.questionsAnswered}/{c.questionsTotal} questions answered · {c.unknowns} unknown · {c.flowsLabeled}/{c.flowsTotal} flows fully
        labeled · {c.crossingFlows} boundary-crossing flows
      </p>
      <h4>How to build the diagram</h4>
      <ul className="small help">
        <li>Drag components from the palette, or click one to add it.</li>
        <li>Connect a node's right or bottom handle to another node to draw a flow.</li>
        <li>Add trust boundaries and resize them around components. A component belongs to every boundary that contains its center.</li>
        <li>Select a node to answer its Appendix B questions. Some "Yes" answers offer to add related components.</li>
        <li>Flows that cross a boundary are highlighted. Label them fully (Section 7).</li>
        <li>Use the layer toggles to show or hide data-plane flows, control-plane flows, boundaries and labels.</li>
      </ul>
    </div>
  );
}

function ComponentInspector({ c }: { c: Component }) {
  const update = useStore((s) => s.updateComponent);
  const remove = useStore((s) => s.removeComponent);
  const answers = useStore((s) => s.assessment!.answers);
  const t = getComponentType(c.type);
  const set = (patch: Partial<Component>) => update(c.id, patch);
  const fullA = useStore((s) => s.assessment)!;
  const dm = propagate(fullA);
  const held = heldLevel(dm, c);
  const rec = received(fullA, dm, c.id);
  const heldHint = held.level
    ? `Handles ${CLASS_LABEL[held.level]} data (${held.basis === 'labeled' ? 'as labeled' : held.basis === 'intake' ? 'from intake data sensitivity' : `inherited from ${fullA.components.find((x) => x.id === held.from)?.name ?? 'an inbound flow'}`}).${c.classification && CLASS_RANK[rec] > CLASS_RANK[c.classification] ? ` Warning: receives ${CLASS_LABEL[rec]} data, above its approved level.` : ''}`
    : 'Set the classification this component is approved to handle.';

  const onDelete = () => {
    const n = Object.keys(answers).filter((k) => k.startsWith(`${c.id}::`)).length;
    const msg = n ? `Delete "${c.name}"? This also removes its ${n} recorded answer${n === 1 ? '' : 's'} and its flows.` : `Delete "${c.name}" and its flows?`;
    if (window.confirm(msg)) remove(c.id);
  };

  return (
    <div className="inspector">
      <div className="row between">
        <h3>
          <span aria-hidden>{t.glyph}</span> {t.label}
        </h3>
        <button type="button" className="btn small danger" onClick={onDelete}>
          Delete
        </button>
      </div>
      <p className="small muted">
        {CATEGORY_LABEL[t.category]} · {t.description}
      </p>
      <Field label="Exact name" hint='Use the real name, e.g. "Pinecone prod-kb", not "vector DB".'>
        <TextInput value={c.name} onChange={(v) => set({ name: v })} />
      </Field>
      <div className="grid2">
        <Field label="Owner / operator">
          <TextInput value={c.owner} onChange={(v) => set({ owner: v })} />
        </Field>
        <Field label="Technology / provider / version">
          <TextInput value={c.provider} onChange={(v) => set({ provider: v })} />
        </Field>
        <Field label="Environment & region">
          <TextInput value={c.environment} onChange={(v) => set({ environment: v })} />
        </Field>
        <Field label="Approved data classification" hint={heldHint}>
          <Select value={c.classification} onChange={(v) => set({ classification: v })} options={DATA_CLASS_OPTIONS} />
        </Field>
        <Field label="Identity & permissions">
          <TextInput value={c.identity} onChange={(v) => set({ identity: v })} placeholder="e.g. workload identity, scopes" />
        </Field>
        <Field label="Plane">
          <Select value={c.plane} onChange={(v) => set({ plane: v || 'data' })} options={PLANE_OPTIONS} />
        </Field>
      </div>
      <Field label="Notes (purpose, logging, failure behavior, dependencies)">
        <TextArea value={c.notes} onChange={(v) => set({ notes: v })} rows={2} />
      </Field>
      <h3 className="mt">Appendix B questions</h3>
      <PostureLine p={componentPosture(useStore.getState().assessment!, c)} label="Posture" />
      <QuestionList component={c} />
    </div>
  );
}

function FlowInspector({ f }: { f: Flow }) {
  const a = useStore((s) => s.assessment)!;
  const update = useStore((s) => s.updateFlow);
  const remove = useStore((s) => s.removeFlow);
  const set = (patch: Partial<Flow>) => update(f.id, patch);
  const src = a.components.find((c) => c.id === f.source);
  const dst = a.components.find((c) => c.id === f.target);
  const crossed = crossedBoundaries(f, membership(a));
  const missing = missingFlowLabels(f);
  const carried = propagate(a).carried.get(f.id);
  const carriedHint = carried?.inferred && carried.level ? `Inferred: carries ${CLASS_LABEL[carried.level]} data from ${src?.name ?? 'its source'}. Set explicitly to override.` : undefined;
  const boundaryNames = crossed.map((id) => a.boundaries.find((b) => b.id === id)?.name).filter(Boolean);

  return (
    <div className="inspector">
      <div className="row between">
        <h3>Flow</h3>
        <button type="button" className="btn small danger" onClick={() => remove(f.id)}>
          Delete
        </button>
      </div>
      <p className="small">
        <strong>{src?.name}</strong> → <strong>{dst?.name}</strong>
      </p>
      {crossed.length > 0 && <p className="small callout">Crosses trust boundary: {boundaryNames.join(', ')}</p>}
      {missing.length > 0 && <p className="small warn">Missing labels: {missing.join(', ')}</p>}
      <Field label="What moves (data / action)">
        <TextInput value={f.label} onChange={(v) => set({ label: v })} />
      </Field>
      <div className="grid2">
        <Field label="Data classification" hint={carriedHint}>
          <Select value={f.dataClassification} onChange={(v) => set({ dataClassification: v })} options={DATA_CLASS_OPTIONS} />
        </Field>
        <Field label="Protocol">
          <TextInput value={f.protocol} onChange={(v) => set({ protocol: v })} placeholder="HTTPS, gRPC, SQL…" />
        </Field>
        <Field label="Authentication">
          <TextInput value={f.authN} onChange={(v) => set({ authN: v })} placeholder="OAuth, mTLS, API key…" />
        </Field>
        <Field label="Authorization context">
          <TextInput value={f.authZContext} onChange={(v) => set({ authZContext: v })} placeholder="end-user delegated, service…" />
        </Field>
        <Field label="Encrypted in transit">
          <Select value={f.encrypted} onChange={(v) => set({ encrypted: v })} options={YNU_OPTIONS} />
        </Field>
        <Field label="Content origin">
          <Select value={f.contentOrigin} onChange={(v) => set({ contentOrigin: v })} options={CONTENT_ORIGIN_OPTIONS} />
        </Field>
        <Field label="Trust level">
          <Select value={f.trustLevel} onChange={(v) => set({ trustLevel: v })} options={TRUST_OPTIONS} />
        </Field>
        <Field label="Plane">
          <Select value={f.plane} onChange={(v) => set({ plane: v || 'data' })} options={PLANE_OPTIONS} />
        </Field>
      </div>
      <button type="button" className="btn small" onClick={() => update(f.id, { source: f.target, target: f.source })}>
        Reverse direction
      </button>
    </div>
  );
}

function BoundaryInspector({ b }: { b: TrustBoundary }) {
  const a = useStore((s) => s.assessment)!;
  const update = useStore((s) => s.updateBoundary);
  const remove = useStore((s) => s.removeBoundary);
  const members = membership(a);
  const inside = a.components.filter((c) => members.get(c.id)?.includes(b.id));
  const crossing = a.flows.filter((f) => crossedBoundaries(f, members).includes(b.id));
  return (
    <div className="inspector">
      <div className="row between">
        <h3>Trust boundary</h3>
        <button type="button" className="btn small danger" onClick={() => remove(b.id)}>
          Delete
        </button>
      </div>
      <Field label="Name">
        <TextInput value={b.name} onChange={(v) => update(b.id, { name: v })} />
      </Field>
      <Field label="Boundary type (Section 7)">
        <Select value={b.kind} onChange={(v) => update(b.id, { kind: v || 'other' })} options={BOUNDARY_KIND_OPTIONS} />
      </Field>
      <h4>Inside ({inside.length})</h4>
      <ul className="small plain">
        {inside.map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
        {!inside.length && <li className="muted">Drag components inside this boundary.</li>}
      </ul>
      <h4>Crossing flows ({crossing.length})</h4>
      <ul className="small plain">
        {crossing.map((f) => (
          <li key={f.id}>
            {a.components.find((c) => c.id === f.source)?.name} → {a.components.find((c) => c.id === f.target)?.name}
            {missingFlowLabels(f).length ? <span className="warn"> · incomplete labels</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PostureLine({ p, label }: { p: Posture; label: string }) {
  if (p.score === null) return <p className="small muted">{label}: not yet scored. Answer the questions to compute it.</p>;
  const cls = p.score >= 80 ? 'ok' : p.score >= 50 ? 'warn' : 'danger-text';
  return (
    <p className="small">
      {label}: <strong className={cls}>{p.score}%</strong> secure · {p.weak} weak · {p.gap} unknown
    </p>
  );
}
