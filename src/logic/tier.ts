import type { Intake, Tier } from '../model/types';

export interface TierResult {
  tier: Tier;
  score: number;
  reasons: string[];
}

/**
 * Risk-proportionate assurance (Part I §3): rigor scales with sensitivity,
 * exposure, autonomy, scale and potential impact. Scores intake answers and
 * maps them to Light (≤3), Standard (4–7) or Deep (≥8). Any single
 * "severe" signal forces at least Standard.
 */
export function computeTier(intake: Intake): TierResult {
  let score = 0;
  const reasons: string[] = [];
  let floor: Tier = 1;
  const add = (pts: number, why: string) => {
    if (pts > 0) {
      score += pts;
      reasons.push(`+${pts} ${why}`);
    }
  };

  add({ '': 0, public: 0, internal: 1, confidential: 2, restricted: 3 }[intake.dataSensitivity], `data sensitivity: ${intake.dataSensitivity}`);
  const sensitiveTypes = intake.dataTypes.filter((t) => ['personal', 'regulated', 'secrets', 'special-category'].includes(t));
  if (sensitiveTypes.length) add(Math.min(2, sensitiveTypes.length), `sensitive data types: ${sensitiveTypes.join(', ')}`);

  add({ '': 0, internal: 0, 'external-auth': 1, public: 2 }[intake.exposure], `exposure: ${intake.exposure}`);
  if (intake.vulnerablePopulations === 'yes') {
    add(2, 'minors or vulnerable populations involved');
    floor = Math.max(floor, 2) as Tier;
  }

  add({ '': 0, advisory: 0, 'decision-support': 1, 'action-taking': 2 }[intake.criticality], `criticality: ${intake.criticality}`);
  const impacts = intake.regulatedImpact.filter((x) => x !== 'none');
  if (impacts.length) {
    add(Math.min(3, impacts.length + 1), `affects: ${impacts.join(', ')}`);
    floor = Math.max(floor, 2) as Tier;
  }

  add({ '': 0, none: 0, suggest: 0, bounded: 2, broad: 4 }[intake.autonomy], `autonomy: ${intake.autonomy}`);
  if (intake.autonomy === 'broad') floor = 3;
  add({ '': 0, reversible: 0, partial: 1, irreversible: 2 }[intake.reversibility], `reversibility: ${intake.reversibility}`);

  if (intake.systemTypes.includes('agentic')) add(1, 'agentic system');
  if (intake.systemTypes.includes('platform')) add(1, 'shared AI platform (multi-tenant blast radius)');

  let tier: Tier = score >= 8 ? 3 : score >= 4 ? 2 : 1;
  tier = Math.max(tier, floor) as Tier;
  if (intake.tierOverride) {
    reasons.push(`override → ${intake.tierOverride}`);
    tier = intake.tierOverride;
  }
  return { tier, score, reasons };
}
