import { DOMAIN_COMPLIANCE } from '../library/complianceMap';
import { CATALOGS, type CatalogItem } from '../library/frameworks';
import { getPattern } from '../library/patterns';
import type { Assessment, Control, FrameworkRef, Threat } from '../model/types';
import { verification } from './controls';

/**
 * Compliance traceability: requirement → controls (via secure patterns) and
 * threats (via patterns and threat domain), with evidence-backed status.
 */

const key = (r: FrameworkRef) => `${r.fw}|${r.id}`;
const uniq = (refs: FrameworkRef[]) => [...new Map(refs.map((r) => [key(r), r])).values()];

export function controlCompliance(c: Control): FrameworkRef[] {
  return c.patternId ? (getPattern(c.patternId)?.compliance ?? []) : [];
}

export function threatCompliance(t: Threat): FrameworkRef[] {
  return uniq([...(DOMAIN_COMPLIANCE[t.domain] ?? []), ...t.patterns.flatMap((p) => getPattern(p)?.compliance ?? [])]);
}

export type CoverageStatus = 'verified' | 'in-progress' | 'gap';

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  verified: 'Verified control',
  'in-progress': 'Control not yet verified',
  gap: 'Risk identified, no control',
};

export interface CoverageRow {
  item: CatalogItem;
  status: CoverageStatus;
  controls: Control[];
  threats: Threat[];
}

export interface Coverage {
  catalogId: string;
  rows: CoverageRow[];
  verified: number;
  inProgress: number;
  gaps: number;
  /** Catalog items this assessment does not touch (often governance requirements outside a threat model). */
  notAddressed: number;
}

export function complianceCoverage(a: Assessment, catalogId: string): Coverage {
  const cat = CATALOGS.find((c) => c.id === catalogId);
  const empty = { catalogId, rows: [], verified: 0, inProgress: 0, gaps: 0, notAddressed: cat?.items.length ?? 0 };
  if (!cat) return empty;
  const controls = a.controls.filter((c) => c.status !== 'not-applicable');
  const threats = a.threats.filter((t) => t.status === 'accepted');
  const rows: CoverageRow[] = [];
  for (const item of cat.items) {
    const matches = (refs: FrameworkRef[]) => refs.some((r) => r.fw === catalogId && r.id === item.id);
    const ts = threats.filter((t) => matches(threatCompliance(t)));
    // Risk catalogs (items are risks, not requirements) are covered by the controls treating those threats.
    const cs = RISK_CATALOGS.has(catalogId)
      ? controls.filter((c) => c.threatIds.some((id) => ts.some((t) => t.id === id)))
      : controls.filter((c) => matches(controlCompliance(c)));
    if (!cs.length && !ts.length) continue;
    const status: CoverageStatus = cs.some((c) => verification(c) === 'verified') ? 'verified' : cs.length ? 'in-progress' : 'gap';
    rows.push({ item, status, controls: cs, threats: ts });
  }
  return {
    catalogId,
    rows,
    verified: rows.filter((r) => r.status === 'verified').length,
    inProgress: rows.filter((r) => r.status === 'in-progress').length,
    gaps: rows.filter((r) => r.status === 'gap').length,
    notAddressed: cat.items.length - rows.length,
  };
}

/** Catalogs whose items are risk categories rather than controls. */
const RISK_CATALOGS = new Set(['nist-ai-600-1']);

export const COMPLIANCE_IDS = ['nist-ai-rmf', 'nist-ai-600-1', 'iso-42001', 'eu-ai-act', 'nist-csf', 'nist-800-53'];
