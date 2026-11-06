import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { THREAT_RULES } from '../library/threatRules';
import { newAssessment, newBoundary, newComponent, newFlow } from '../model/factory';
import { dataExposures, propagate, received } from './dataflow';
import { generateCandidates, suggestRating } from './threats';

describe('data sensitivity propagation', () => {
  it('seeds sources from intake, inherits along unlabeled flows, and respects explicit labels', () => {
    const a = newAssessment();
    a.intake.dataSensitivity = 'restricted';
    const kb = newComponent('knowledge_source', { x: 0, y: 0 });
    const ret = newComponent('rag_retriever', { x: 300, y: 0 });
    const model = newComponent('model_endpoint', { x: 600, y: 0 });
    const ui = newComponent('chat_ui', { x: 900, y: 0 });
    a.components.push(kb, ret, model, ui);
    const f1 = newFlow(kb.id, ret.id);
    const f2 = newFlow(ret.id, model.id);
    const f3 = newFlow(model.id, ui.id, { dataClassification: 'internal' });
    a.flows.push(f1, f2, f3);
    const dm = propagate(a);
    expect(dm.held.get(kb.id)).toMatchObject({ level: 'restricted', basis: 'intake' });
    expect(dm.carried.get(f1.id)).toEqual({ level: 'restricted', inferred: true });
    expect(dm.held.get(model.id)).toMatchObject({ level: 'restricted', basis: 'inherited', from: ret.id });
    expect(dm.carried.get(f3.id)).toEqual({ level: 'internal', inferred: false });
  });

  it('labeled components still pass on more sensitive data they receive', () => {
    const a = newAssessment();
    const src = newComponent('database', { x: 0, y: 0 }, { classification: 'restricted' });
    const mid = newComponent('app_backend', { x: 300, y: 0 }, { classification: 'internal' });
    const logs = newComponent('monitoring', { x: 600, y: 0 });
    a.components.push(src, mid, logs);
    a.flows.push(newFlow(src.id, mid.id), newFlow(mid.id, logs.id));
    const dm = propagate(a);
    expect(received(a, dm, logs.id)).toBe('restricted');
    const kinds = dataExposures(a, dm).map((x) => x.kind);
    expect(kinds).toContain('above-approval'); // backend approved for internal, receives restricted
    expect(kinds).toContain('sensitive-in-logs');
  });

  it('control-plane flows do not carry business data unless labeled', () => {
    const a = newAssessment();
    const s = newComponent('database', { x: 0, y: 0 }, { classification: 'restricted' });
    const m = newComponent('monitoring', { x: 300, y: 0 });
    a.components.push(s, m);
    a.flows.push(newFlow(s.id, m.id, { plane: 'control' }));
    expect(propagate(a).held.get(m.id)?.level).toBe('');
  });

  it('flags sensitive data leaving the organization and unencrypted crossings', () => {
    const a = instantiateTemplate(TEMPLATES[0]);
    a.intake.dataSensitivity = 'confidential';
    const exposures = dataExposures(a);
    expect(exposures.some((x) => x.kind === 'leaves-org')).toBe(true);
    expect(exposures.some((x) => x.kind === 'unencrypted-crossing')).toBe(true);
    for (const f of a.flows) f.encrypted = 'yes';
    expect(dataExposures(a).some((x) => x.kind === 'unencrypted-crossing')).toBe(false);
  });
});

describe('data-driven threats', () => {
  it('raises an above-approval threat and uses flow sensitivity for impact', () => {
    const a = newAssessment();
    const db = newComponent('database', { x: 0, y: 0 }, { classification: 'restricted' });
    const cache = newComponent('cache', { x: 300, y: 0 }, { classification: 'internal' });
    a.components.push(db, cache);
    const f = newFlow(db.id, cache.id);
    a.flows.push(f);
    expect(generateCandidates(a).some((c) => c.rule.id === 'DATA-ABOVE-APPROVAL' && c.componentIds[0] === cache.id)).toBe(true);

    const rule = THREAT_RULES.find((r) => r.id === 'SDI-PROVIDER')!;
    const withFlow = suggestRating(a, rule, [db.id, cache.id], [f.id]);
    expect(withFlow.rationale).toContain('Restricted data on this flow');
  });

  it('flags sensitive data sent to a third party', () => {
    const a = newAssessment();
    const ag = newComponent('agent', { x: 0, y: 0 }, { classification: 'confidential' });
    const tp = newComponent('third_party_service', { x: 300, y: 0 });
    a.components.push(ag, tp);
    a.boundaries.push(newBoundary('Internal', 'public-private', { x: -20, y: -20, width: 260, height: 120 }));
    a.flows.push(newFlow(ag.id, tp.id));
    expect(generateCandidates(a).some((c) => c.rule.id === 'DATA-THIRD-PARTY')).toBe(true);
  });
});
