import { getComponentType } from '../library/catalog';
import { questionsForAreas, type Question } from '../library/questions';
import { answerKey, type Assessment, type Component, type Flow, type Tier, type TrustBoundary } from '../model/types';

export const NODE_W = 200;
export const NODE_H = 64;

/** A component belongs to every boundary whose rectangle contains its center. */
export function boundariesOf(c: Component, boundaries: TrustBoundary[]): string[] {
  const cx = c.position.x + NODE_W / 2;
  const cy = c.position.y + NODE_H / 2;
  return boundaries
    .filter((b) => cx >= b.position.x && cx <= b.position.x + b.width && cy >= b.position.y && cy <= b.position.y + b.height)
    .map((b) => b.id);
}

export function membership(a: Assessment): Map<string, string[]> {
  return new Map(a.components.map((c) => [c.id, boundariesOf(c, a.boundaries)]));
}

/** Boundaries crossed by a flow: those containing exactly one of its endpoints. */
export function crossedBoundaries(f: Flow, members: Map<string, string[]>): string[] {
  const s = new Set(members.get(f.source) ?? []);
  const t = new Set(members.get(f.target) ?? []);
  return [...[...s].filter((x) => !t.has(x)), ...[...t].filter((x) => !s.has(x))];
}

/** Section 7: each flow should be labeled with classification, protocol, auth, trust and origin. */
export function missingFlowLabels(f: Flow): string[] {
  const missing: string[] = [];
  if (!f.label) missing.push('description');
  if (!f.dataClassification) missing.push('classification');
  if (!f.protocol) missing.push('protocol');
  if (!f.authN) missing.push('authentication');
  if (!f.encrypted) missing.push('encryption');
  if (!f.contentOrigin) missing.push('content origin');
  if (!f.trustLevel) missing.push('trust level');
  return missing;
}

export function questionsFor(c: Component, tier: Tier): Question[] {
  return questionsForAreas(getComponentType(c.type).areas).filter((q) => q.tier <= tier);
}

export interface ComponentProgress {
  total: number;
  answered: number;
  unknown: number;
}

export function componentProgress(a: Assessment, c: Component, tier: Tier): ComponentProgress {
  const qs = questionsFor(c, tier);
  let answered = 0;
  let unknown = 0;
  for (const q of qs) {
    const ans = a.answers[answerKey(c.id, q.id)];
    if (!ans) continue;
    if (ans.status === 'unknown') unknown += 1;
    else answered += 1;
  }
  return { total: qs.length, answered, unknown };
}

export interface Gap {
  kind: 'unknown' | 'unanswered' | 'flow-labels' | 'boundary-crossing-unlabeled' | 'isolated';
  targetId: string;
  targetName: string;
  detail: string;
  questionId?: string;
  owner?: string;
  dueDate?: string;
}

export function computeGaps(a: Assessment, tier: Tier): Gap[] {
  const gaps: Gap[] = [];
  const byId = new Map(a.components.map((c) => [c.id, c]));
  const members = membership(a);
  const connected = new Set(a.flows.flatMap((f) => [f.source, f.target]));

  for (const c of a.components) {
    for (const q of questionsFor(c, tier)) {
      const ans = a.answers[answerKey(c.id, q.id)];
      if (!ans) gaps.push({ kind: 'unanswered', targetId: c.id, targetName: c.name, detail: q.text, questionId: q.id });
      else if (ans.status === 'unknown')
        gaps.push({ kind: 'unknown', targetId: c.id, targetName: c.name, detail: q.text, questionId: q.id, owner: ans.owner, dueDate: ans.dueDate });
    }
    if (!connected.has(c.id)) gaps.push({ kind: 'isolated', targetId: c.id, targetName: c.name, detail: 'Component has no data or control flows.' });
  }
  for (const f of a.flows) {
    const missing = missingFlowLabels(f);
    if (!missing.length) continue;
    const name = `${byId.get(f.source)?.name ?? '?'} → ${byId.get(f.target)?.name ?? '?'}`;
    const crossing = crossedBoundaries(f, members).length > 0;
    gaps.push({
      kind: crossing ? 'boundary-crossing-unlabeled' : 'flow-labels',
      targetId: f.id,
      targetName: name,
      detail: `Missing: ${missing.join(', ')}`,
    });
  }
  return gaps;
}

export interface Completeness {
  questionsTotal: number;
  questionsAnswered: number;
  unknowns: number;
  flowsTotal: number;
  flowsLabeled: number;
  crossingFlows: number;
  percent: number;
}

export function completeness(a: Assessment, tier: Tier): Completeness {
  let total = 0;
  let answered = 0;
  let unknowns = 0;
  for (const c of a.components) {
    const p = componentProgress(a, c, tier);
    total += p.total;
    answered += p.answered;
    unknowns += p.unknown;
  }
  const members = membership(a);
  const flowsLabeled = a.flows.filter((f) => missingFlowLabels(f).length === 0).length;
  const crossingFlows = a.flows.filter((f) => crossedBoundaries(f, members).length > 0).length;
  const denom = total + a.flows.length;
  const percent = denom === 0 ? 0 : Math.round(((answered + flowsLabeled) / denom) * 100);
  return { questionsTotal: total, questionsAnswered: answered, unknowns, flowsTotal: a.flows.length, flowsLabeled, crossingFlows, percent };
}
