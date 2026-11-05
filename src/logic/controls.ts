import { getPattern } from '../library/patterns';
import { DOMAINS } from '../library/threatRules';
import { uid } from '../model/factory';
import type { Assessment, Control, Tier, Threat, ValidationTest } from '../model/types';
import { computeGaps, missingFlowLabels } from './analysis';
import { rating } from './risk';

/**
 * Stage 7 – validate implementation (Section 11, Appendix G).
 * "A control is not implemented solely because it appears in a design,
 * prompt, policy, vendor brochure or backlog." Verification is therefore
 * derived from test evidence, separately from the claimed status.
 */

export type Verification = 'not-applicable' | 'untested' | 'failing' | 'blocked' | 'no-negative' | 'verified';

export const VERIFICATION_LABEL: Record<Verification, string> = {
  'not-applicable': 'Not applicable',
  untested: 'No test evidence',
  failing: 'Failing test',
  blocked: 'Test blocked',
  'no-negative': 'Needs a negative test',
  verified: 'Verified',
};

export function verification(c: Control): Verification {
  if (c.status === 'not-applicable') return 'not-applicable';
  const run = c.tests.filter((t) => t.result);
  if (!run.length) return 'untested';
  if (run.some((t) => t.result === 'fail')) return 'failing';
  if (run.some((t) => t.result === 'blocked')) return 'blocked';
  if (!run.some((t) => t.negative && t.result === 'pass')) return 'no-negative';
  return 'verified';
}

export const newTest = (method = '', negative = false): ValidationTest => ({
  id: uid('v'),
  method,
  negative,
  expected: '',
  actual: '',
  result: '',
  evidenceLocation: '',
  testDate: '',
  tester: '',
  remediationOwner: '',
});

/** Turns a pattern's suggested test ("Negative: …") into a test record. */
export function testFromSuggestion(s: string): ValidationTest {
  const text = s.replace(/^(Negative|Positive|Review):\s*/, '');
  return newTest(text.charAt(0).toUpperCase() + text.slice(1), /^Negative:/.test(s));
}

const nextRef = (controls: Control[]) => {
  const max = controls.reduce((m, c) => Math.max(m, Number(c.ref.replace(/\D/g, '')) || 0), 0);
  return `CTL-${String(max + 1).padStart(3, '0')}`;
};

export function emptyControl(controls: Control[]): Control {
  return {
    id: uid('ctl'),
    ref: nextRef(controls),
    requirement: '',
    patternId: null,
    threatIds: [],
    owner: '',
    status: 'planned',
    evidenceType: '',
    tests: [],
    residualGap: '',
    dueDate: '',
  };
}

/** Threats whose treatment relies on controls (anything but an explicit avoid with no patterns). */
const treated = (a: Assessment) => a.threats.filter((t) => t.status === 'accepted' && t.treatment && t.treatment !== 'avoid');

/**
 * Creates one control per secure pattern selected on treated threats, or
 * links new threats to an existing control for that pattern. Idempotent and
 * never removes or overwrites analyst work.
 */
export function generateControls(a: Assessment): { controls: Control[]; added: number; linked: number } {
  const controls = a.controls.map((c) => ({ ...c, threatIds: [...c.threatIds] }));
  let added = 0;
  let linked = 0;
  for (const t of treated(a)) {
    for (const pid of t.patterns) {
      const p = getPattern(pid);
      if (!p) continue;
      let c = controls.find((x) => x.patternId === pid);
      if (!c) {
        c = {
          ...emptyControl(controls),
          requirement: `${p.name}: ${p.outcome}`,
          patternId: pid,
          owner: t.owner,
          dueDate: t.dueDate,
          evidenceType: 'testing',
          tests: (p.tests ?? []).map(testFromSuggestion),
        };
        controls.push(c);
        added += 1;
      }
      if (!c.threatIds.includes(t.id)) {
        c.threatIds.push(t.id);
        linked += 1;
      }
    }
  }
  return { controls, added, linked };
}

export interface ThreatEvidence {
  controls: Control[];
  verified: number;
  /** Residual rating is below inherent but no linked control is verified. */
  unsupportedReduction: boolean;
}

export function threatEvidence(a: Assessment, t: Threat): ThreatEvidence {
  const controls = a.controls.filter((c) => c.threatIds.includes(t.id) && c.status !== 'not-applicable');
  const verified = controls.filter((c) => verification(c) === 'verified').length;
  const m = a.settings.riskMatrix;
  const inh = rating(m, t.inherentLikelihood, t.inherentImpact);
  const res = rating(m, t.residualLikelihood, t.residualImpact);
  return { controls, verified, unsupportedReduction: !!res && res < inh && verified === 0 && t.treatment !== 'transfer' && t.treatment !== 'accept' };
}

// ── Section 14 definition of done ─────────────────────────────────────────

export interface DoneItem {
  label: string;
  done: boolean;
  detail: string;
}

const AI_DOMAINS = new Set(DOMAINS.map((d) => d.id).filter((d) => d !== 'traditional'));

export function definitionOfDone(a: Assessment, tier: Tier): DoneItem[] {
  const m = a.settings.riskMatrix;
  const i = a.intake;
  const confirmed = a.threats.filter((t) => t.status === 'accepted');
  const gaps = computeGaps(a, tier);
  const items: DoneItem[] = [];

  const missingIntake = [!i.purpose && 'purpose', !(i.owner || a.signOff.businessOwner) && 'owner', !i.systemTypes.length && 'scope/system type', !i.criticality && 'criticality', !i.prohibitedUses && 'prohibited uses'].filter(Boolean);
  items.push({ label: 'Business purpose, owner, scope, criticality and intended/prohibited uses are documented.', done: !missingIntake.length, detail: missingIntake.length ? `Missing: ${missingIntake.join(', ')}` : 'Complete' });

  const unlabeled = a.flows.filter((f) => missingFlowLabels(f).length).length;
  const archMissing = [!a.components.length && 'no components', !a.boundaries.length && 'no trust boundaries', unlabeled && `${unlabeled} flows not fully labeled`, !a.signOff.technicalOwner && 'no technical owner recorded'].filter(Boolean);
  items.push({ label: 'Architecture, data flows, trust boundaries, identities, capabilities and dependencies are reviewed by accountable technical owners.', done: !archMissing.length, detail: archMissing.length ? archMissing.join('; ') : 'Complete' });

  const unanswered = gaps.filter((g) => g.kind === 'unanswered').length;
  const unownedUnknowns = gaps.filter((g) => g.kind === 'unknown' && (!g.owner || !g.dueDate)).length;
  items.push({
    label: 'Relevant questionnaires are completed; unanswered questions have owners and disposition.',
    done: !unanswered && !unownedUnknowns,
    detail: unanswered || unownedUnknowns ? `${unanswered} unanswered; ${unownedUnknowns} Unknowns without owner and date` : 'Complete',
  });

  const candidates = a.threats.filter((t) => t.status === 'candidate').length;
  const hasAi = confirmed.some((t) => AI_DOMAINS.has(t.domain));
  const hasTrad = confirmed.some((t) => t.domain === 'traditional' || t.frameworks.some((f) => ['attack', 'owasp-top10', 'owasp-api', 'owasp-nhi'].includes(f.fw)));
  const threatMissing = [!confirmed.length && 'no confirmed threats', candidates && `${candidates} candidates not reviewed`, confirmed.length && !hasAi && 'no AI-specific scenarios', confirmed.length && !hasTrad && 'no conventional cyber scenarios'].filter(Boolean);
  items.push({ label: 'Threat scenarios cover relevant AI and conventional cyber risks, including misuse and failure paths.', done: !threatMissing.length, detail: threatMissing.length ? threatMissing.join('; ') : `${confirmed.length} confirmed scenarios` });

  const unrated = confirmed.filter((t) => !rating(m, t.inherentLikelihood, t.inherentImpact)).length;
  const noResidual = confirmed.filter((t) => t.treatment && !rating(m, t.residualLikelihood, t.residualImpact)).length;
  const untreated = confirmed.filter((t) => !t.treatment).length;
  items.push({
    label: 'Risks are rated using the approved method; inherent and residual risk are distinct.',
    done: !!confirmed.length && !unrated && !noResidual && !untreated,
    detail: [unrated && `${unrated} without inherent rating`, untreated && `${untreated} without treatment`, noResidual && `${noResidual} without residual rating`].filter(Boolean).join('; ') || (confirmed.length ? 'Complete' : 'No confirmed threats'),
  });

  const mitigated = confirmed.filter((t) => t.treatment === 'mitigate');
  const unmapped = mitigated.filter((t) => !t.patterns.length || !t.owner || !a.controls.some((c) => c.threatIds.includes(t.id))).length;
  items.push({
    label: 'Secure patterns are mapped to requirements, implementation owners and evidence.',
    done: !!mitigated.length && !unmapped,
    detail: unmapped ? `${unmapped} mitigated threats lack patterns, an owner or a tracked control` : mitigated.length ? 'Complete' : 'No mitigated threats',
  });

  const material = a.controls.filter((c) => c.status !== 'not-applicable' && c.threatIds.some((id) => {
    const t = a.threats.find((x) => x.id === id);
    return t && rating(m, t.inherentLikelihood, t.inherentImpact) >= 3;
  }));
  const unverified = material.filter((c) => verification(c) !== 'verified').length;
  items.push({
    label: 'Material controls are tested, including negative/adversarial tests.',
    done: !!material.length && !unverified,
    detail: material.length ? (unverified ? `${unverified} of ${material.length} controls for High/Critical threats not verified` : 'Complete') : 'No controls linked to High/Critical threats',
  });

  const s = a.signOff;
  const accepted = confirmed.filter((t) => t.treatment === 'accept' && (!t.riskOwner || !t.reviewDate)).length;
  const signMissing = [!s.decision && 'no decision', !s.acceptanceAuthority && 'no acceptance authority', accepted && `${accepted} accepted risks without owner/expiry`, !s.triggers.length && 'no reassessment triggers', !s.reviewCadence && 'no review cadence', !s.monitoringOwner && 'no monitoring owner'].filter(Boolean);
  items.push({ label: 'Residual risks, exceptions, approvals, release conditions, monitoring and reassessment triggers are documented.', done: !signMissing.length, detail: signMissing.length ? signMissing.join('; ') : 'Complete' });
  return items;
}
