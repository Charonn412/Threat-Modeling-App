import { COMPLIANCE_CATALOGS } from '../library/frameworks/compliance';
import { DOMAIN_COMPLIANCE, PATTERN_COMPLIANCE } from '../library/complianceMap';
import { PATTERNS } from '../library/patterns';
import { DOMAINS } from '../library/threatRules';
import { lookup } from '../library/frameworks';
import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { refreshThreats } from './threats';
import { generateControls } from './controls';
import { complianceCoverage, COMPLIANCE_IDS, threatCompliance } from './compliance';

describe('compliance catalogs', () => {
  it('have the official sizes from NIST data and the transcribed lists', () => {
    const size = Object.fromEntries(COMPLIANCE_CATALOGS.map((c) => [c.id, c.items.length]));
    expect(size['nist-ai-rmf']).toBe(72);
    expect(size['nist-ai-600-1']).toBe(12);
    expect(size['iso-42001']).toBe(38);
    expect(size['nist-csf']).toBe(22 + 106);
    expect(size['nist-800-53']).toBeGreaterThan(1000);
    expect(lookup('nist-800-53', 'AC-6')?.name).toBe('Least Privilege');
    expect(lookup('nist-csf', 'PR.AA')?.name).toBe('Identity Management, Authentication, and Access Control');
    expect(lookup('nist-ai-rmf', 'MANAGE 2.4')).toBeDefined();
  });

  it('every mapping resolves to a real catalog item', () => {
    for (const [pid, refs] of Object.entries(PATTERN_COMPLIANCE)) {
      expect(PATTERNS.some((p) => p.id === pid), pid).toBe(true);
      for (const r of refs) expect(lookup(r.fw, r.id), `${pid}: ${r.fw} ${r.id}`).toBeDefined();
    }
    for (const [d, refs] of Object.entries(DOMAIN_COMPLIANCE)) {
      expect(DOMAINS.some((x) => x.id === d), d).toBe(true);
      for (const r of refs) expect(lookup(r.fw, r.id), `${d}: ${r.fw} ${r.id}`).toBeDefined();
    }
  });

  it('every secure pattern and threat domain is mapped', () => {
    for (const p of PATTERNS) expect(p.compliance?.length, p.id).toBeGreaterThan(0);
    for (const d of DOMAINS) expect(DOMAIN_COMPLIANCE[d.id]?.length, d.id).toBeGreaterThan(0);
  });
});

describe('compliance coverage', () => {
  it('moves from gap to in progress to verified as controls are created and tested', () => {
    const a = instantiateTemplate(TEMPLATES[1]);
    a.threats = refreshThreats(a).threats.map((t) => (t.ruleId === 'AG-TOOL-MISUSE' ? { ...t, status: 'accepted', treatment: 'mitigate' } : t));
    const t = a.threats.find((x) => x.ruleId === 'AG-TOOL-MISUSE')!;
    expect(threatCompliance(t).some((r) => r.fw === 'eu-ai-act' && r.id === 'Art. 15')).toBe(true);
    const status = () => complianceCoverage(a, 'nist-800-53').rows.find((r) => r.item.id === 'AC-6')?.status;
    expect(status()).toBe('gap');
    a.controls = generateControls(a).controls;
    expect(status()).toBe('in-progress');
    const ctl = a.controls.find((c) => c.patternId === 'policy-outside-model')!;
    ctl.tests = ctl.tests.map((x) => ({ ...x, result: 'pass' }));
    expect(status()).toBe('verified');
    for (const id of COMPLIANCE_IDS) expect(complianceCoverage(a, id).rows.length).toBeGreaterThan(0);
    // AI 600-1 risk categories are covered through the controls treating threats in that category.
    expect(complianceCoverage(a, 'nist-ai-600-1').rows.find((r) => r.item.id === '9')?.status).toBe('verified');
  });
});
