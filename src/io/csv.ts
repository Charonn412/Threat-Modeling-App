import { getPattern } from '../library/patterns';
import { DOMAINS } from '../library/threatRules';
import { lookup } from '../library/frameworks';
import { rating } from '../logic/risk';
import { narrative } from '../logic/threats';
import { threatEvidence, verification, VERIFICATION_LABEL } from '../logic/controls';
import { CONTROL_STATUS_LABEL, type Assessment, type Level, type Threat } from '../model/types';

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens accents and symbols correctly. */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    // Neutralize spreadsheet formula injection from user-entered text.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

const DOMAIN_NAME = new Map(DOMAINS.map((d) => [d.id, d.name]));
const lvl = (a: Assessment, l: Level, which: 'likelihood' | 'impact') => (l ? a.settings.riskMatrix[which === 'likelihood' ? 'likelihoodLabels' : 'impactLabels'][l - 1] : '');
const rate = (a: Assessment, l: Level, i: Level) => {
  const r = rating(a.settings.riskMatrix, l, i);
  return r ? a.settings.riskMatrix.ratingLabels[r - 1] : '';
};
const comps = (a: Assessment, t: Threat) => t.componentIds.map((id) => a.components.find((c) => c.id === id)?.name ?? '').filter(Boolean).join('; ');
const tags = (t: Threat) => t.frameworks.map((f) => `${f.id}${lookup(f.fw, f.id) ? ` ${lookup(f.fw, f.id)!.name}` : ''}`).join('; ');

export function riskRegisterCsv(a: Assessment): string {
  const head = [
    'ID',
    'Title',
    'Status',
    'Domain',
    'Components',
    'Inherent likelihood',
    'Inherent impact',
    'Inherent rating',
    'Treatment',
    'Secure patterns',
    'Requirements',
    'Owner',
    'Due date',
    'Controls',
    'Residual likelihood',
    'Residual impact',
    'Residual rating',
    'Risk owner',
    'Review date',
    'Framework mappings',
    'Narrative',
  ];
  const rows = a.threats
    .filter((t) => t.status !== 'candidate')
    .map((t) => [
      t.ref,
      t.title,
      t.status === 'accepted' ? 'Confirmed' : `Dismissed: ${t.dismissReason}`,
      DOMAIN_NAME.get(t.domain) ?? t.domain,
      comps(a, t),
      lvl(a, t.inherentLikelihood, 'likelihood'),
      lvl(a, t.inherentImpact, 'impact'),
      rate(a, t.inherentLikelihood, t.inherentImpact),
      t.treatment,
      t.patterns.map((p) => getPattern(p)?.name ?? p).join('; '),
      t.requirements,
      t.owner,
      t.dueDate,
      threatEvidence(a, t).controls.map((c) => `${c.ref} (${VERIFICATION_LABEL[verification(c)]})`).join('; '),
      lvl(a, t.residualLikelihood, 'likelihood'),
      lvl(a, t.residualImpact, 'impact'),
      rate(a, t.residualLikelihood, t.residualImpact),
      t.riskOwner,
      t.reviewDate,
      tags(t),
      narrative(t, a),
    ]);
  return toCsv([head, ...rows]);
}

export function controlsCsv(a: Assessment): string {
  const head = ['Control', 'Requirement', 'Pattern', 'Owner', 'Claimed status', 'Evidence-backed status', 'Evidence type', 'Threats', 'Test', 'Negative', 'Expected', 'Actual', 'Result', 'Evidence location', 'Test date', 'Tester', 'Remediation owner', 'Residual gap', 'Due date'];
  const rows: (string | number)[][] = [];
  for (const c of a.controls) {
    const base = [
      c.ref,
      c.requirement,
      c.patternId ? (getPattern(c.patternId)?.name ?? c.patternId) : '',
      c.owner,
      CONTROL_STATUS_LABEL[c.status],
      VERIFICATION_LABEL[verification(c)],
      c.evidenceType,
      c.threatIds.map((id) => a.threats.find((t) => t.id === id)?.ref).filter(Boolean).join('; '),
    ];
    const tail = [c.residualGap, c.dueDate];
    if (!c.tests.length) rows.push([...base, '', '', '', '', '', '', '', '', '', ...tail]);
    for (const t of c.tests) rows.push([...base, t.method, t.negative ? 'Yes' : 'No', t.expected, t.actual, t.result, t.evidenceLocation, t.testDate, t.tester, t.remediationOwner, ...tail]);
  }
  return toCsv([head, ...rows]);
}

const PRIORITY = ['Low', 'Medium', 'High', 'Highest'];

/**
 * Jira CSV import (System → External system import → CSV). Map the columns
 * to Summary, Issue Type, Priority, Description, Labels and Due Date in the
 * import wizard. One issue per unverified control and per confirmed threat
 * still without a treatment decision.
 */
export function jiraCsv(a: Assessment): string {
  const head = ['Summary', 'Issue Type', 'Priority', 'Description', 'Labels', 'Due Date'];
  const sys = (a.intake.systemName || 'ai-system').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const rows: string[][] = [];
  for (const c of a.controls) {
    const v = verification(c);
    if (v === 'verified' || v === 'not-applicable') continue;
    const threats = a.threats.filter((t) => c.threatIds.includes(t.id));
    const worst = threats.reduce((m, t) => Math.max(m, rating(a.settings.riskMatrix, t.inherentLikelihood, t.inherentImpact)), 0);
    rows.push([
      `[${c.ref}] ${c.requirement.split(':')[0]}`,
      'Task',
      PRIORITY[Math.max(0, worst - 1)],
      [
        c.requirement,
        `Owner: ${c.owner || 'unassigned'}`,
        `Evidence-backed status: ${VERIFICATION_LABEL[v]}`,
        `Addresses: ${threats.map((t) => `${t.ref} ${t.title}`).join('; ') || 'n/a'}`,
        'Validation tests:',
        ...c.tests.map((t) => `- ${t.negative ? '[negative] ' : ''}${t.method}${t.result ? ` (${t.result})` : ''}`),
      ].join('\n'),
      ['threat-model', sys, 'control', v].join(' '),
      c.dueDate,
    ]);
  }
  for (const t of a.threats) {
    if (t.status !== 'accepted' || t.treatment) continue;
    const r = rating(a.settings.riskMatrix, t.inherentLikelihood, t.inherentImpact);
    rows.push([
      `[${t.ref}] Decide treatment: ${t.title}`,
      'Task',
      PRIORITY[Math.max(0, r - 1)],
      [narrative(t, a), `Inherent rating: ${rate(a, t.inherentLikelihood, t.inherentImpact) || 'not rated'}`, `Framework mappings: ${tags(t)}`].join('\n'),
      ['threat-model', sys, 'threat', t.domain].join(' '),
      t.dueDate,
    ]);
  }
  return toCsv([head, ...rows]);
}
