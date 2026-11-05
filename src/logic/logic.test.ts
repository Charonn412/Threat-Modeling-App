import { COMPONENT_TYPES, hasComponentType } from '../library/catalog';
import { AREAS, QUESTIONS } from '../library/questions';
import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { LEXICON } from '../library/lexicon';
import { emptyIntake } from '../model/types';
import { newAssessment, newBoundary, newComponent, newFlow } from '../model/factory';
import { computeTier } from './tier';
import { boundariesOf, completeness, computeGaps, crossedBoundaries, membership } from './analysis';
import { RuleBasedAnalyzer, applySuggestions } from './describe';
import { parse, serialize } from '../io/file';

describe('library integrity', () => {
  it('question ids are unique and areas exist', () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const areaIds = new Set(AREAS.map((a) => a.id));
    for (const q of QUESTIONS) expect(areaIds.has(q.area)).toBe(true);
  });

  it('every area has at least one Light-tier question and a traditional-security question', () => {
    for (const a of AREAS) {
      const qs = QUESTIONS.filter((q) => q.area === a.id);
      expect(qs.some((q) => q.tier === 1), a.id).toBe(true);
      expect(qs.some((q) => q.kind === 'traditional'), a.id).toBe(true);
    }
  });

  it('every area is reachable from some component type', () => {
    const used = new Set(COMPONENT_TYPES.flatMap((t) => t.areas));
    for (const a of AREAS) expect(used.has(a.id), a.id).toBe(true);
  });

  it('diagram suggestions and lexicon entries reference real component types', () => {
    for (const q of QUESTIONS) if (q.suggest) expect(hasComponentType(q.suggest.addType), q.id).toBe(true);
    for (const e of LEXICON) if (e.type) expect(hasComponentType(e.type), e.id).toBe(true);
  });

  it('lexicon patterns compile', () => {
    for (const e of LEXICON) for (const p of e.patterns) expect(() => new RegExp(p, 'i')).not.toThrow();
  });

  it('templates instantiate with valid types and flow endpoints', () => {
    for (const t of TEMPLATES) {
      const a = instantiateTemplate(t);
      for (const c of a.components) expect(hasComponentType(c.type), c.type).toBe(true);
      const ids = new Set(a.components.map((c) => c.id));
      for (const f of a.flows) {
        expect(ids.has(f.source)).toBe(true);
        expect(ids.has(f.target)).toBe(true);
      }
    }
  });

  it('templates place each component in the intended boundary and produce crossing flows', () => {
    const rag = instantiateTemplate(TEMPLATES.find((t) => t.id === 'rag-assistant')!);
    const m = membership(rag);
    const model = rag.components.find((c) => c.type === 'model_endpoint')!;
    const provider = rag.boundaries.find((b) => b.kind === 'app-provider')!;
    expect(m.get(model.id)).toEqual([provider.id]);
    const promptToModel = rag.flows.find((f) => f.target === model.id && rag.components.find((c) => c.id === f.source)?.type === 'prompt_assembly')!;
    expect(crossedBoundaries(promptToModel, m).length).toBe(2);
    for (const t of TEMPLATES) {
      const a = instantiateTemplate(t);
      const mm = membership(a);
      for (const c of a.components) expect(mm.get(c.id)!.length, `${t.id}: ${c.name}`).toBe(1);
    }
  });
});

describe('tier', () => {
  it('is Light for an empty or low-risk intake', () => {
    expect(computeTier(emptyIntake()).tier).toBe(1);
    expect(computeTier({ ...emptyIntake(), dataSensitivity: 'internal', exposure: 'internal', criticality: 'advisory' }).tier).toBe(1);
  });

  it('is Deep for broad autonomy regardless of score', () => {
    expect(computeTier({ ...emptyIntake(), autonomy: 'broad' }).tier).toBe(3);
  });

  it('regulated impact forces at least Standard', () => {
    expect(computeTier({ ...emptyIntake(), regulatedImpact: ['employment'] }).tier).toBe(2);
  });

  it('accumulates to Deep for sensitive, public, action-taking systems', () => {
    const r = computeTier({
      ...emptyIntake(),
      dataSensitivity: 'restricted',
      exposure: 'public',
      criticality: 'action-taking',
      autonomy: 'bounded',
    });
    expect(r.tier).toBe(3);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('respects override', () => {
    expect(computeTier({ ...emptyIntake(), autonomy: 'broad', tierOverride: 1 }).tier).toBe(1);
  });
});

describe('boundaries, gaps and completeness', () => {
  it('uses component centers for membership', () => {
    const b = newBoundary('zone', 'other', { x: 0, y: 0, width: 300, height: 200 });
    expect(boundariesOf(newComponent('agent', { x: 10, y: 10 }), [b])).toEqual([b.id]);
    expect(boundariesOf(newComponent('agent', { x: 250, y: 10 }), [b])).toEqual([]); // center at x=350
  });

  it('reports unknowns, unanswered questions, isolated components and unlabeled flows', () => {
    const a = newAssessment();
    const u = newComponent('end_user', { x: 0, y: 0 });
    const ui = newComponent('chat_ui', { x: 300, y: 0 });
    const lonely = newComponent('database', { x: 600, y: 300 });
    a.components.push(u, ui, lonely);
    a.flows.push(newFlow(u.id, ui.id, { label: 'prompt' }));
    a.answers[`${ui.id}::B1.1`] = { status: 'unknown', note: '', evidence: '', owner: 'alex', dueDate: '' };
    a.answers[`${ui.id}::B1.2`] = { status: 'yes', note: '', evidence: '', owner: '', dueDate: '' };
    const gaps = computeGaps(a, 1);
    expect(gaps.filter((g) => g.kind === 'unknown')).toHaveLength(1);
    expect(gaps.some((g) => g.kind === 'isolated' && g.targetId === lonely.id)).toBe(true);
    expect(gaps.some((g) => g.kind === 'flow-labels')).toBe(true);
    const c = completeness(a, 1);
    expect(c.questionsAnswered).toBe(1);
    expect(c.unknowns).toBe(1);
  });
});

describe('description analyzer', () => {
  const analyzer = new RuleBasedAnalyzer();
  const text =
    'Customer support copilot. Users chat on our web portal and sign in with Okta. It calls Claude via AWS Bedrock, retrieves knowledge articles ' +
    'from Confluence indexed in Pinecone, can create Zendesk tickets, and issues refunds through Stripe only after human approval. History is kept in Redis.';

  it('suggests the expected components', () => {
    const types = new Set(analyzer.analyze(text).map((s) => s.type));
    for (const t of ['web_ui', 'identity_provider', 'model_endpoint', 'rag_retriever', 'knowledge_source', 'vector_store', 'tool_connector', 'approval_gate', 'downstream_action', 'cache']) {
      expect(types.has(t), t).toBe(true);
    }
  });

  it('drops the generic LLM match when a specific provider is found', () => {
    const s = analyzer.analyze('An LLM app using Azure OpenAI.');
    expect(s.filter((x) => x.type === 'model_endpoint')).toHaveLength(1);
    expect(s[0].provider === 'Azure OpenAI' || s.some((x) => x.provider === 'Azure OpenAI')).toBe(true);
  });

  it('merges model family with hosting platform and folds generic phrases', () => {
    const s = analyzer.analyze('Users sign in with Okta SSO. The LLM is Claude via AWS Bedrock, with a Pinecone vector database and Jira tickets.');
    const models = s.filter((x) => x.type === 'model_endpoint');
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe('Claude model via AWS Bedrock');
    expect(s.filter((x) => x.type === 'identity_provider')).toHaveLength(1);
    expect(s.filter((x) => x.type === 'vector_store')).toHaveLength(1);
    expect(s.filter((x) => x.type === 'tool_connector').map((x) => x.name)).toEqual(['Jira tool']);
  });

  it('keeps a generic suggestion when nothing specific was named', () => {
    const s = analyzer.analyze('It uses SSO and stores data in a database.');
    expect(s.find((x) => x.type === 'identity_provider')?.name).toBe('SSO identity provider');
    expect(s.find((x) => x.type === 'database')?.name).toBe('Database');
  });

  it('does not match inside other words', () => {
    expect(analyzer.analyze('The rag-tag team uses a garage.').some((s) => s.type === 'rag_retriever' && s.matches[0].text === 'rag')).toBe(false);
  });

  it('applies suggestions with anchors and default flows', () => {
    const s = analyzer.analyze(text);
    const a = applySuggestions(newAssessment(), s, true);
    expect(a.components.some((c) => c.type === 'end_user')).toBe(true);
    expect(a.components.some((c) => c.type === 'app_backend')).toBe(true);
    expect(a.flows.length).toBeGreaterThan(5);
    const ids = new Set(a.components.map((c) => c.id));
    for (const f of a.flows) expect(ids.has(f.source) && ids.has(f.target)).toBe(true);
    // No duplicate flows
    const keys = a.flows.map((f) => `${f.source}>${f.target}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('file round-trip', () => {
  it('serializes and parses an assessment', () => {
    const a = instantiateTemplate(TEMPLATES[1]);
    const b = parse(serialize(a));
    expect(b.components).toEqual(a.components);
    expect(b.flows).toEqual(a.flows);
    expect(b.frameworkVersions['MITRE ATT&CK Enterprise']).toBeDefined();
  });

  it('rejects invalid files', () => {
    expect(() => parse('not json')).toThrow();
    expect(() => parse('{"foo":1}')).toThrow();
  });
});
