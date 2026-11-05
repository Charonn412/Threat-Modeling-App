import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { PATTERNS } from '../library/patterns';
import type { Assessment, Control } from '../model/types';
import { definitionOfDone, emptyControl, generateControls, newTest, threatEvidence, verification } from './controls';
import { refreshThreats } from './threats';
import { buildReport } from '../report/build';
import { parse, serialize } from '../io/file';

function treatedAssessment(): Assessment {
  const a = instantiateTemplate(TEMPLATES[1]);
  a.threats = refreshThreats(a).threats.map((t, i) => (i < 3 ? { ...t, status: 'accepted', treatment: 'mitigate', owner: 'AI Platform' } : t));
  return a;
}

describe('verification', () => {
  const base = (): Control => ({ ...emptyControl([]), requirement: 'x' });
  it('derives evidence-backed status from tests', () => {
    const c = base();
    expect(verification(c)).toBe('untested');
    c.tests = [{ ...newTest('positive'), result: 'pass' }];
    expect(verification(c)).toBe('no-negative');
    c.tests.push({ ...newTest('negative', true), result: 'pass' });
    expect(verification(c)).toBe('verified');
    c.tests.push({ ...newTest('blocked'), result: 'blocked' });
    expect(verification(c)).toBe('blocked');
    c.tests.push({ ...newTest('fails', true), result: 'fail' });
    expect(verification(c)).toBe('failing');
    expect(verification({ ...c, status: 'not-applicable' })).toBe('not-applicable');
  });
  it('ignores tests that have not run', () => {
    const c = base();
    c.tests = [{ ...newTest('n', true), result: 'pass' }, newTest('pending')];
    expect(verification(c)).toBe('verified');
  });
});

describe('generating controls from treatments', () => {
  it('creates one control per pattern with suggested tests, idempotently', () => {
    const a = treatedAssessment();
    const patterns = new Set(a.threats.filter((t) => t.status === 'accepted').flatMap((t) => t.patterns));
    const r = generateControls(a);
    expect(r.added).toBe(patterns.size);
    for (const c of r.controls) {
      const p = PATTERNS.find((x) => x.id === c.patternId)!;
      expect(c.tests).toHaveLength(p.tests?.length ?? 0);
      expect(c.threatIds.length).toBeGreaterThan(0);
    }
    expect(r.controls.some((c) => c.tests.some((t) => t.negative))).toBe(true);
    for (const c of r.controls) for (const t of c.tests) expect(t.method.charAt(0)).toMatch(/[A-Z]/);
    const again = generateControls({ ...a, controls: r.controls });
    expect(again.added).toBe(0);
    expect(again.linked).toBe(0);
    expect(new Set(r.controls.map((c) => c.ref)).size).toBe(r.controls.length);
  });

  it('flags residual reductions that rely on unverified controls', () => {
    const a = treatedAssessment();
    a.controls = generateControls(a).controls;
    const t = a.threats.find((x) => x.status === 'accepted')!;
    t.residualLikelihood = 1;
    t.residualImpact = 1;
    expect(threatEvidence(a, t).unsupportedReduction).toBe(true);
    for (const c of a.controls.filter((c) => c.threatIds.includes(t.id))) c.tests = c.tests.map((x) => ({ ...x, result: 'pass' }));
    expect(threatEvidence(a, t).verified).toBeGreaterThan(0);
    expect(threatEvidence(a, t).unsupportedReduction).toBe(false);
  });
});

describe('definition of done', () => {
  it('reports open items for a fresh template and closes them as work completes', () => {
    const a = treatedAssessment();
    const before = definitionOfDone(a, 1);
    expect(before).toHaveLength(8);
    expect(before.every((d) => !d.done)).toBe(true);
    a.intake = { ...a.intake, purpose: 'Support agent', owner: 'Jordan', prohibitedUses: 'No refunds', criticality: 'action-taking' };
    expect(definitionOfDone(a, 1)[0].done).toBe(true);
    a.signOff = { ...a.signOff, decision: 'approved-conditions', acceptanceAuthority: 'CISO', triggers: ['model'], reviewCadence: 'Quarterly', monitoringOwner: 'SOC' };
    expect(definitionOfDone(a, 1)[7].done).toBe(true);
  });
});

describe('report and persistence', () => {
  it('includes the Appendix G tracker and the test log, and round-trips controls', () => {
    const a = treatedAssessment();
    a.controls = generateControls(a).controls;
    a.controls[0].tests[0].result = 'fail';
    const blocks = buildReport(a);
    const tables = blocks.filter((b) => b.t === 'table') as Extract<(typeof blocks)[number], { t: 'table' }>[];
    expect(tables.some((t) => t.head.join('|') === 'ID|Requirement / control|Owner|Status|Evidence / test|Residual gap / due date')).toBe(true);
    expect(tables.some((t) => t.head[0] === 'Control' && t.head.includes('Remediation'))).toBe(true);
    expect(JSON.stringify(blocks)).toContain('Failing test');
    const b = parse(serialize(a));
    expect(b.controls).toEqual(a.controls);
  });
});
