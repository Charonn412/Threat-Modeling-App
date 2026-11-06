import type { FrameworkRef } from '../model/types';

/**
 * Compliance mappings. Secure patterns (Appendix D) map to the controls and
 * requirements they help satisfy; controls generated from a pattern inherit
 * its mappings. Threat domains (Appendix C) map to the risks they represent.
 * Every ID is checked against the catalogs by tests.
 */

const r = (...refs: string[]): FrameworkRef[] =>
  refs.map((x) => {
    const i = x.indexOf(':');
    return { fw: x.slice(0, i), id: x.slice(i + 1) };
  });

export const PATTERN_COMPLIANCE: Record<string, FrameworkRef[]> = {
  'policy-outside-model': r('nist-ai-rmf:MANAGE 1.3', 'nist-ai-rmf:MAP 3.5', 'iso-42001:A.6.2.2', 'iso-42001:A.9.2', 'eu-ai-act:Art. 14', 'eu-ai-act:Art. 15', 'nist-csf:PR.AA-05', 'nist-800-53:AC-3', 'nist-800-53:AC-6'),
  'capability-tools': r('nist-ai-rmf:MAP 4.2', 'nist-ai-rmf:MANAGE 1.3', 'iso-42001:A.6.2.2', 'iso-42001:A.9.4', 'eu-ai-act:Art. 15', 'nist-csf:PR.AA-05', 'nist-800-53:AC-6', 'nist-800-53:CM-7'),
  'approval-bound': r('nist-ai-rmf:GOVERN 3.2', 'nist-ai-rmf:MAP 3.5', 'iso-42001:A.9.2', 'eu-ai-act:Art. 14', 'nist-csf:GV.RR-02', 'nist-800-53:AC-3', 'nist-800-53:AC-5'),
  'untrusted-isolation': r('nist-ai-rmf:MEASURE 2.7', 'iso-42001:A.6.2.2', 'eu-ai-act:Art. 15', 'nist-csf:PR.PS-06', 'nist-800-53:SI-10'),
  'rag-authz': r('nist-ai-rmf:MEASURE 2.10', 'iso-42001:A.7.5', 'eu-ai-act:Art. 10', 'nist-csf:PR.AA-05', 'nist-csf:PR.DS-01', 'nist-800-53:AC-3', 'nist-800-53:AC-4', 'nist-800-53:AC-21'),
  'structured-outputs': r('nist-ai-rmf:MEASURE 2.7', 'iso-42001:A.6.2.4', 'eu-ai-act:Art. 15', 'nist-csf:PR.PS-06', 'nist-800-53:SI-10', 'nist-800-53:SI-15'),
  'sandboxed-execution': r('nist-ai-rmf:MEASURE 2.7', 'iso-42001:A.6.2.6', 'eu-ai-act:Art. 15', 'nist-csf:PR.IR-01', 'nist-800-53:SC-39', 'nist-800-53:SC-7', 'nist-800-53:CM-7'),
  'identity-delegation': r('nist-ai-rmf:MAP 4.2', 'iso-42001:A.6.2.2', 'eu-ai-act:Art. 15', 'nist-csf:PR.AA-01', 'nist-csf:PR.AA-05', 'nist-800-53:IA-2', 'nist-800-53:IA-9', 'nist-800-53:AC-6', 'nist-800-53:AU-10'),
  'data-minimization': r('nist-ai-rmf:MEASURE 2.10', 'iso-42001:A.7.2', 'iso-42001:A.7.4', 'eu-ai-act:Art. 10', 'nist-csf:PR.DS-01', 'nist-csf:PR.DS-02', 'nist-800-53:SC-28', 'nist-800-53:SI-12', 'nist-800-53:PT-2', 'nist-800-53:PT-3'),
  'bounded-autonomy': r('nist-ai-rmf:MANAGE 2.4', 'nist-ai-rmf:MEASURE 2.6', 'iso-42001:A.9.4', 'eu-ai-act:Art. 14', 'nist-csf:PR.IR-04', 'nist-800-53:SC-5', 'nist-800-53:AC-6'),
  'secure-model-lifecycle': r('nist-ai-rmf:MEASURE 2.3', 'nist-ai-rmf:MEASURE 2.5', 'nist-ai-rmf:MANAGE 3.2', 'iso-42001:A.6.1.3', 'iso-42001:A.6.2.4', 'iso-42001:A.6.2.5', 'iso-42001:A.6.2.7', 'eu-ai-act:Art. 11', 'eu-ai-act:Art. 15', 'eu-ai-act:Art. 17', 'nist-csf:PR.PS-06', 'nist-800-53:SA-11', 'nist-800-53:CM-3', 'nist-800-53:SI-7'),
  'resilient-operations': r('nist-ai-rmf:MANAGE 2.3', 'nist-ai-rmf:MANAGE 2.4', 'iso-42001:A.6.2.6', 'eu-ai-act:Art. 15', 'nist-csf:PR.IR-03', 'nist-csf:RC.RP-01', 'nist-800-53:CP-2', 'nist-800-53:SC-5', 'nist-800-53:IR-4'),
  'authn-session': r('nist-ai-rmf:MEASURE 2.7', 'eu-ai-act:Art. 15', 'nist-csf:PR.AA-01', 'nist-csf:PR.AA-03', 'nist-800-53:IA-2', 'nist-800-53:IA-2(1)', 'nist-800-53:AC-12', 'nist-800-53:SC-23'),
  'secrets-management': r('eu-ai-act:Art. 15', 'nist-csf:PR.DS-01', 'nist-csf:PR.AA-01', 'nist-800-53:IA-5', 'nist-800-53:SC-12', 'nist-800-53:SC-28'),
  'secure-transport': r('eu-ai-act:Art. 15', 'nist-csf:PR.DS-02', 'nist-csf:PR.IR-01', 'nist-800-53:SC-8', 'nist-800-53:SC-7'),
  'hardened-runtime': r('eu-ai-act:Art. 15', 'iso-42001:A.4.5', 'nist-csf:PR.PS-01', 'nist-csf:PR.PS-02', 'nist-csf:PR.IR-01', 'nist-800-53:CM-6', 'nist-800-53:CM-7', 'nist-800-53:SI-2', 'nist-800-53:SC-39'),
  'supply-chain': r('nist-ai-rmf:GOVERN 6.1', 'nist-ai-rmf:MAP 4.1', 'nist-ai-rmf:MANAGE 3.1', 'nist-ai-rmf:MANAGE 3.2', 'iso-42001:A.10.2', 'iso-42001:A.10.3', 'eu-ai-act:Art. 15', 'nist-csf:GV.SC-05', 'nist-csf:GV.SC-07', 'nist-800-53:SR-3', 'nist-800-53:SR-4', 'nist-800-53:SR-11', 'nist-800-53:SA-9'),
  'audit-monitoring': r('nist-ai-rmf:MEASURE 2.4', 'nist-ai-rmf:MANAGE 4.1', 'nist-ai-rmf:MANAGE 4.3', 'iso-42001:A.6.2.6', 'iso-42001:A.6.2.8', 'iso-42001:A.8.4', 'eu-ai-act:Art. 12', 'eu-ai-act:Art. 72', 'eu-ai-act:Art. 73', 'nist-csf:DE.CM-01', 'nist-csf:DE.CM-09', 'nist-csf:DE.AE-02', 'nist-csf:RS.MA-01', 'nist-800-53:AU-2', 'nist-800-53:AU-6', 'nist-800-53:AU-9', 'nist-800-53:AU-12', 'nist-800-53:SI-4', 'nist-800-53:IR-4'),
  'input-validation': r('nist-ai-rmf:MEASURE 2.7', 'eu-ai-act:Art. 15', 'nist-csf:PR.PS-06', 'nist-800-53:SI-10'),
};

/** Threat domains → the AI 600-1 risk categories and AI RMF subcategories they represent. */
export const DOMAIN_COMPLIANCE: Record<string, FrameworkRef[]> = {
  'prompt-injection': r('nist-ai-600-1:9', 'nist-ai-rmf:MEASURE 2.7'),
  'data-disclosure': r('nist-ai-600-1:4', 'nist-ai-600-1:9', 'nist-ai-rmf:MEASURE 2.10'),
  'excessive-agency': r('nist-ai-600-1:7', 'nist-ai-600-1:9', 'nist-ai-rmf:MANAGE 2.4'),
  identity: r('nist-ai-600-1:9', 'nist-ai-rmf:MEASURE 2.7'),
  'rag-poisoning': r('nist-ai-600-1:8', 'nist-ai-600-1:9', 'nist-ai-rmf:MEASURE 2.7'),
  'memory-poisoning': r('nist-ai-600-1:8', 'nist-ai-rmf:MEASURE 2.7'),
  'multi-agent': r('nist-ai-600-1:7', 'nist-ai-600-1:12', 'nist-ai-rmf:MAP 4.2'),
  'output-handling': r('nist-ai-600-1:2', 'nist-ai-600-1:9', 'nist-ai-rmf:MEASURE 2.5'),
  'model-integrity': r('nist-ai-600-1:12', 'nist-ai-600-1:2', 'nist-ai-rmf:MANAGE 3.2'),
  availability: r('nist-ai-600-1:9', 'nist-ai-rmf:MEASURE 2.7'),
  'tenant-isolation': r('nist-ai-600-1:4', 'nist-ai-rmf:MEASURE 2.10'),
  'human-workflow': r('nist-ai-600-1:7', 'nist-ai-rmf:GOVERN 3.2', 'nist-ai-rmf:MAP 3.5'),
  monitoring: r('nist-ai-rmf:MEASURE 2.4', 'nist-ai-rmf:MANAGE 4.1'),
  traditional: r('nist-ai-600-1:9', 'nist-ai-rmf:MEASURE 2.7'),
};
