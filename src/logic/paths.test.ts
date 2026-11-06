import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { lookup } from '../library/frameworks';
import { newAssessment, newBoundary, newComponent, newFlow } from '../model/factory';
import { findAttackPaths, threatFromPath } from './paths';
import { generateCandidates, refreshThreats } from './threats';

const names = (a: ReturnType<typeof instantiateTemplate>, ids: string[]) => ids.map((id) => a.components.find((c) => c.id === id)!.name);

describe('attack paths', () => {
  it('finds the indirect-injection chain in the RAG template', () => {
    const a = instantiateTemplate(TEMPLATES.find((t) => t.id === 'rag-assistant')!);
    const p = findAttackPaths(a);
    expect(p).toHaveLength(1);
    expect(p[0].category).toBe('output');
    expect(names(a, p[0].steps)[0]).toBe('Document repository');
    expect(names(a, p[0].pivots)).toContain('Hosted LLM');
  });

  it('ranks ungated actions above gated ones and drops redundant extensions', () => {
    const a = instantiateTemplate(TEMPLATES.find((t) => t.id === 'agent-with-tools')!);
    const p = findAttackPaths(a);
    const gated = p.find((x) => x.gated)!;
    const ungated = p.find((x) => !x.gated && x.category === 'action')!;
    expect(ungated.severity).toBeGreaterThan(gated.severity);
    // The CRM API path only extends the CRM tool path, so it is not reported separately.
    expect(p.some((x) => names(a, x.steps)[x.steps.length - 1] === 'CRM API')).toBe(false);
  });

  it('requires an AI pivot and a boundary crossing', () => {
    const a = newAssessment();
    const u = newComponent('end_user', { x: 0, y: 0 });
    const api = newComponent('enterprise_api', { x: 300, y: 0 });
    a.components.push(u, api);
    a.flows.push(newFlow(u.id, api.id));
    a.boundaries.push(newBoundary('User zone', 'user-app', { x: -20, y: -20, width: 260, height: 120 }));
    expect(findAttackPaths(a)).toHaveLength(0); // no AI component in between
    const ag = newComponent('agent', { x: 150, y: 200 });
    a.components.push(ag);
    a.flows = [newFlow(u.id, ag.id), newFlow(ag.id, api.id)];
    expect(findAttackPaths(a)).toHaveLength(1);
    a.boundaries = [];
    expect(findAttackPaths(a)).toHaveLength(0); // no trust boundary crossed
  });

  it('builds a valid threat from a path that refresh leaves alone', () => {
    const a = instantiateTemplate(TEMPLATES[1]);
    const p = findAttackPaths(a)[0];
    const t = threatFromPath(a, p, 'TS-900');
    expect(t.componentIds).toEqual(p.steps);
    for (const f of t.frameworks) expect(lookup(f.fw, f.id)).toBeDefined();
    expect(t.frameworks.some((f) => f.fw === 'stride')).toBe(true);
    a.threats = [t];
    const r = refreshThreats(a);
    expect(r.threats.find((x) => x.id === t.id)?.stale).toBe(false);
  });
});

describe('de-duplication', () => {
  it('merges the same rule on directly connected components', () => {
    const a = instantiateTemplate(TEMPLATES[1]);
    const deputy = generateCandidates(a).filter((c) => c.rule.id === 'ID-CONFUSED-DEPUTY');
    expect(deputy).toHaveLength(1);
    expect(deputy[0].vars.name).toBe('CRM tool (read/write) → CRM API');
  });

  it('merges flow rules into one scenario per target', () => {
    const a = newAssessment();
    const s1 = newComponent('knowledge_source', { x: 0, y: 0 }, { name: 'Wiki' });
    const s2 = newComponent('browser_automation', { x: 0, y: 200 }, { name: 'Web' });
    const ag = newComponent('agent', { x: 300, y: 100 });
    a.components.push(s1, s2, ag);
    a.flows.push(newFlow(s1.id, ag.id), newFlow(s2.id, ag.id));
    const pi = generateCandidates(a).filter((c) => c.rule.id === 'PI-INDIRECT');
    expect(pi).toHaveLength(1);
    expect(pi[0].vars.src).toBe('Wiki, Web');
    expect(pi[0].flowIds).toHaveLength(2);
  });
});
