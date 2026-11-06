import { THREAT_RULES, type Cond, type ThreatRule } from '../library/threatRules';
import { answerKey, type Assessment, type Component, type Flow, type Level, type Threat } from '../model/types';
import { uid } from '../model/factory';
import { crossedBoundaries, membership } from './analysis';
import { autonomyReach, clampLevel } from './risk';
import { classify } from './posture';
import { CLASS_LABEL, CLASS_RANK, propagate, received, type DataModel } from './dataflow';
import { questionsForAreas } from '../library/questions';
import { getComponentType } from '../library/catalog';
import type { AreaId } from '../model/types';

/** Appendix B areas whose weak answers make a threat domain more likely. */
const DOMAIN_AREAS: Record<string, AreaId[]> = {
  'prompt-injection': ['B1', 'B4', 'B5', 'B17'],
  'data-disclosure': ['B1', 'B3', 'B4', 'B5', 'B11', 'B15'],
  'excessive-agency': ['B7', 'B8', 'B10', 'B16'],
  identity: ['B1', 'B2', 'B8', 'B10', 'B13'],
  'rag-poisoning': ['B5', 'B11'],
  'memory-poisoning': ['B6'],
  'multi-agent': ['B7'],
  'output-handling': ['B1', 'B2', 'B9', 'B10'],
  'model-integrity': ['B3', 'B12', 'B13'],
  availability: ['B1', 'B3', 'B7', 'B14'],
  'tenant-isolation': ['B5', 'B11', 'B13'],
  'human-workflow': ['B16'],
  monitoring: ['B15'],
  traditional: ['B1', 'B2', 'B10', 'B11', 'B13', 'B14', 'B17'],
};

interface Ctx {
  a: Assessment;
  dm: DataModel;
  byId: Map<string, Component>;
  members: Map<string, string[]>;
  boundaryKind: Map<string, string>;
  types: Set<string>;
}

type Subject = { kind: 'component'; c: Component } | { kind: 'flow'; f: Flow } | { kind: 'system' };

function makeCtx(a: Assessment): Ctx {
  return {
    a,
    dm: propagate(a),
    byId: new Map(a.components.map((c) => [c.id, c])),
    members: membership(a),
    boundaryKind: new Map(a.boundaries.map((b) => [b.id, b.kind])),
    types: new Set(a.components.map((c) => c.type)),
  };
}

function evalCond(cond: Cond, ctx: Ctx, s: Subject): boolean {
  switch (cond.kind) {
    case 'type':
      return s.kind === 'component' && cond.types.includes(s.c.type);
    case 'has':
      return cond.types.some((t) => ctx.types.has(t));
    case 'lacks':
      return !cond.types.some((t) => ctx.types.has(t));
    case 'any':
      return cond.conds.some((c) => evalCond(c, ctx, s));
    case 'all':
      return cond.conds.every((c) => evalCond(c, ctx, s));
    case 'not':
      return !evalCond(cond.cond, ctx, s);
    case 'intake': {
      const v = ctx.a.intake[cond.field];
      return Array.isArray(v) ? v.some((x) => cond.in.includes(String(x))) : cond.in.includes(String(v));
    }
    case 'data': {
      const lv = s.kind === 'component' ? ctx.dm.held.get(s.c.id)?.level : s.kind === 'flow' ? ctx.dm.carried.get(s.f.id)?.level : undefined;
      return !!lv && CLASS_RANK[lv] >= CLASS_RANK[cond.min];
    }
    case 'dataAboveApproval': {
      if (s.kind !== 'component' || !s.c.classification) return false;
      return CLASS_RANK[received(ctx.a, ctx.dm, s.c.id)] > CLASS_RANK[s.c.classification];
    }
    case 'answer': {
      if (s.kind !== 'component') return false;
      const ans = ctx.a.answers[answerKey(s.c.id, cond.q)];
      return !!ans && cond.in.includes(ans.status);
    }
    case 'connected': {
      if (s.kind !== 'component') return false;
      return ctx.a.flows.some((f) => {
        const other = f.target === s.c.id && cond.direction !== 'out' ? f.source : f.source === s.c.id && cond.direction !== 'in' ? f.target : null;
        return other !== null && cond.types.includes(ctx.byId.get(other)?.type ?? '');
      });
    }
    case 'flow': {
      if (s.kind !== 'flow') return false;
      const f = s.f;
      const src = ctx.byId.get(f.source);
      const dst = ctx.byId.get(f.target);
      if (!src || !dst) return false;
      if (cond.source && !cond.source.includes(src.type)) return false;
      if (cond.target && !cond.target.includes(dst.type)) return false;
      if (cond.origin && !cond.origin.includes(f.contentOrigin)) return false;
      if (cond.plane && f.plane !== cond.plane) return false;
      if (cond.encrypted && !cond.encrypted.includes(f.encrypted)) return false;
      if (cond.crosses !== undefined || cond.crossKinds) {
        const crossed = crossedBoundaries(f, ctx.members);
        if (cond.crosses === true && crossed.length === 0) return false;
        if (cond.crosses === false && crossed.length > 0) return false;
        if (cond.crossKinds && !crossed.some((b) => cond.crossKinds!.includes(ctx.boundaryKind.get(b) as never))) return false;
      }
      return true;
    }
  }
}

export interface Candidate {
  signature: string;
  rule: ThreatRule;
  componentIds: string[];
  flowIds: string[];
  vars: Record<string, string>;
}

export function generateCandidates(a: Assessment, rules: ThreatRule[] = THREAT_RULES): Candidate[] {
  const ctx = makeCtx(a);
  const system = a.intake.systemName || 'the system';
  const out: Candidate[] = [];
  for (const rule of rules) {
    if (rule.scope === 'component') {
      for (const c of a.components) {
        const s: Subject = { kind: 'component', c };
        if (rule.when.every((w) => evalCond(w, ctx, s)))
          out.push({ signature: `${rule.id}:${c.id}`, rule, componentIds: [c.id], flowIds: [], vars: { name: c.name, system } });
      }
    } else if (rule.scope === 'flow') {
      for (const f of a.flows) {
        const s: Subject = { kind: 'flow', f };
        if (rule.when.every((w) => evalCond(w, ctx, s)))
          out.push({
            signature: `${rule.id}:${f.id}`,
            rule,
            componentIds: [f.source, f.target],
            flowIds: [f.id],
            vars: { src: ctx.byId.get(f.source)?.name ?? '?', dst: ctx.byId.get(f.target)?.name ?? '?', system },
          });
      }
    } else {
      const s: Subject = { kind: 'system' };
      if (rule.when.every((w) => evalCond(w, ctx, s))) {
        const involved = a.components.filter((c) => rule.involves?.includes(c.type)).map((c) => c.id);
        out.push({ signature: `${rule.id}:system`, rule, componentIds: involved, flowIds: [], vars: { system } });
      }
    }
  }
  return dedupe(out, a);
}

/**
 * Merges near-duplicate candidates:
 *  - component rules firing on components joined by a flow (e.g. a tool and the API it calls)
 *  - flow rules firing on several flows into the same target (one scenario per target)
 */
function dedupe(cands: Candidate[], a: Assessment): Candidate[] {
  const out: Candidate[] = [];
  const name = (id: string) => a.components.find((c) => c.id === id)?.name ?? '?';
  const byRule = new Map<string, Candidate[]>();
  for (const c of cands) byRule.set(c.rule.id, [...(byRule.get(c.rule.id) ?? []), c]);
  for (const group of byRule.values()) {
    const rule = group[0].rule;
    if (group.length === 1 || rule.scope === 'system') {
      out.push(...group);
      continue;
    }
    if (rule.scope === 'flow') {
      const byTarget = new Map<string, Candidate[]>();
      for (const c of group) byTarget.set(c.componentIds[1], [...(byTarget.get(c.componentIds[1]) ?? []), c]);
      for (const [target, cs] of byTarget) {
        if (cs.length === 1) {
          out.push(cs[0]);
          continue;
        }
        const sources = cs.map((c) => c.componentIds[0]);
        out.push({
          signature: `${rule.id}:${cs.map((c) => c.flowIds[0]).sort().join('+')}`,
          rule,
          componentIds: [...new Set([...sources, target])],
          flowIds: cs.map((c) => c.flowIds[0]),
          vars: { ...cs[0].vars, src: sources.map(name).join(', '), dst: name(target) },
        });
      }
      continue;
    }
    // Component scope: union-find over subjects connected by a direct flow.
    const ids = group.map((c) => c.componentIds[0]);
    const parent = new Map(ids.map((id) => [id, id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    const set = new Set(ids);
    for (const f of a.flows) if (set.has(f.source) && set.has(f.target)) parent.set(find(f.target), find(f.source));
    const clusters = new Map<string, string[]>();
    for (const id of ids) clusters.set(find(id), [...(clusters.get(find(id)) ?? []), id]);
    for (const members of clusters.values()) {
      if (members.length === 1) {
        out.push(group.find((c) => c.componentIds[0] === members[0])!);
        continue;
      }
      // Order upstream-first so the name reads in flow direction.
      const ordered = [...members].sort((x, y) => Number(a.flows.some((f) => f.source === y && f.target === x)) - Number(a.flows.some((f) => f.source === x && f.target === y)));
      out.push({
        signature: `${rule.id}:${[...members].sort().join('+')}`,
        rule,
        componentIds: ordered,
        flowIds: [],
        vars: { ...group[0].vars, name: ordered.map(name).join(' → ') },
      });
    }
  }
  return out;
}

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

export interface SuggestedRating {
  likelihood: Exclude<Level, 0>;
  impact: Exclude<Level, 0>;
  signals: string[];
  rationale: string;
}

/** Suggested inherent rating from the rule baseline, Appendix B answers and intake. Analysts adjust it. */
export function suggestRating(a: Assessment, rule: ThreatRule, componentIds: string[], flowIds: string[] = []): SuggestedRating {
  const why: string[] = [`Baseline for rule ${rule.id}: likelihood ${rule.likelihood}, impact ${rule.impactLevel}.`];
  const signals: string[] = [];
  let l = rule.likelihood as number;
  let i = rule.impactLevel as number;

  let bump = 0;
  for (const sig of rule.signals ?? []) {
    const hit = componentIds.some((id) => {
      const ans = a.answers[answerKey(id, sig.q)];
      return ans && sig.in.includes(ans.status);
    });
    if (hit) {
      signals.push(sig.note);
      bump += sig.bump ?? 1;
    }
  }
  // Other weak answers on the involved components, in Appendix B areas relevant to this threat domain.
  const ruleQs = new Set((rule.signals ?? []).map((x) => x.q));
  const areas = DOMAIN_AREAS[rule.domain] ?? [];
  const related = new Map<string, string>();
  for (const id of componentIds) {
    const c = a.components.find((x) => x.id === id);
    if (!c) continue;
    for (const q of questionsForAreas(getComponentType(c.type).areas)) {
      if (ruleQs.has(q.id) || !areas.includes(q.area)) continue;
      if (classify(q, a.answers[answerKey(id, q.id)]) === 'weak') related.set(q.id, q.text);
    }
  }
  if (related.size) {
    bump += 1;
    for (const [qid, text] of [...related].slice(0, 4)) signals.push(`${qid}: weak answer (${text.length > 70 ? `${text.slice(0, 69)}…` : text})`);
    if (related.size > 4) signals.push(`…and ${related.size - 4} more weak answers`);
  }
  if (bump) {
    l += Math.min(bump, 2);
    why.push(`Likelihood +${Math.min(bump, 2)} from answers indicating weakness.`);
  }
  if (rule.external && a.intake.exposure === 'public') {
    l += 1;
    signals.push('Intake: system is publicly exposed');
    why.push('Likelihood +1: public exposure.');
  }

  const conf = rule.objectives.some((o) => o === 'confidentiality' || o === 'privacy');
  if (conf) {
    // Prefer the sensitivity actually on this flow / at these components; fall back to the intake.
    const dm = propagate(a);
    const levels = flowIds.length ? flowIds.map((id) => dm.carried.get(id)?.level ?? '') : componentIds.map((id) => dm.held.get(id)?.level ?? '');
    const local = levels.reduce((m, l) => (CLASS_RANK[l] > CLASS_RANK[m] ? l : m), '' as (typeof levels)[number]);
    const level = local || a.intake.dataSensitivity;
    if (level === 'confidential' || level === 'restricted') {
      i += 1;
      why.push(`Impact +1: ${CLASS_LABEL[level]} data ${local ? (flowIds.length ? 'on this flow' : 'handled here') : 'in scope (intake)'}.`);
    }
  }
  const integ = rule.objectives.some((o) => o === 'integrity' || o === 'safety');
  const regulated = a.intake.regulatedImpact.some((x) => x !== 'none');
  if (integ && (a.intake.reversibility === 'irreversible' || regulated)) {
    i += 1;
    why.push(`Impact +1: ${a.intake.reversibility === 'irreversible' ? 'irreversible actions' : 'regulated or material business impact'}.`);
  }
  const reach = autonomyReach(a);
  if (reach.level >= 3 && ['excessive-agency', 'multi-agent', 'human-workflow', 'availability'].includes(rule.domain)) {
    i += 1;
    why.push(`Impact +1: autonomy/reach is ${reach.level >= 4 ? 'Critical' : 'High'} (Section 9 modifier).`);
  }
  return { likelihood: clampLevel(l), impact: clampLevel(i), signals, rationale: why.join(' ') };
}

function nextRef(threats: Threat[]): string {
  const max = threats.reduce((m, t) => Math.max(m, Number(t.ref.replace(/\D/g, '')) || 0), 0);
  return `TS-${String(max + 1).padStart(3, '0')}`;
}

export function emptyThreat(ref: string): Threat {
  return {
    id: uid('t'),
    ref,
    ruleId: null,
    signature: null,
    stale: false,
    edited: false,
    status: 'accepted',
    dismissReason: '',
    domain: 'traditional',
    title: '',
    componentIds: [],
    flowIds: [],
    actor: '',
    asset: '',
    objectives: [],
    preconditions: '',
    attackPath: '',
    impact: '',
    frameworks: [],
    existingControls: '',
    evidence: '',
    signals: [],
    inherentLikelihood: 0,
    inherentImpact: 0,
    ratingRationale: '',
    ratingSuggested: false,
    treatment: '',
    patterns: [],
    requirements: '',
    owner: '',
    dueDate: '',
    validation: '',
    residualLikelihood: 0,
    residualImpact: 0,
    residualRationale: '',
    riskOwner: '',
    reviewDate: '',
  };
}

function scenarioFields(c: Candidate) {
  const r = c.rule;
  return {
    domain: r.domain,
    title: fill(r.title, c.vars),
    actor: fill(r.actor, c.vars),
    asset: fill(r.asset, c.vars),
    objectives: [...r.objectives],
    preconditions: fill(r.preconditions, c.vars),
    attackPath: fill(r.attackPath, c.vars),
    impact: fill(r.impact, c.vars),
    frameworks: r.tags.map((x) => ({ ...x })),
    patterns: [...r.patterns],
  };
}

export function newThreatFromCandidate(a: Assessment, c: Candidate, ref: string): Threat {
  const s = suggestRating(a, c.rule, c.componentIds, c.flowIds);
  return {
    ...emptyThreat(ref),
    ruleId: c.rule.id,
    signature: c.signature,
    status: 'candidate',
    componentIds: c.componentIds,
    flowIds: c.flowIds,
    ...scenarioFields(c),
    signals: s.signals,
    inherentLikelihood: s.likelihood,
    inherentImpact: s.impact,
    ratingRationale: s.rationale,
    ratingSuggested: true,
  };
}

export interface RefreshResult {
  threats: Threat[];
  added: number;
  stale: number;
  removed: number;
}

/**
 * Re-runs the rules against the current architecture without losing analyst
 * work: new matches become candidates, untouched candidates are refreshed,
 * and threats whose rule no longer matches are flagged stale (or removed if
 * they were untouched candidates).
 */
export function refreshThreats(a: Assessment, rules: ThreatRule[] = THREAT_RULES): RefreshResult {
  const candidates = generateCandidates(a, rules);
  const bySig = new Map(candidates.map((c) => [c.signature, c]));
  const componentIds = new Set(a.components.map((c) => c.id));
  const flowIds = new Set(a.flows.map((f) => f.id));
  const seen = new Set<string>();
  let staleCount = 0;
  let removed = 0;
  const threats: Threat[] = [];

  for (const t of a.threats) {
    const cand = t.signature ? bySig.get(t.signature) : undefined;
    if (t.ruleId && t.signature && !cand) {
      if (t.status === 'candidate' && !t.edited) {
        removed += 1;
        continue;
      }
      staleCount += t.stale ? 0 : 1;
      threats.push({ ...t, stale: true, componentIds: t.componentIds.filter((id) => componentIds.has(id)), flowIds: t.flowIds.filter((id) => flowIds.has(id)) });
      continue;
    }
    if (!cand) {
      // Custom threat: drop references to deleted elements.
      threats.push({ ...t, componentIds: t.componentIds.filter((id) => componentIds.has(id)), flowIds: t.flowIds.filter((id) => flowIds.has(id)) });
      continue;
    }
    seen.add(cand.signature);
    let next: Threat = { ...t, stale: false, componentIds: cand.componentIds, flowIds: cand.flowIds };
    if (!t.edited) next = { ...next, ...scenarioFields(cand) };
    if (t.ratingSuggested) {
      const s = suggestRating(a, cand.rule, cand.componentIds, cand.flowIds);
      next = { ...next, inherentLikelihood: s.likelihood, inherentImpact: s.impact, signals: s.signals, ratingRationale: s.rationale };
    }
    threats.push(next);
  }

  let added = 0;
  for (const c of candidates) {
    if (seen.has(c.signature) || a.threats.some((t) => t.signature === c.signature)) continue;
    threats.push(newThreatFromCandidate(a, c, nextRef(threats)));
    added += 1;
  }
  return { threats, added, stale: staleCount, removed };
}

export function nextThreatRef(a: Assessment): string {
  return nextRef(a.threats);
}

/**
 * Section 9 causal narrative, composed from the worksheet fields:
 * "A [actor] exploits [weakness] through [entry point / boundary] to [action],
 * causing [impact]. Existing controls are [controls]; evidence is [evidence or gap]."
 */
export function narrative(t: Threat, a: Assessment): string {
  const names = t.componentIds.map((id) => a.components.find((c) => c.id === id)?.name).filter((n): n is string => !!n);
  const where = names.length ? names.join(' → ') : 'the system';
  // Lower-case a leading word unless it starts a proper/component name or an acronym.
  const soft = (s: string) => {
    const x = s.trim().replace(/\.$/, '');
    if (!x) return x;
    if (names.some((n) => x.startsWith(n)) || /^[A-Z0-9]{2,}/.test(x)) return x;
    return x.charAt(0).toLowerCase() + x.slice(1);
  };
  const actor = soft(t.actor) || '[threat actor]';
  const article = /^[aeiou]/i.test(actor) ? 'An' : 'A';
  const step = soft(t.attackPath.split('\n')[0].replace(/^\d+\.\s*/, '')) || '[attack path]';
  const weakness = t.preconditions.trim().replace(/\.$/, '') || '[weakness / precondition]';
  return (
    `${article} ${actor} exploits a weakness (${weakness}) through ${where}: ${step}, causing ${soft(t.impact) || '[impact]'}. ` +
    `Existing controls are ${soft(t.existingControls) || '[not yet documented]'}; evidence is ${soft(t.evidence) || '[gap]'}.`
  );
}
