import { lookup } from '../library/frameworks';
import type { Assessment, FrameworkRef, Threat } from '../model/types';
import { crossedBoundaries, membership } from './analysis';
import { emptyThreat } from './threats';
import { propagate, CLASS_LABEL, CLASS_RANK } from './dataflow';
import type { DataClass } from '../model/types';

/**
 * Attack-path analysis (Stage 4: "walk each data flow, trust boundary,
 * identity, capability"). Finds multi-step chains from attacker-reachable
 * sources, through an AI component that can turn content into instructions,
 * to a high-impact sink, crossing at least one trust boundary.
 */

const SOURCES: Record<string, string> = {
  end_user: 'a malicious user',
  external_system: 'an external caller',
  file_upload: 'an uploaded file',
  event_webhook: 'an inbound event',
  knowledge_source: 'a poisoned document',
  third_party_service: 'third-party content',
  mcp_server: 'a malicious tool response',
  browser_automation: 'hostile web content',
};

/** Where untrusted content becomes instructions. */
const PIVOTS = new Set(['prompt_assembly', 'model_endpoint', 'model_gateway', 'agent', 'orchestrator']);

export type SinkCategory = 'action' | 'execution' | 'exfiltration' | 'persistence' | 'output';
const SINKS: Record<string, SinkCategory> = {
  downstream_action: 'action',
  enterprise_api: 'action',
  tool_connector: 'action',
  mcp_server: 'action',
  code_sandbox: 'execution',
  third_party_service: 'exfiltration',
  browser_automation: 'exfiltration',
  memory_store: 'persistence',
  // Output shown to users: manipulated answers, phishing, rendering-based exfiltration.
  // Only counted when the source is not the requesting user themselves.
  chat_ui: 'output',
  web_ui: 'output',
};

export const SINK_LABEL: Record<SinkCategory, string> = {
  action: 'Unauthorized action',
  execution: 'Code execution',
  exfiltration: 'Data exfiltration',
  persistence: 'Persistent compromise',
  output: 'Manipulated output',
};

/** Calls to these return data to the caller, so a request flow implies a response edge. */
const RESPONDS = new Set([
  'vector_store',
  'database',
  'cache',
  'memory_store',
  'object_storage',
  'rag_retriever',
  'model_endpoint',
  'model_gateway',
  'tool_connector',
  'mcp_server',
  'enterprise_api',
  'browser_automation',
  'third_party_service',
  'code_sandbox',
]);

export interface AttackPath {
  key: string;
  steps: string[]; // component ids, source → sink
  category: SinkCategory;
  boundaries: string[]; // boundary ids crossed
  pivots: string[];
  gated: boolean; // passes an approval gate
  guarded: boolean; // passes a guardrail
  severity: 1 | 2 | 3 | 4;
  title: string;
  dataLevel: string;
}

interface Edge {
  to: string;
  flowId: string | null; // null for implied response edges
  via: string; // flow used, for boundary crossing
}

export function findAttackPaths(a: Assessment, limit = 30): AttackPath[] {
  const byId = new Map(a.components.map((c) => [c.id, c]));
  const members = membership(a);
  const adj = new Map<string, Edge[]>();
  const add = (from: string, e: Edge) => adj.set(from, [...(adj.get(from) ?? []), e]);
  const crossingOf = new Map<string, string[]>();
  for (const f of a.flows) {
    if (f.plane === 'control') continue;
    crossingOf.set(f.id, crossedBoundaries(f, members));
    add(f.source, { to: f.target, flowId: f.id, via: f.id });
    const t = byId.get(f.target);
    if (t && RESPONDS.has(t.type)) add(f.target, { to: f.source, flowId: null, via: f.id });
  }
  const dm = propagate(a);

  const best = new Map<string, AttackPath>();
  for (const src of a.components.filter((c) => SOURCES[c.type])) {
    // BFS over (node, seenPivot) keeping the shortest path; max 8 hops.
    type State = { node: string; pivot: boolean; path: string[]; flows: string[] };
    const queue: State[] = [{ node: src.id, pivot: false, path: [src.id], flows: [] }];
    const seen = new Set<string>([`${src.id}|0`]);
    while (queue.length) {
      const s = queue.shift()!;
      if (s.path.length > 8) continue;
      for (const e of adj.get(s.node) ?? []) {
        if (s.path.includes(e.to)) continue;
        const to = byId.get(e.to);
        if (!to) continue;
        const pivot = s.pivot || PIVOTS.has(to.type);
        const path = [...s.path, e.to];
        const flows = [...s.flows, e.via];
        const cat = SINKS[to.type];
        if (cat && s.pivot && e.to !== src.id && !(cat === 'output' && (src.type === 'end_user' || s.path.includes(e.to)))) {
          const boundaries = [...new Set(flows.flatMap((f) => crossingOf.get(f) ?? []))];
          if (boundaries.length) {
            const key = `${src.id}>${e.to}`;
            const prev = best.get(key);
            if (!prev || prev.steps.length > path.length) {
              const comps = path.map((id) => byId.get(id)!);
              const gated = comps.some((c) => c.type === 'approval_gate');
              const guarded = comps.some((c) => c.type === 'guardrail');
              const base = cat === 'execution' || cat === 'action' ? 4 : cat === 'output' ? 2 : 3;
              const severity = Math.max(1, base - (gated ? 2 : 0) - (guarded ? 1 : 0) + (boundaries.length > 1 ? 0 : -1) + (a.intake.exposure === 'public' ? 1 : 0));
              const level = flows.map((f) => dm.carried.get(f)?.level ?? '').reduce<DataClass>((m, l) => (CLASS_RANK[l] > CLASS_RANK[m] ? l : m), '');
              best.set(key, {
                key,
                steps: path,
                category: cat,
                boundaries,
                pivots: comps.filter((c) => PIVOTS.has(c.type)).map((c) => c.id),
                gated,
                guarded,
                severity: Math.min(4, severity) as AttackPath['severity'],
                title: `${SINK_LABEL[cat]}: ${SOURCES[src.type]} (${src.name}) reaches ${to.name} via ${comps.filter((c) => PIVOTS.has(c.type)).map((c) => c.name)[0]}`,
                dataLevel: level ? CLASS_LABEL[level] : '',
              });
            }
          }
        }
        const k = `${e.to}|${pivot ? 1 : 0}`;
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ node: e.to, pivot, path, flows });
      }
    }
  }
  // Drop paths that only extend a shorter path from the same source to an earlier sink of the same kind.
  const all = [...best.values()];
  const kept = all.filter(
    (p) => !all.some((q) => q !== p && q.steps[0] === p.steps[0] && q.category === p.category && q.steps.length < p.steps.length && q.steps.every((id, i) => p.steps[i] === id)),
  );
  return kept.sort((x, y) => y.severity - x.severity || x.steps.length - y.steps.length).slice(0, limit);
}

const DOMAIN_FOR: Record<SinkCategory, string> = {
  action: 'excessive-agency',
  execution: 'output-handling',
  exfiltration: 'data-disclosure',
  persistence: 'memory-poisoning',
  output: 'prompt-injection',
};

const TAGS: Record<SinkCategory, string[]> = {
  action: ['owasp-agentic:ASI02', 'owasp-llm:LLM06', 'atlas:AML.T0053', 'attack:T1565', 'stride:E'],
  execution: ['owasp-agentic:ASI05', 'owasp-llm:LLM05', 'atlas:AML.T0050', 'attack:T1059', 'stride:E'],
  exfiltration: ['owasp-llm:LLM02', 'atlas:AML.T0086', 'attack:T1567', 'stride:I'],
  persistence: ['owasp-agentic:ASI06', 'atlas:AML.T0080.000', 'attack:T1565.001', 'stride:T'],
  output: ['owasp-llm:LLM05', 'atlas:AML.T0077', 'atlas:AML.T0067', 'stride:T', 'stride:I'],
};

/** Builds a threat scenario (Appendix E) from an attack path. */
export function threatFromPath(a: Assessment, p: AttackPath, ref: string): Threat {
  const name = (id: string) => a.components.find((c) => c.id === id)?.name ?? '?';
  const bname = (id: string) => a.boundaries.find((b) => b.id === id)?.name ?? '?';
  const tags: FrameworkRef[] = ['owasp-llm:LLM01', 'owasp-agentic:ASI01', 'atlas:AML.T0051.001', ...TAGS[p.category]]
    .map((r) => ({ fw: r.slice(0, r.indexOf(':')), id: r.slice(r.indexOf(':') + 1) }))
    .filter((t) => lookup(t.fw, t.id));
  return {
    ...emptyThreat(ref),
    signature: `PATH:${p.key}`,
    status: 'candidate',
    edited: true, // generated once from the path; refresh leaves it alone
    domain: DOMAIN_FOR[p.category],
    title: p.title,
    componentIds: p.steps,
    actor: `Attacker controlling content that enters at ${name(p.steps[0])}`,
    asset: `${name(p.steps[p.steps.length - 1])}${p.dataLevel ? ` and ${p.dataLevel} data along the path` : ''}`,
    objectives: p.category === 'exfiltration' ? ['confidentiality'] : p.category === 'persistence' || p.category === 'output' ? ['integrity'] : ['integrity', 'safety'],
    preconditions: `Content from ${name(p.steps[0])} reaches ${p.pivots.map(name).join(' and ')} without being isolated as untrusted data, and nothing deterministic stops the resulting call to ${name(p.steps[p.steps.length - 1])}${p.gated ? ' (an approval gate is on the path but may be manipulated or bypassed)' : ''}.`,
    attackPath: p.steps.map((id, i) => `${i + 1}. ${name(id)}`).join('\n') + `\nCrosses: ${p.boundaries.map(bname).join(', ')}.`,
    impact: `${SINK_LABEL[p.category]} at ${name(p.steps[p.steps.length - 1])} triggered by attacker-controlled content.`,
    frameworks: tags,
    patterns: ['untrusted-isolation', 'policy-outside-model', 'capability-tools', ...(p.gated ? [] : ['approval-bound'])],
    inherentLikelihood: Math.max(1, p.severity - (p.gated ? 0 : 0)) as Threat['inherentLikelihood'],
    inherentImpact: (p.category === 'action' || p.category === 'execution' ? 4 : 3) as Threat['inherentImpact'],
    ratingRationale: `Generated from an attack path with ${p.steps.length - 1} hops crossing ${p.boundaries.length} trust boundar${p.boundaries.length === 1 ? 'y' : 'ies'}${p.gated ? '; an approval gate is on the path' : '; no approval gate on the path'}${p.guarded ? '; a guardrail is on the path' : ''}.`,
    ratingSuggested: true,
  };
}
