import { getComponentType } from '../library/catalog';
import { REASSESSMENT_TRIGGERS, type Assessment, type Component, type Intake } from '../model/types';
import { verification } from './controls';

/**
 * Compares an assessment to an earlier version (Stage 9 – maintain and
 * re-open) and derives the Section 13 reassessment triggers the changes hit.
 */

export interface Change {
  area: 'component' | 'flow' | 'boundary' | 'intake' | 'answers' | 'threat' | 'control';
  kind: 'added' | 'removed' | 'changed';
  label: string;
  detail?: string;
}

export interface Diff {
  changes: Change[];
  triggers: { id: string; label: string; because: string[] }[];
}

const MODEL_TYPES = new Set(['model_endpoint', 'model_gateway', 'model_registry', 'training_pipeline']);
const CAPABILITY_TYPES = new Set(['tool_connector', 'mcp_server', 'code_sandbox', 'browser_automation', 'enterprise_api', 'downstream_action', 'agent', 'orchestrator', 'third_party_service']);
const DATA_TYPES = new Set(['knowledge_source', 'vector_store', 'database', 'object_storage', 'ingestion_pipeline', 'cache', 'memory_store']);
const PROMPT_TYPES = new Set(['prompt_assembly', 'guardrail', 'memory_store', 'orchestrator', 'approval_gate']);
const USE_FIELDS: (keyof Intake)[] = ['userPopulation', 'exposure', 'autonomy', 'criticality', 'regulatedImpact', 'systemTypes', 'vulnerablePopulations', 'reversibility'];
const DATA_FIELDS: (keyof Intake)[] = ['dataSensitivity', 'dataTypes'];

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

export function diffAssessments(before: Assessment, after: Assessment): Diff {
  const changes: Change[] = [];
  const hits = new Map<string, string[]>();
  const hit = (trigger: string, because: string) => hits.set(trigger, [...(hits.get(trigger) ?? []), because]);
  const typeLabel = (c: Component) => getComponentType(c.type).label;

  const classify = (c: Component, what: string) => {
    if (MODEL_TYPES.has(c.type)) hit('model', what);
    if (CAPABILITY_TYPES.has(c.type)) hit('capability', what);
    if (DATA_TYPES.has(c.type)) hit('data', what);
    if (PROMPT_TYPES.has(c.type)) hit('prompting', what);
  };

  // Components
  const bc = new Map(before.components.map((c) => [c.id, c]));
  const ac = new Map(after.components.map((c) => [c.id, c]));
  for (const c of after.components) {
    const old = bc.get(c.id);
    if (!old) {
      changes.push({ area: 'component', kind: 'added', label: c.name, detail: typeLabel(c) });
      classify(c, `${c.name} added`);
      continue;
    }
    const diffs: string[] = [];
    if (old.name !== c.name) diffs.push(`renamed from "${old.name}"`);
    if (old.provider !== c.provider) {
      diffs.push(`provider/version "${old.provider || '—'}" → "${c.provider || '—'}"`);
      if (MODEL_TYPES.has(c.type)) hit('model', `${c.name} provider/version changed`);
      else if (CAPABILITY_TYPES.has(c.type)) hit('capability', `${c.name} provider/version changed`);
    }
    if (old.environment !== c.environment) {
      diffs.push(`environment "${old.environment || '—'}" → "${c.environment || '—'}"`);
      if (MODEL_TYPES.has(c.type)) hit('model', `${c.name} hosting/region changed`);
    }
    if (old.classification !== c.classification) {
      diffs.push(`classification ${old.classification || '—'} → ${c.classification || '—'}`);
      hit('data', `${c.name} classification changed`);
    }
    if (old.identity !== c.identity) {
      diffs.push('identity/permissions changed');
      if (CAPABILITY_TYPES.has(c.type)) hit('capability', `${c.name} permissions changed`);
    }
    if (diffs.length) changes.push({ area: 'component', kind: 'changed', label: c.name, detail: diffs.join('; ') });
  }
  for (const c of before.components)
    if (!ac.has(c.id)) {
      changes.push({ area: 'component', kind: 'removed', label: c.name, detail: typeLabel(c) });
      classify(c, `${c.name} removed`);
    }

  // Flows
  const name = (a: Assessment, id: string) => a.components.find((c) => c.id === id)?.name ?? '?';
  const bf = new Map(before.flows.map((f) => [f.id, f]));
  const af = new Map(after.flows.map((f) => [f.id, f]));
  for (const f of after.flows) {
    const old = bf.get(f.id);
    const label = `${name(after, f.source)} → ${name(after, f.target)}`;
    if (!old) {
      changes.push({ area: 'flow', kind: 'added', label });
      const tgt = after.components.find((c) => c.id === f.target);
      if (tgt && CAPABILITY_TYPES.has(tgt.type)) hit('capability', `new flow to ${tgt.name}`);
      if (tgt && DATA_TYPES.has(tgt.type)) hit('data', `new flow to ${tgt.name}`);
    } else if (!same({ ...old, id: '' }, { ...f, id: '' })) {
      changes.push({ area: 'flow', kind: 'changed', label });
      if (old.dataClassification !== f.dataClassification) hit('data', `${label} classification changed`);
    }
  }
  for (const f of before.flows) if (!af.has(f.id)) changes.push({ area: 'flow', kind: 'removed', label: `${name(before, f.source)} → ${name(before, f.target)}` });

  // Boundaries
  const bb = new Map(before.boundaries.map((b) => [b.id, b]));
  for (const b of after.boundaries) {
    const old = bb.get(b.id);
    if (!old) changes.push({ area: 'boundary', kind: 'added', label: b.name });
    else if (old.name !== b.name || old.kind !== b.kind || !same(old.position, b.position) || old.width !== b.width || old.height !== b.height)
      changes.push({ area: 'boundary', kind: 'changed', label: b.name });
    if (!old && b.kind === 'tenant-tenant') hit('use', `tenant boundary ${b.name} added`);
  }
  for (const b of before.boundaries) if (!after.boundaries.some((x) => x.id === b.id)) changes.push({ area: 'boundary', kind: 'removed', label: b.name });

  // Intake
  for (const k of Object.keys(after.intake) as (keyof Intake)[]) {
    if (same(before.intake[k], after.intake[k])) continue;
    changes.push({ area: 'intake', kind: 'changed', label: String(k), detail: `${JSON.stringify(before.intake[k])} → ${JSON.stringify(after.intake[k])}` });
    if (USE_FIELDS.includes(k)) hit('use', `intake ${String(k)} changed`);
    if (DATA_FIELDS.includes(k)) hit('data', `intake ${String(k)} changed`);
  }

  // Answers
  const keys = new Set([...Object.keys(before.answers), ...Object.keys(after.answers)]);
  let answerChanges = 0;
  for (const k of keys) if (before.answers[k]?.status !== after.answers[k]?.status) answerChanges += 1;
  if (answerChanges) changes.push({ area: 'answers', kind: 'changed', label: `${answerChanges} answer${answerChanges === 1 ? '' : 's'} changed` });

  // Threats
  const bt = new Map(before.threats.map((t) => [t.id, t]));
  for (const t of after.threats) {
    const old = bt.get(t.id);
    if (!old && t.status === 'accepted') changes.push({ area: 'threat', kind: 'added', label: `${t.ref} ${t.title}` });
    else if (old && old.status !== t.status) changes.push({ area: 'threat', kind: 'changed', label: `${t.ref} ${t.title}`, detail: `${old.status} → ${t.status}` });
    else if (old && (old.residualLikelihood !== t.residualLikelihood || old.residualImpact !== t.residualImpact || old.treatment !== t.treatment))
      changes.push({ area: 'threat', kind: 'changed', label: `${t.ref} ${t.title}`, detail: 'treatment or residual risk changed' });
  }

  // Controls
  const bctl = new Map(before.controls.map((c) => [c.id, c]));
  for (const c of after.controls) {
    const old = bctl.get(c.id);
    if (!old) changes.push({ area: 'control', kind: 'added', label: `${c.ref} ${c.requirement.split(':')[0]}` });
    else if (verification(old) !== verification(c)) {
      changes.push({ area: 'control', kind: 'changed', label: `${c.ref} ${c.requirement.split(':')[0]}`, detail: `${verification(old)} → ${verification(c)}` });
      if (verification(c) === 'failing') hit('incident', `${c.ref} validation now failing`);
    }
  }

  const triggers = REASSESSMENT_TRIGGERS.filter((t) => hits.has(t.id)).map((t) => ({ id: t.id, label: t.label, because: [...new Set(hits.get(t.id))] }));
  return { changes, triggers };
}
