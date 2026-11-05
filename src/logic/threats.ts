import { THREAT_RULES, type Cond, type ThreatRule } from '../library/threatRules';
import { answerKey, type Assessment, type Component, type Flow, type Level, type Threat } from '../model/types';
import { uid } from '../model/factory';
import { crossedBoundaries, membership } from './analysis';
import { autonomyReach, clampLevel } from './risk';

interface Ctx {
  a: Assessment;
  byId: Map<string, Component>;
  members: Map<string, string[]>;
  boundaryKind: Map<string, string>;
  types: Set<string>;
}

type Subject = { kind: 'component'; c: Component } | { kind: 'flow'; f: Flow } | { kind: 'system' };

function makeCtx(a: Assessment): Ctx {
  return {
    a,
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
export function suggestRating(a: Assessment, rule: ThreatRule, componentIds: string[]): SuggestedRating {
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
  if (conf && (a.intake.dataSensitivity === 'confidential' || a.intake.dataSensitivity === 'restricted')) {
    i += 1;
    why.push(`Impact +1: ${a.intake.dataSensitivity} data in scope.`);
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
  const s = suggestRating(a, c.rule, c.componentIds);
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
    if (t.signature && !cand) {
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
      const s = suggestRating(a, cand.rule, cand.componentIds);
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
