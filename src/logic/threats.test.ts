import { THREAT_RULES, DOMAINS } from '../library/threatRules';
import { CATALOGS, lookup } from '../library/frameworks';
import { getPattern } from '../library/patterns';
import { hasComponentType } from '../library/catalog';
import { QUESTIONS } from '../library/questions';
import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { newAssessment, newBoundary, newComponent, newFlow } from '../model/factory';
import { defaultRiskMatrix, type Assessment } from '../model/types';
import { generateCandidates, narrative, refreshThreats, suggestRating } from './threats';
import { autonomyReach, rating } from './risk';
import type { Cond } from '../library/threatRules';
import { parse, serialize } from '../io/file';

const questionIds = new Set(QUESTIONS.map((q) => q.id));
const domainIds = new Set(DOMAINS.map((d) => d.id));

function typesIn(c: Cond): string[] {
  switch (c.kind) {
    case 'type':
    case 'has':
    case 'lacks':
    case 'connected':
      return c.types;
    case 'flow':
      return [...(c.source ?? []), ...(c.target ?? [])];
    case 'any':
    case 'all':
      return c.conds.flatMap(typesIn);
    case 'not':
      return typesIn(c.cond);
    default:
      return [];
  }
}

describe('threat rule library integrity', () => {
  it('rule ids are unique and domains exist', () => {
    const ids = THREAT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of THREAT_RULES) expect(domainIds.has(r.domain), r.id).toBe(true);
  });

  it('every framework tag resolves to a real catalog item', () => {
    for (const r of THREAT_RULES) {
      for (const tag of r.tags) {
        expect(CATALOGS.some((c) => c.id === tag.fw), `${r.id}: catalog ${tag.fw}`).toBe(true);
        expect(lookup(tag.fw, tag.id), `${r.id}: ${tag.fw}:${tag.id}`).toBeDefined();
      }
    }
  });

  it('every rule carries a traditional mapping (STRIDE) and at least one AI or traditional framework beyond it', () => {
    for (const r of THREAT_RULES) {
      expect(r.tags.some((x) => x.fw === 'stride'), r.id).toBe(true);
      expect(r.tags.some((x) => x.fw !== 'stride'), r.id).toBe(true);
    }
  });

  it('patterns, signal questions and component types referenced by rules exist', () => {
    for (const r of THREAT_RULES) {
      for (const p of r.patterns) expect(getPattern(p), `${r.id}: ${p}`).toBeDefined();
      for (const s of r.signals ?? []) expect(questionIds.has(s.q), `${r.id}: ${s.q}`).toBe(true);
      for (const t of [...r.when.flatMap(typesIn), ...(r.involves ?? [])]) expect(hasComponentType(t), `${r.id}: ${t}`).toBe(true);
    }
  });

  it('every Appendix C domain has at least one rule', () => {
    for (const d of DOMAINS) expect(THREAT_RULES.some((r) => r.domain === d.id), d.id).toBe(true);
  });

  it('catalogs are populated and versioned', () => {
    for (const c of CATALOGS) {
      expect(c.items.length, c.id).toBeGreaterThan(0);
      expect(c.version, c.id).toBeTruthy();
    }
    expect(lookup('attack', 'T1190')?.name).toBe('Exploit Public-Facing Application');
    expect(lookup('atlas', 'AML.T0051.001')?.name).toContain('Indirect');
  });
});

describe('threat generation', () => {
  const rag = () => instantiateTemplate(TEMPLATES.find((t) => t.id === 'rag-assistant')!);
  const agent = () => instantiateTemplate(TEMPLATES.find((t) => t.id === 'agent-with-tools')!);

  it('generates expected scenarios for the RAG template', () => {
    const ids = new Set(generateCandidates(rag()).map((c) => c.rule.id));
    for (const id of ['PI-DIRECT', 'PI-INDIRECT', 'PI-PROMPT-LEAK', 'SDI-PROVIDER', 'SDI-CROSS-USER', 'SDI-RENDER', 'RAG-POISON', 'RAG-ACL', 'ID-BOLA', 'MON-TAMPER']) {
      expect(ids.has(id), id).toBe(true);
    }
    // No agent-only threats in a non-agentic system
    expect(ids.has('AG-EXFIL')).toBe(false);
    expect(ids.has('MA-DELEGATION')).toBe(false);
    // RAG-ACL attaches to the retriever, not also the vector store
    expect(generateCandidates(rag()).filter((c) => c.rule.id === 'RAG-ACL')).toHaveLength(1);
  });

  it('generates agentic scenarios for the agent template', () => {
    const ids = new Set(generateCandidates(agent()).map((c) => c.rule.id));
    for (const id of ['AG-TOOL-MISUSE', 'AG-EXFIL', 'ID-CONFUSED-DEPUTY', 'OUT-CODE-EXEC', 'MEM-POISON', 'HW-APPROVAL', 'AV-AGENT-LOOP', 'MA-ROGUE']) {
      expect(ids.has(id), id).toBe(true);
    }
    // Downstream effect sits behind an approval gate, so no ungated-action threat
    expect(ids.has('AG-UNGATED')).toBe(false);
  });

  it('flags ungated consequential actions', () => {
    const a = newAssessment();
    const ag = newComponent('agent');
    const eff = newComponent('downstream_action');
    a.components.push(ag, eff);
    a.flows.push(newFlow(ag.id, eff.id));
    expect(generateCandidates(a).some((c) => c.rule.id === 'AG-UNGATED')).toBe(true);
  });

  it('only flags transport threats for crossing flows explicitly unencrypted or unknown', () => {
    const a = newAssessment();
    const x = newComponent('app_backend', { x: 0, y: 0 });
    const y = newComponent('database', { x: 600, y: 0 });
    a.components.push(x, y);
    a.boundaries.push(newBoundary('zone', 'other', { x: -20, y: -20, width: 300, height: 200 }));
    const f = newFlow(x.id, y.id);
    a.flows.push(f);
    expect(generateCandidates(a).some((c) => c.rule.id === 'TR-TRANSPORT')).toBe(false);
    f.encrypted = 'no';
    expect(generateCandidates(a).some((c) => c.rule.id === 'TR-TRANSPORT')).toBe(true);
  });

  it('answers raise the suggested likelihood and are cited as signals', () => {
    const a = rag();
    const prompt = a.components.find((c) => c.type === 'prompt_assembly')!;
    const rule = THREAT_RULES.find((r) => r.id === 'PI-PROMPT-LEAK')!;
    const before = suggestRating(a, rule, [prompt.id]);
    a.answers[`${prompt.id}::B4.4`] = { status: 'yes', note: '', evidence: '', owner: '', dueDate: '' };
    const after = suggestRating(a, rule, [prompt.id]);
    expect(after.likelihood).toBeGreaterThan(before.likelihood);
    expect(after.signals.join(' ')).toContain('B4.4');
  });

  it('intake sensitivity and exposure raise the suggested rating', () => {
    const a = rag();
    const rule = THREAT_RULES.find((r) => r.id === 'SDI-CROSS-USER')!;
    const base = suggestRating(a, rule, []);
    a.intake.dataSensitivity = 'restricted';
    expect(suggestRating(a, rule, []).impact).toBe(Math.min(4, base.impact + 1));
  });
});

describe('refresh', () => {
  it('adds candidates once and is idempotent', () => {
    const a = instantiateTemplate(TEMPLATES[0]);
    const r1 = refreshThreats(a);
    expect(r1.added).toBeGreaterThan(5);
    const r2 = refreshThreats({ ...a, threats: r1.threats });
    expect(r2.added).toBe(0);
    expect(r2.threats).toHaveLength(r1.threats.length);
    const refs = r1.threats.map((t) => t.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('keeps analyst work when the architecture changes, and removes untouched stale candidates', () => {
    const a: Assessment = instantiateTemplate(TEMPLATES[0]);
    a.threats = refreshThreats(a).threats;
    const ui = a.components.find((c) => c.type === 'chat_ui')!;
    // Accept one threat attached to the chat UI and edit it.
    const target = a.threats.find((t) => t.ruleId === 'ID-ENTRY-AUTH' && t.componentIds.includes(ui.id))!;
    target.status = 'accepted';
    target.title = 'Edited title';
    target.edited = true;
    const untouched = a.threats.find((t) => t.ruleId === 'SDI-RENDER')!;
    // Remove the chat UI and its flows.
    a.components = a.components.filter((c) => c.id !== ui.id);
    a.flows = a.flows.filter((f) => f.source !== ui.id && f.target !== ui.id);
    const r = refreshThreats(a);
    const kept = r.threats.find((t) => t.id === target.id)!;
    expect(kept.stale).toBe(true);
    expect(kept.title).toBe('Edited title');
    expect(r.threats.some((t) => t.id === untouched.id)).toBe(false);
  });

  it('updates names in untouched candidates but not in edited ones', () => {
    const a: Assessment = instantiateTemplate(TEMPLATES[0]);
    a.threats = refreshThreats(a).threats;
    const prompt = a.components.find((c) => c.type === 'prompt_assembly')!;
    prompt.name = 'Context Builder v2';
    const r = refreshThreats(a);
    expect(r.threats.find((t) => t.ruleId === 'PI-PROMPT-LEAK')!.title).toContain('Context Builder v2');
  });

  it('survives a save/open round trip', () => {
    const a: Assessment = instantiateTemplate(TEMPLATES[1]);
    a.threats = refreshThreats(a).threats;
    const b = parse(serialize(a));
    expect(b.threats).toEqual(a.threats);
    expect(b.settings.riskMatrix.grid).toHaveLength(4);
  });
});

describe('risk', () => {
  it('rates with the matrix and treats unrated as 0', () => {
    const m = defaultRiskMatrix();
    expect(rating(m, 4, 4)).toBe(4);
    expect(rating(m, 1, 1)).toBe(1);
    expect(rating(m, 0, 3)).toBe(0);
  });

  it('computes autonomy/reach', () => {
    expect(autonomyReach(instantiateTemplate(TEMPLATES[0])).level).toBe(1);
    expect(autonomyReach(instantiateTemplate(TEMPLATES[1])).level).toBe(3);
    const a = instantiateTemplate(TEMPLATES[1]);
    a.intake.autonomy = 'broad';
    expect(autonomyReach(a).level).toBe(4);
  });

  it('composes the Section 9 narrative', () => {
    const a = instantiateTemplate(TEMPLATES[0]);
    const t = refreshThreats(a).threats[0];
    const n = narrative(t, a);
    expect(n).toMatch(/^An? .+ exploits a weakness \(.+\) through .+: .+, causing .+\. Existing controls are .+; evidence is .+\.$/);
    const sandbox = refreshThreats(instantiateTemplate(TEMPLATES[1])).threats.find((x) => x.ruleId === 'OUT-CODE-EXEC')!;
    const n2 = narrative(sandbox, instantiateTemplate(TEMPLATES[1]));
    expect(n2.startsWith('An attacker steering code generation')).toBe(true);
  });
});
