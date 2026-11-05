import { getComponentType, CATEGORY_ORDER } from '../library/catalog';
import { LEXICON, type LexiconEntry } from '../library/lexicon';
import { newComponent, newFlow } from '../model/factory';
import type { Assessment, Component, Flow } from '../model/types';

/**
 * Turns a free-text system description into reviewable suggestions.
 * Implemented as an interface so an LLM-backed analyzer can replace the
 * rule-based one later (spec §1, §6). Nothing is ever applied silently.
 */
export interface Suggestion {
  id: string;
  type: string;
  name: string;
  provider: string;
  matches: { text: string; index: number }[];
  confidence: LexiconEntry['confidence'];
  systemTypes: string[];
  generic?: boolean;
  platform?: boolean;
}

export interface DescriptionAnalyzer {
  analyze(text: string): Suggestion[];
}

const titleCase = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

function compile(entry: LexiconEntry): RegExp {
  return new RegExp(`(?<![\\w-])(?:${entry.patterns.join('|')})(?![\\w-])`, 'gi');
}

const CONF_RANK = { low: 0, medium: 1, high: 2 } as const;

export class RuleBasedAnalyzer implements DescriptionAnalyzer {
  private compiled: { entry: LexiconEntry; re: RegExp }[];

  constructor(lexicon: LexiconEntry[] = LEXICON) {
    this.compiled = lexicon.filter((x) => x.type).map((entry) => ({ entry, re: compile(entry) }));
  }

  analyze(text: string): Suggestion[] {
    // Collect every match, then let longer (more specific) matches claim their
    // span first, so "Azure OpenAI" doesn't also yield "OpenAI" and
    // "vector database" doesn't also yield a generic database.
    const raw: { entry: LexiconEntry; text: string; index: number }[] = [];
    for (const { entry, re } of this.compiled) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) raw.push({ entry, text: m[0], index: m.index ?? 0 });
    }
    raw.sort((x, y) => y.text.length - x.text.length || CONF_RANK[y.entry.confidence] - CONF_RANK[x.entry.confidence]);
    const claimed: [number, number][] = [];
    const overlaps = (s: number, e: number) => claimed.some(([cs, ce]) => s < ce && e > cs);

    const byKey = new Map<string, Suggestion>();
    for (const { entry, text: matched, index } of raw) {
      const end = index + matched.length;
      if (overlaps(index, end)) continue;
      claimed.push([index, end]);
      const name = entry.name ? entry.name.replace('$0', titleCase(matched)) : getComponentType(entry.type!).label;
      const key = `${entry.type}::${name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.matches.push({ text: matched, index });
        if (CONF_RANK[entry.confidence] > CONF_RANK[existing.confidence]) existing.confidence = entry.confidence;
      } else {
        byKey.set(key, {
          id: `${entry.id}:${byKey.size}`,
          type: entry.type!,
          name,
          provider: entry.provider ?? '',
          matches: [{ text: matched, index }],
          confidence: entry.confidence,
          systemTypes: entry.systemTypes ?? [],
          generic: entry.generic,
          platform: entry.platform,
        });
      }
    }
    let out = [...byKey.values()];
    // Fold generic phrases ("SSO", "vector database") into a specific product of the same type.
    const specific = out.filter((x) => !x.generic);
    out = out.filter((x) => {
      if (!x.generic) return true;
      const target = specific.find((y) => y.type === x.type);
      if (!target) return true;
      target.matches.push(...x.matches);
      return false;
    });
    // "Claude via AWS Bedrock": merge the hosting platform into the model family.
    const families = out.filter((x) => x.type === 'model_endpoint' && !x.platform && !x.generic);
    const platforms = out.filter((x) => x.platform);
    if (families.length && platforms.length) {
      const f = families[0];
      for (const p of platforms) {
        f.provider = p.provider;
        f.name = `${f.name} via ${p.provider}`;
        f.matches.push(...p.matches);
      }
      out = out.filter((x) => !x.platform);
    }
    for (const x of out) x.matches.sort((m, n) => m.index - n.index);
    return out.sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(getComponentType(a.type).category) - CATEGORY_ORDER.indexOf(getComponentType(b.type).category) ||
        a.matches[0].index - b.matches[0].index,
    );
  }
}

/** Default flows to propose between accepted components: [from, to, label]. */
const WIRING: [string, string, string, Partial<Flow>?][] = [
  ['end_user', 'chat_ui', 'user input', { contentOrigin: 'user', trustLevel: 'untrusted' }],
  ['end_user', 'web_ui', 'user input', { contentOrigin: 'user', trustLevel: 'untrusted' }],
  ['end_user', 'file_upload', 'uploaded files', { contentOrigin: 'user', trustLevel: 'untrusted' }],
  ['chat_ui', 'app_backend', 'request', { contentOrigin: 'user' }],
  ['web_ui', 'app_backend', 'request', { contentOrigin: 'user' }],
  ['public_api', 'app_backend', 'API request', { contentOrigin: 'user' }],
  ['file_upload', 'app_backend', 'files', { contentOrigin: 'user', trustLevel: 'untrusted' }],
  ['event_webhook', 'app_backend', 'event payload', { trustLevel: 'untrusted' }],
  ['chat_ui', 'identity_provider', 'sign-in', { plane: 'control' }],
  ['web_ui', 'identity_provider', 'sign-in', { plane: 'control' }],
  ['app_backend', 'agent', 'task + user context', { contentOrigin: 'user' }],
  ['app_backend', 'orchestrator', 'task + user context', { contentOrigin: 'user' }],
  ['orchestrator', 'agent', 'delegated subtask'],
  ['app_backend', 'rag_retriever', 'query + entitlements'],
  ['rag_retriever', 'vector_store', 'similarity search'],
  ['rag_retriever', 'prompt_assembly', 'retrieved chunks', { contentOrigin: 'retrieved', trustLevel: 'untrusted' }],
  ['knowledge_source', 'ingestion_pipeline', 'documents + ACLs', { contentOrigin: 'retrieved' }],
  ['ingestion_pipeline', 'vector_store', 'chunks + embeddings', { contentOrigin: 'retrieved' }],
  ['app_backend', 'prompt_assembly', 'user input + instructions', { contentOrigin: 'user' }],
  ['prompt_assembly', 'guardrail', 'input screening'],
  ['prompt_assembly', 'model_gateway', 'prompt'],
  ['model_gateway', 'model_endpoint', 'inference request'],
  ['agent', 'model_gateway', 'reasoning prompt'],
  ['agent', 'memory_store', 'memory read/write', { contentOrigin: 'model' }],
  ['agent', 'tool_connector', 'tool call', { contentOrigin: 'model', trustLevel: 'untrusted' }],
  ['agent', 'mcp_server', 'tool call', { contentOrigin: 'model', trustLevel: 'untrusted' }],
  ['agent', 'code_sandbox', 'generated code', { contentOrigin: 'model', trustLevel: 'untrusted' }],
  ['agent', 'browser_automation', 'browse / search', { contentOrigin: 'model' }],
  ['agent', 'approval_gate', 'proposed action', { contentOrigin: 'model' }],
  ['tool_connector', 'enterprise_api', 'API request'],
  ['approval_gate', 'human_approver', 'approval request'],
  ['approval_gate', 'downstream_action', 'approved action'],
  ['app_backend', 'database', 'read/write'],
  ['app_backend', 'cache', 'cache read/write'],
  ['app_backend', 'monitoring', 'telemetry', { plane: 'control' }],
  ['agent', 'monitoring', 'audit events', { plane: 'control' }],
  ['training_pipeline', 'model_registry', 'model artifacts'],
  ['model_registry', 'model_endpoint', 'deployment', { plane: 'control' }],
];

/** Fallback when no gateway/prompt component exists: wire directly to the model. */
const WIRING_FALLBACK: [string, string, string][] = [
  ['prompt_assembly', 'model_endpoint', 'prompt'],
  ['app_backend', 'model_endpoint', 'inference request'],
  ['agent', 'model_endpoint', 'reasoning prompt'],
];

/**
 * Adds accepted suggestions to the assessment, laid out in columns by
 * category, and proposes default flows among the new and existing components.
 */
export function applySuggestions(a: Assessment, accepted: Suggestion[], autoWire: boolean): Assessment {
  const next: Assessment = { ...a, components: [...a.components], flows: [...a.flows] };
  const colCounts = new Map<string, number>();
  for (const c of next.components) {
    const cat = getComponentType(c.type).category;
    colCounts.set(cat, (colCounts.get(cat) ?? 0) + 1);
  }
  const added: Component[] = [];
  const hasType = (t: string) => next.components.some((c) => c.type === t);

  // Make sure there is a user and a backend to anchor flows.
  const anchors: string[] = [];
  if (autoWire && accepted.length) {
    if (!hasType('end_user') && !accepted.some((s) => s.type === 'end_user')) anchors.push('end_user');
    if (!hasType('app_backend') && !accepted.some((s) => s.type === 'app_backend')) anchors.push('app_backend');
  }
  const toAdd = [
    ...anchors.map((t) => ({ type: t, name: getComponentType(t).label, provider: '' })),
    ...accepted.map((s) => ({ type: s.type, name: s.name, provider: s.provider })),
  ];
  for (const s of toAdd) {
    const cat = getComponentType(s.type).category;
    const col = CATEGORY_ORDER.indexOf(cat);
    const row = colCounts.get(cat) ?? 0;
    colCounts.set(cat, row + 1);
    const comp = newComponent(s.type, { x: 40 + col * 250, y: 40 + row * 110 }, { name: s.name, provider: s.provider });
    next.components.push(comp);
    added.push(comp);
  }
  if (!autoWire) return next;

  const exists = (s: string, t: string) => next.flows.some((f) => f.source === s && f.target === t);
  const ofType = (t: string) => next.components.filter((c) => c.type === t);
  const addedIds = new Set(added.map((c) => c.id));
  const wire = (from: string, to: string, label: string, extra: Partial<Flow> = {}) => {
    for (const s of ofType(from)) {
      for (const t of ofType(to)) {
        if (s.id === t.id || exists(s.id, t.id)) continue;
        if (!addedIds.has(s.id) && !addedIds.has(t.id)) continue; // only wire around new components
        next.flows.push(newFlow(s.id, t.id, { label, ...extra }));
      }
    }
  };
  for (const [from, to, label, extra] of WIRING) wire(from, to, label, extra);
  if (!hasType('model_gateway')) {
    for (const [from, to, label] of WIRING_FALLBACK) {
      if (from === 'app_backend' && hasType('prompt_assembly')) continue;
      wire(from, to, label);
    }
  }
  return next;
}
