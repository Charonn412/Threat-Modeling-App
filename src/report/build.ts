import { getComponentType } from '../library/catalog';
import { CATALOGS, getCatalog, lookup } from '../library/frameworks';
import { INTAKE_SECTIONS } from '../library/intake';
import { getPattern } from '../library/patterns';
import { QUESTIONS, questionsForAreas } from '../library/questions';
import { DOMAINS } from '../library/threatRules';
import { computeGaps, completeness, crossedBoundaries, membership, missingFlowLabels } from '../logic/analysis';
import { autonomyReach, rating } from '../logic/risk';
import { narrative } from '../logic/threats';
import { classify, overallPosture } from '../logic/posture';
import { definitionOfDone, threatEvidence, verification, VERIFICATION_LABEL } from '../logic/controls';
import { computeTier } from '../logic/tier';
import {
  answerKey,
  CONTROL_STATUS_LABEL,
  DECISION_LABEL,
  REASSESSMENT_TRIGGERS,
  OBJECTIVE_LABEL,
  TIER_LABEL,
  type Assessment,
  type Intake,
  type Level,
  type ObjectiveId,
  type Threat,
} from '../model/types';
import { BOUNDARY_KIND_LABEL, CONTENT_ORIGIN_OPTIONS, TRUST_OPTIONS } from '../ui/labels';
import { RATING_FILL, RATING_TEXT, type Block, type Cell } from './blocks';
import { flowNumbers, renderArchitectureSvg } from './diagram';

export type SectionId = 'summary' | 'charter' | 'architecture' | 'answers' | 'objectives' | 'threats' | 'register' | 'controls' | 'coverage' | 'gaps' | 'dod' | 'signoff';

export const SECTIONS: { id: SectionId; title: string }[] = [
  { id: 'summary', title: 'Executive summary' },
  { id: 'charter', title: 'Assessment charter and scope' },
  { id: 'architecture', title: 'Architecture and data flows' },
  { id: 'answers', title: 'Architecture discovery record' },
  { id: 'objectives', title: 'Security objectives' },
  { id: 'threats', title: 'Threat scenarios' },
  { id: 'register', title: 'Risk register and treatment' },
  { id: 'controls', title: 'Control and evidence tracker' },
  { id: 'coverage', title: 'Framework coverage' },
  { id: 'gaps', title: 'Open items, assumptions and gaps' },
  { id: 'dod', title: 'Definition of done' },
  { id: 'signoff', title: 'Approval and sign-off' },
];

export interface ReportOptions {
  sections: Record<SectionId, boolean>;
  includeDismissed: boolean;
  includeUnanswered: boolean;
  generatedAt?: Date;
}

export const defaultReportOptions = (): ReportOptions => ({
  sections: Object.fromEntries(SECTIONS.map((s) => [s.id, true])) as Record<SectionId, boolean>,
  includeDismissed: true,
  includeUnanswered: false,
});

const STATUS_LABEL = { yes: 'Yes', no: 'No', na: 'N/A', unknown: 'Unknown' } as const;
/** Answer cells are colored by what they mean for security, not by Yes/No. */
const FINDING_FILL: Record<string, string> = { secure: '#d3f9d8', weak: '#ffc9c9', gap: '#fff3bf', na: '#e9ecef', info: '#e7f5ff' };
const DOMAIN_NAME = new Map(DOMAINS.map((d) => [d.id, d.name]));
const ORIGIN = new Map(CONTENT_ORIGIN_OPTIONS.map((o) => [o.value, o.label]));
const TRUST = new Map(TRUST_OPTIONS.map((o) => [o.value, o.label]));

const dash = (s: string | undefined | null) => (s && s.trim() ? s.trim() : '—');

function ratingCell(a: Assessment, l: Level, i: Level): Cell {
  const m = a.settings.riskMatrix;
  const r = rating(m, l, i);
  if (!r) return { text: 'Not rated', color: '#868e96' };
  return { text: m.ratingLabels[r - 1], fill: RATING_FILL[r - 1], color: RATING_TEXT[r - 1], bold: true };
}

function levelText(labels: string[], l: Level) {
  return l ? labels[l - 1] : '—';
}

function intakeRows(intake: Intake): [string, Cell][] {
  const rows: [string, Cell][] = [];
  for (const sec of INTAKE_SECTIONS) {
    for (const f of sec.fields) {
      const v = intake[f.key];
      let text: string;
      if (f.kind === 'single' || f.kind === 'multi') {
        const vals = Array.isArray(v) ? (v as string[]) : v ? [String(v)] : [];
        text = vals.map((x) => f.options.find((o) => o.value === x)?.label ?? x).join(', ');
      } else text = String(v ?? '');
      rows.push([f.label, dash(text)]);
    }
  }
  return rows;
}

function frameworkLine(t: Threat): string {
  return CATALOGS.filter((c) => t.frameworks.some((f) => f.fw === c.id))
    .map((c) => `${c.short}: ${t.frameworks.filter((f) => f.fw === c.id).map((f) => `${f.id} ${lookup(f.fw, f.id)?.name ?? ''}`.trim()).join('; ')}`)
    .join(' | ');
}

const sortByRisk = (a: Assessment) => (x: Threat, y: Threat) =>
  rating(a.settings.riskMatrix, y.inherentLikelihood, y.inherentImpact) - rating(a.settings.riskMatrix, x.inherentLikelihood, x.inherentImpact) || x.ref.localeCompare(y.ref);

function heatmapTable(a: Assessment, pts: { l: Level; i: Level }[]): Block {
  const m = a.settings.riskMatrix;
  const rows: Cell[][] = [4, 3, 2, 1].map((l) => [
    { text: m.likelihoodLabels[l - 1], bold: true },
    ...[1, 2, 3, 4].map((i) => {
      const r = m.grid[l - 1][i - 1];
      const n = pts.filter((p) => p.l === l && p.i === i).length;
      return { text: n ? String(n) : '', fill: RATING_FILL[r - 1], color: RATING_TEXT[r - 1], bold: true } as Cell;
    }),
  ]);
  return { t: 'table', head: ['Likelihood \\ Impact', ...m.impactLabels], rows, widths: [2, 1, 1, 1, 1] };
}

export function buildReport(a: Assessment, opts: ReportOptions = defaultReportOptions()): Block[] {
  const b: Block[] = [];
  const on = (id: SectionId) => opts.sections[id];
  const m = a.settings.riskMatrix;
  const tier = computeTier(a.intake);
  const name = a.intake.systemName || 'Untitled AI system';
  const confirmed = a.threats.filter((t) => t.status === 'accepted').sort(sortByRisk(a));
  const dismissed = a.threats.filter((t) => t.status === 'dismissed');
  const candidates = a.threats.filter((t) => t.status === 'candidate');
  const nums = flowNumbers(a);
  const byId = new Map(a.components.map((c) => [c.id, c]));
  const members = membership(a);
  const gaps = computeGaps(a, tier.tier);
  const comp = completeness(a, tier.tier);
  const posture = overallPosture(a);
  const generated = (opts.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const decision = a.signOff.decision ? DECISION_LABEL[a.signOff.decision] : 'Not yet decided';
  let n = 0;
  const section = (id: SectionId) => {
    n += 1;
    return `${n}. ${SECTIONS.find((s) => s.id === id)!.title}`;
  };

  b.push({
    t: 'title',
    text: `${name}: AI threat model`,
    subtitle: `Assessment ${dash(a.signOff.assessmentId)} · version ${dash(a.signOff.version)} · ${a.signOff.assessmentDate || generated} · ${TIER_LABEL[tier.tier]} assurance tier · Decision: ${decision}`,
  });
  b.push({
    t: 'kv',
    rows: [
      ['Business owner', dash(a.signOff.businessOwner || a.intake.owner)],
      ['Technical owner / architect', dash(a.signOff.technicalOwner)],
      ['Security reviewer / facilitator', dash(a.signOff.securityReviewer)],
      ['Methodology', 'Enterprise AI Security: Threat Modeling Methodology & Architecture Assessment Appendices'],
      ['Frameworks assessed against', Object.entries(a.frameworkVersions).map(([k, v]) => `${k} ${v}`).join('; ')],
      ['Report generated', generated],
    ],
  });

  // ── Executive summary ────────────────────────────────────────────────
  if (on('summary')) {
    b.push({ t: 'h1', text: section('summary') });
    const byRating = [1, 2, 3, 4].map((r) => confirmed.filter((t) => rating(m, t.inherentLikelihood, t.inherentImpact) === r).length);
    const resByRating = [1, 2, 3, 4].map((r) => confirmed.filter((t) => rating(m, t.residualLikelihood, t.residualImpact) === r).length);
    const unknowns = gaps.filter((g) => g.kind === 'unknown').length;
    b.push({
      t: 'p',
      text:
        `${name} was assessed at the ${TIER_LABEL[tier.tier]} assurance tier. The architecture has ${a.components.length} components, ${a.flows.length} data and control flows and ${a.boundaries.length} trust boundaries ` +
        `(${comp.crossingFlows} ${plural(comp.crossingFlows, 'flow crosses', 'flows cross')} a boundary). ${confirmed.length} threat ${plural(confirmed.length, 'scenario was', 'scenarios were')} confirmed` +
        (dismissed.length ? `, ${dismissed.length} ${plural(dismissed.length, 'was', 'were')} dismissed with rationale` : '') +
        (candidates.length ? `, and ${candidates.length} ${plural(candidates.length, 'candidate is', 'candidates are')} still awaiting review` : '') +
        `. Current decision: ${decision}.` +
        (posture.score !== null ? ` Architecture posture from Appendix B answers: ${posture.score}% secure (${posture.weak} weak ${plural(posture.weak, 'answer', 'answers')}, ${posture.gap} unknown).` : ''),
    });
    b.push({
      t: 'table',
      head: ['', ...m.ratingLabels],
      rows: [
        [{ text: 'Inherent risk', bold: true }, ...byRating.map((x, i) => ({ text: String(x), fill: x ? RATING_FILL[i] : undefined, color: x ? RATING_TEXT[i] : undefined, bold: true }))],
        [{ text: 'Residual risk', bold: true }, ...resByRating.map((x, i) => ({ text: String(x), fill: x ? RATING_FILL[i] : undefined, color: x ? RATING_TEXT[i] : undefined, bold: true }))],
      ],
      widths: [2, 1, 1, 1, 1],
    });
    const top = confirmed.slice(0, 10);
    if (top.length) {
      b.push({ t: 'h3', text: 'Highest-rated risks' });
      b.push({
        t: 'table',
        head: ['ID', 'Threat', 'Inherent', 'Treatment', 'Residual', 'Owner'],
        rows: top.map((t) => [t.ref, t.title, ratingCell(a, t.inherentLikelihood, t.inherentImpact), t.treatment ? capital(t.treatment) : '—', ratingCell(a, t.residualLikelihood, t.residualImpact), dash(t.owner)]),
        widths: [1, 5, 1.4, 1.4, 1.4, 2],
      });
    }
    const keyItems: string[] = [];
    if (posture.weak) keyItems.push(`${posture.weak} Appendix B ${plural(posture.weak, 'answer indicates', 'answers indicate')} a security weakness (see the discovery record).`);
    if (unknowns) keyItems.push(`${unknowns} architecture ${plural(unknowns, 'question is', 'questions are')} marked Unknown (tracked gaps).`);
    if (candidates.length) keyItems.push(`${candidates.length} generated threat ${plural(candidates.length, 'candidate has', 'candidates have')} not been reviewed.`);
    const untreated = confirmed.filter((t) => !t.treatment).length;
    if (untreated) keyItems.push(`${untreated} confirmed ${plural(untreated, 'threat has', 'threats have')} no treatment decision.`);
    const unratedResidual = confirmed.filter((t) => t.treatment && !rating(m, t.residualLikelihood, t.residualImpact)).length;
    if (unratedResidual) keyItems.push(`${unratedResidual} treated ${plural(unratedResidual, 'threat has', 'threats have')} no residual rating.`);
    const unlabeled = a.flows.filter((f) => missingFlowLabels(f).length).length;
    if (unlabeled) keyItems.push(`${unlabeled} ${plural(unlabeled, 'flow is', 'flows are')} missing Section 7 labels.`);
    const failing = a.controls.filter((c) => verification(c) === 'failing').length;
    if (failing) keyItems.push(`${failing} ${plural(failing, 'control has', 'controls have')} a failing validation test.`);
    const unverified = a.controls.filter((c) => !['verified', 'not-applicable', 'failing'].includes(verification(c))).length;
    if (unverified) keyItems.push(`${unverified} ${plural(unverified, 'control is', 'controls are')} not yet verified by test evidence.`);
    const unsupported = confirmed.filter((t) => threatEvidence(a, t).unsupportedReduction).length;
    if (unsupported) keyItems.push(`${unsupported} ${plural(unsupported, 'threat has a residual rating', 'threats have residual ratings')} below inherent without a verified control.`);
    const dodOpen = definitionOfDone(a, tier.tier).filter((d) => !d.done).length;
    if (dodOpen) keyItems.push(`${dodOpen} of 8 Section 14 definition-of-done items are open.`);
    if (keyItems.length) {
      b.push({ t: 'h3', text: 'Key open items' });
      b.push({ t: 'list', items: keyItems });
    }
  }

  // ── Charter ──────────────────────────────────────────────────────────
  if (on('charter')) {
    b.push({ t: 'h1', text: section('charter') });
    b.push({ t: 'p', text: 'Stage 1 (initiate and classify), captured with the Appendix A system context and business profile questionnaire.', style: 'muted' });
    b.push({ t: 'kv', rows: intakeRows(a.intake) });
    b.push({ t: 'h3', text: `Assurance tier: ${TIER_LABEL[tier.tier]}` });
    b.push({ t: 'list', items: tier.reasons.length ? tier.reasons : ['No risk factors recorded.'] });
    const reach = autonomyReach(a);
    b.push({ t: 'p', text: `Autonomy / reach modifier (Section 9): ${m.ratingLabels[reach.level - 1]}. ${reach.reasons.join('; ')}.` });
  }

  // ── Architecture ─────────────────────────────────────────────────────
  if (on('architecture')) {
    b.push({ t: 'pagebreak' });
    b.push({ t: 'h1', text: section('architecture') });
    const d = renderArchitectureSvg(a);
    b.push({ t: 'diagram', ...d });
    b.push({
      t: 'p',
      text: 'Legend: dashed orange regions are trust boundaries; orange arrows cross a boundary; dashed purple arrows are control-plane flows; grey arrows are data-plane flows. Flow numbers (F#) refer to the flow table.',
      style: 'muted',
    });
    b.push({ t: 'h2', text: 'Component inventory' });
    b.push({
      t: 'table',
      head: ['Component', 'Type', 'Owner', 'Technology / provider', 'Env. / region', 'Class.', 'Identity', 'Boundary'],
      rows: a.components.map((c) => [
        { text: c.name, bold: true },
        getComponentType(c.type).label,
        dash(c.owner),
        dash(c.provider),
        dash(c.environment),
        dash(c.classification),
        dash(c.identity),
        dash((members.get(c.id) ?? []).map((id) => a.boundaries.find((x) => x.id === id)?.name).join(', ')),
      ]),
      widths: [2.4, 1.8, 1.3, 1.8, 1.3, 1.1, 1.6, 1.8],
      small: true,
    });
    b.push({ t: 'h2', text: 'Data and control flows' });
    b.push({
      t: 'table',
      head: ['#', 'From → To', 'What moves', 'Class.', 'Protocol', 'AuthN / AuthZ', 'Enc.', 'Origin / trust', 'Crosses'],
      rows: a.flows.map((f) => {
        const crossed = crossedBoundaries(f, members);
        return [
          nums.get(f.id)!,
          `${byId.get(f.source)?.name ?? '?'} → ${byId.get(f.target)?.name ?? '?'}${f.plane === 'control' ? ' (control)' : ''}`,
          dash(f.label),
          dash(f.dataClassification),
          dash(f.protocol),
          dash([f.authN, f.authZContext].filter(Boolean).join(' / ')),
          dash(f.encrypted),
          dash([ORIGIN.get(f.contentOrigin), TRUST.get(f.trustLevel)].filter(Boolean).join(' / ')),
          crossed.length ? { text: crossed.map((id) => a.boundaries.find((x) => x.id === id)?.name).join(', '), color: '#d9480f', bold: true } : '—',
        ];
      }),
      widths: [0.6, 2.6, 2, 1, 1, 1.6, 0.7, 1.6, 1.6],
      small: true,
    });
    if (a.boundaries.length) {
      b.push({ t: 'h2', text: 'Trust boundaries' });
      b.push({
        t: 'table',
        head: ['Boundary', 'Type', 'Contains', 'Crossing flows'],
        rows: a.boundaries.map((x) => [
          { text: x.name, bold: true },
          BOUNDARY_KIND_LABEL[x.kind],
          dash(a.components.filter((c) => members.get(c.id)?.includes(x.id)).map((c) => c.name).join(', ')),
          dash(a.flows.filter((f) => crossedBoundaries(f, members).includes(x.id)).map((f) => nums.get(f.id)).join(', ')),
        ]),
        widths: [2, 2, 4, 2],
      });
    }
  }

  // ── Discovery answers ────────────────────────────────────────────────
  if (on('answers')) {
    b.push({ t: 'pagebreak' });
    b.push({ t: 'h1', text: section('answers') });
    b.push({
      t: 'p',
      text: `Appendix B component questions and Appendix F workshop record. ${comp.questionsAnswered} of ${comp.questionsTotal} ${TIER_LABEL[tier.tier]}-tier questions answered; ${comp.unknowns} marked Unknown. "Unknown" is a tracked gap, not an implicit pass.`,
      style: 'muted',
    });
    const qById = new Map(QUESTIONS.map((q) => [q.id, q]));
    for (const c of a.components) {
      const qs = questionsForAreas(getComponentType(c.type).areas);
      const rows: Cell[][] = [];
      for (const q of qs) {
        const ans = a.answers[answerKey(c.id, q.id)];
        if (!ans && !(opts.includeUnanswered && q.tier <= tier.tier)) continue;
        rows.push([
          q.id,
          qById.get(q.id)!.text,
          ans ? { text: `${STATUS_LABEL[ans.status]}${classify(q, ans) === 'weak' ? ' (weak)' : ''}`, fill: FINDING_FILL[classify(q, ans)], bold: true } : { text: 'Unanswered', color: '#868e96' },
          dash([ans?.note, ans?.evidence ? `Evidence: ${ans.evidence}` : ''].filter(Boolean).join(' · ')),
          dash([ans?.owner, ans?.dueDate].filter(Boolean).join(' · ')),
        ]);
      }
      if (!rows.length) continue;
      b.push({ t: 'h3', text: `${c.name} (${getComponentType(c.type).label})` });
      b.push({ t: 'table', head: ['ID', 'Question', 'Answer', 'Explanation / evidence', 'Owner / due'], rows, widths: [0.7, 4, 1, 3, 1.4], small: true });
    }
  }

  // ── Objectives ───────────────────────────────────────────────────────
  if (on('objectives')) {
    b.push({ t: 'h1', text: section('objectives') });
    b.push({
      t: 'table',
      head: ['Objective', 'Statement'],
      rows: (Object.keys(OBJECTIVE_LABEL) as ObjectiveId[]).map((k) => [{ text: OBJECTIVE_LABEL[k], bold: true }, dash(a.objectives.statements[k])]),
      widths: [1.5, 6],
    });
    const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    b.push({ t: 'h3', text: 'Action authority' });
    b.push({
      t: 'kv',
      rows: [
        ['Must never do', dash(lines(a.objectives.neverDo).join('; '))],
        ['Only with approval', dash(lines(a.objectives.withApproval).join('; '))],
        ['May do autonomously', dash(lines(a.objectives.autonomous).join('; '))],
        ['Prohibited uses (intake)', dash(a.intake.prohibitedUses)],
      ],
    });
  }

  // ── Threats ──────────────────────────────────────────────────────────
  if (on('threats')) {
    b.push({ t: 'pagebreak' });
    b.push({ t: 'h1', text: section('threats') });
    b.push({
      t: 'p',
      text: `${confirmed.length} confirmed scenarios, ordered by inherent rating. Each follows the Appendix E worksheet, and the narrative uses the Section 9 format.`,
      style: 'muted',
    });
    for (const t of confirmed) {
      const comps = t.componentIds.map((id) => byId.get(id)?.name).filter(Boolean).join(', ');
      b.push({ t: 'h3', text: `${t.ref} · ${t.title}` });
      b.push({ t: 'p', text: narrative(t, a), style: 'narrative' });
      b.push({
        t: 'kv',
        rows: [
          ['Domain (Appendix C)', DOMAIN_NAME.get(t.domain) ?? t.domain],
          ['Component / flow', dash(comps) + (t.flowIds.length ? ` (${t.flowIds.map((id) => nums.get(id)).filter(Boolean).join(', ')})` : '')],
          ['Threat actor / source', dash(t.actor)],
          ['Asset and objectives', `${dash(t.asset)}${t.objectives.length ? ` · ${t.objectives.map((o) => OBJECTIVE_LABEL[o]).join(', ')}` : ''}`],
          ['Preconditions', dash(t.preconditions)],
          ['Attack path', dash(t.attackPath)],
          ['Impact', dash(t.impact)],
          ['Framework mappings', dash(frameworkLine(t))],
          ['Existing controls / evidence', dash([t.existingControls, t.evidence && `Evidence: ${t.evidence}`].filter(Boolean).join(' · '))],
          ['Inherent risk', ratingCell(a, t.inherentLikelihood, t.inherentImpact)],
          ['Rating basis', dash([`Likelihood ${levelText(m.likelihoodLabels, t.inherentLikelihood)}, impact ${levelText(m.impactLabels, t.inherentImpact)}.`, t.ratingRationale, ...t.signals].filter(Boolean).join(' '))],
          ['Treatment / patterns', dash([t.treatment && capital(t.treatment), t.patterns.map((p) => getPattern(p)?.name).filter(Boolean).join(', ')].filter(Boolean).join(' · '))],
          ['Requirements', dash(t.requirements)],
          ['Owner / due date', dash([t.owner, t.dueDate].filter(Boolean).join(' · '))],
          ['Validation / controls', dash([threatEvidence(a, t).controls.map((c) => `${c.ref} (${VERIFICATION_LABEL[verification(c)]})`).join(', '), t.validation].filter(Boolean).join(' · '))],
          ['Residual risk', ratingCell(a, t.residualLikelihood, t.residualImpact)],
          ['Residual rationale / acceptance', dash([t.residualRationale, t.riskOwner && `Risk owner: ${t.riskOwner}`, t.reviewDate && `Review by ${t.reviewDate}`].filter(Boolean).join(' · '))],
        ],
      });
    }
    if (!confirmed.length) b.push({ t: 'p', text: 'No threats have been confirmed yet.', style: 'callout' });
    if (opts.includeDismissed && dismissed.length) {
      b.push({ t: 'h2', text: 'Dismissed scenarios' });
      b.push({ t: 'table', head: ['ID', 'Threat', 'Reason for dismissal'], rows: dismissed.map((t) => [t.ref, t.title, dash(t.dismissReason)]), widths: [1, 4, 5] });
    }
    if (candidates.length) {
      b.push({ t: 'p', text: `${candidates.length} generated candidate scenarios have not been reviewed and are not included above.`, style: 'callout' });
    }
  }

  // ── Register ─────────────────────────────────────────────────────────
  if (on('register')) {
    b.push({ t: 'pagebreak' });
    b.push({ t: 'h1', text: section('register') });
    b.push({ t: 'h3', text: 'Inherent risk' });
    b.push(heatmapTable(a, confirmed.map((t) => ({ l: t.inherentLikelihood, i: t.inherentImpact }))));
    b.push({ t: 'h3', text: 'Residual risk' });
    b.push(heatmapTable(a, confirmed.map((t) => ({ l: t.residualLikelihood, i: t.residualImpact }))));
    b.push({ t: 'h3', text: 'Register' });
    b.push({
      t: 'table',
      head: ['ID', 'Threat', 'Inherent', 'Treatment', 'Owner / due', 'Residual', 'Risk owner / review'],
      rows: confirmed.map((t) => [
        t.ref,
        t.title,
        ratingCell(a, t.inherentLikelihood, t.inherentImpact),
        t.treatment ? capital(t.treatment) : { text: '—', color: '#a65f00' },
        dash([t.owner, t.dueDate].filter(Boolean).join(' · ')),
        ratingCell(a, t.residualLikelihood, t.residualImpact),
        dash([t.riskOwner, t.reviewDate].filter(Boolean).join(' · ')),
      ]),
      widths: [0.8, 4, 1.2, 1.2, 1.8, 1.2, 1.8],
      small: true,
    });
  }

  // ── Controls (Appendix G) ────────────────────────────────────────────
  if (on('controls')) {
    b.push({ t: 'pagebreak' });
    b.push({ t: 'h1', text: section('controls') });
    b.push({
      t: 'p',
      text: 'Stage 7 and Appendix G. "Evidence-backed status" is derived from recorded tests: a control counts as Verified only when every executed test passed and at least one negative test passed (Section 11).',
      style: 'muted',
    });
    if (!a.controls.length) b.push({ t: 'p', text: 'No controls have been recorded.', style: 'callout' });
    else {
      const VER_FILL: Record<string, string> = { verified: '#d3f9d8', failing: '#ffe3e3', blocked: '#fff3bf', 'no-negative': '#fff3bf', untested: '#f1f3f5', 'not-applicable': '#f8f9fa' };
      b.push({
        t: 'table',
        head: ['ID', 'Requirement / control', 'Owner', 'Status', 'Evidence / test', 'Residual gap / due date'],
        rows: a.controls.map((c) => {
          const v = verification(c);
          const run = c.tests.filter((x) => x.result);
          return [
            c.ref,
            `${c.requirement}${c.threatIds.length ? `\nAddresses: ${c.threatIds.map((id) => a.threats.find((t) => t.id === id)?.ref).filter(Boolean).join(', ')}` : ''}`,
            dash(c.owner),
            { text: `${CONTROL_STATUS_LABEL[c.status]}\n${VERIFICATION_LABEL[v]}`, fill: VER_FILL[v], bold: true },
            `${c.evidenceType ? capital(c.evidenceType) + ': ' : ''}${run.length}/${c.tests.length} tests run, ${run.filter((x) => x.result === 'pass').length} passed, ${c.tests.filter((x) => x.negative).length} negative`,
            dash([c.residualGap, c.dueDate && `Due ${c.dueDate}`].filter(Boolean).join(' · ')),
          ];
        }),
        widths: [0.8, 4, 1.3, 1.4, 2, 2],
        small: true,
      });
      const tests = a.controls.flatMap((c) => c.tests.map((x) => ({ c, x })));
      if (tests.length) {
        b.push({ t: 'h2', text: 'Validation test log' });
        const RES: Record<string, { fill: string; color?: string }> = { pass: { fill: '#2f9e44', color: '#ffffff' }, fail: { fill: '#c92a2a', color: '#ffffff' }, blocked: { fill: '#e8a317' } };
        b.push({
          t: 'table',
          head: ['Control', 'Method', 'Neg.', 'Expected / actual', 'Result', 'Evidence', 'Date / tester', 'Remediation'],
          rows: tests.map(({ c, x }) => [
            c.ref,
            dash(x.method),
            x.negative ? 'Yes' : 'No',
            dash([x.expected && `Expected: ${x.expected}`, x.actual && `Actual: ${x.actual}`].filter(Boolean).join('\n')),
            x.result ? { text: capital(x.result), fill: RES[x.result].fill, color: RES[x.result].color, bold: true } : { text: 'Not run', color: '#868e96' },
            dash(x.evidenceLocation),
            dash([x.testDate, x.tester].filter(Boolean).join(' · ')),
            dash(x.remediationOwner),
          ]),
          widths: [0.8, 3.2, 0.6, 2.4, 0.9, 1.6, 1.4, 1.2],
          small: true,
        });
      }
    }
  }

  // ── Coverage ─────────────────────────────────────────────────────────
  if (on('coverage')) {
    b.push({ t: 'h1', text: section('coverage') });
    b.push({ t: 'p', text: 'Traceability from framework items to confirmed threat scenarios. Only items referenced by at least one confirmed scenario are listed.', style: 'muted' });
    for (const c of CATALOGS) {
      const used = c.items.filter((item) => confirmed.some((t) => t.frameworks.some((f) => f.fw === c.id && f.id === item.id)));
      if (!used.length) continue;
      b.push({ t: 'h3', text: `${c.name} (${c.version})` });
      b.push({
        t: 'table',
        head: ['ID', 'Name', 'Threat scenarios'],
        rows: used.map((item) => [item.id, item.name, confirmed.filter((t) => t.frameworks.some((f) => f.fw === c.id && f.id === item.id)).map((t) => t.ref).join(', ')]),
        widths: [1.3, 4, 4],
        small: true,
      });
    }
    const unknownTags = confirmed.flatMap((t) => t.frameworks.filter((f) => !lookup(f.fw, f.id)).map((f) => `${t.ref}: ${getCatalog(f.fw)?.short ?? f.fw} ${f.id}`));
    if (unknownTags.length) b.push({ t: 'p', text: `Mappings not found in current catalogs: ${unknownTags.join('; ')}`, style: 'callout' });
  }

  // ── Gaps ─────────────────────────────────────────────────────────────
  if (on('gaps')) {
    b.push({ t: 'h1', text: section('gaps') });
    const unknown = gaps.filter((g) => g.kind === 'unknown');
    b.push({ t: 'h3', text: `Unknowns (${unknown.length})` });
    b.push(
      unknown.length
        ? {
            t: 'table',
            head: ['Component', 'Question', 'Owner', 'Resolve by'],
            rows: unknown.map((g) => [g.targetName, `${g.questionId} ${g.detail}`, g.owner ? g.owner : { text: 'Unassigned', color: '#a65f00' }, g.dueDate ? g.dueDate : { text: 'No date', color: '#a65f00' }]),
            widths: [2, 5, 1.5, 1.2],
            small: true,
          }
        : { t: 'p', text: 'None recorded.' },
    );
    const flowGaps = gaps.filter((g) => g.kind === 'boundary-crossing-unlabeled' || g.kind === 'flow-labels');
    if (flowGaps.length) {
      b.push({ t: 'h3', text: `Flows missing Section 7 labels (${flowGaps.length})` });
      b.push({
        t: 'table',
        head: ['Flow', 'Missing', 'Crosses boundary'],
        rows: flowGaps.map((g) => [`${nums.get(g.targetId) ?? ''} ${g.targetName}`, g.detail.replace('Missing: ', ''), g.kind === 'boundary-crossing-unlabeled' ? { text: 'Yes', color: '#d9480f', bold: true } : 'No']),
        widths: [4, 4, 1.2],
        small: true,
      });
    }
    const isolated = gaps.filter((g) => g.kind === 'isolated');
    if (isolated.length) b.push({ t: 'p', text: `Components with no flows: ${isolated.map((g) => g.targetName).join(', ')}.` });
    const unanswered = gaps.filter((g) => g.kind === 'unanswered').length;
    if (unanswered) b.push({ t: 'p', text: `${unanswered} ${TIER_LABEL[tier.tier]}-tier questions are unanswered.` });
  }

  // ── Definition of done (Section 14) ──────────────────────────────────
  if (on('dod')) {
    b.push({ t: 'h1', text: section('dod') });
    b.push({ t: 'p', text: 'Section 14 checklist, evaluated from the assessment record.', style: 'muted' });
    b.push({
      t: 'table',
      head: ['Criterion', 'Status', 'Detail'],
      rows: definitionOfDone(a, tier.tier).map((d) => [
        d.label,
        d.done ? { text: 'Done', fill: '#2f9e44', color: '#ffffff', bold: true } : { text: 'Open', fill: '#e8a317', bold: true },
        d.detail,
      ]),
      widths: [5, 0.9, 3.5],
    });
  }

  // ── Sign-off ─────────────────────────────────────────────────────────
  if (on('signoff')) {
    b.push({ t: 'h1', text: section('signoff') });
    const s = a.signOff;
    b.push({
      t: 'kv',
      rows: [
        ['Assessment ID / system name', `${dash(s.assessmentId)} / ${name}`],
        ['Business owner / accountable executive', dash(s.businessOwner || a.intake.owner)],
        ['Technical owner / architect', dash(s.technicalOwner)],
        ['Security reviewer / facilitator', dash(s.securityReviewer)],
        ['Privacy / Legal / Risk reviewers', dash(s.privacyLegalRisk)],
        ['Assessment date / version', `${dash(s.assessmentDate)} / ${dash(s.version)}`],
        ['Decision', s.decision ? { text: DECISION_LABEL[s.decision], bold: true } : 'Not yet decided'],
        ['Residual risk acceptance authority', dash(s.acceptanceAuthority)],
        ['Conditions, expiry and reassessment date', dash([s.conditions, s.reassessmentDate && `Reassess by ${s.reassessmentDate}`].filter(Boolean).join(' · '))],
        ['Evidence repository / reference', dash(s.evidenceRepository)],
        ['Review cadence / monitoring owner (Stage 9)', dash([s.reviewCadence, s.monitoringOwner && `Owner: ${s.monitoringOwner}`].filter(Boolean).join(' · '))],
        ['Reassessment triggers (Section 13)', dash(REASSESSMENT_TRIGGERS.filter((x) => s.triggers.includes(x.id)).map((x) => x.label).join('\n'))],
      ],
    });
    b.push({
      t: 'p',
      text: 'Approval confirms that the documented scope, architecture, risks, controls, evidence and residual-risk decision have been reviewed. It does not guarantee that the system is free of vulnerabilities or that model behavior is deterministic.',
      style: 'muted',
    });
  }
  return b;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

function capital(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
