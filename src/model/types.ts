// Core domain model for an assessment. See docs/PRODUCT_SPEC.md §3.

export const SCHEMA_VERSION = 4;

export type Tier = 1 | 2 | 3; // 1 = Light, 2 = Standard, 3 = Deep
export const TIER_LABEL: Record<Tier, string> = { 1: 'Light', 2: 'Standard', 3: 'Deep' };

export type Plane = 'data' | 'control';

/** Appendix B areas B1–B17. */
export type AreaId =
  | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7' | 'B8' | 'B9'
  | 'B10' | 'B11' | 'B12' | 'B13' | 'B14' | 'B15' | 'B16' | 'B17';

/** Section 7 architecture categories (palette grouping). */
export type Category =
  | 'actors'
  | 'entry'
  | 'application'
  | 'ai'
  | 'data'
  | 'capabilities'
  | 'control'
  | 'effects';

export type DataClass = '' | 'public' | 'internal' | 'confidential' | 'restricted';

export interface Component {
  id: string;
  type: string; // ComponentType id from the catalog
  name: string; // exact name, e.g. "Pinecone prod-kb"
  owner: string;
  provider: string; // technology / provider / version
  environment: string; // environment and region
  classification: DataClass;
  identity: string; // identity used / permissions
  plane: Plane;
  notes: string;
  position: { x: number; y: number };
}

export type ContentOrigin = '' | 'user' | 'retrieved' | 'model' | 'tool' | 'system';

export interface Flow {
  id: string;
  source: string;
  target: string;
  label: string; // what moves, e.g. "user prompt + attachments"
  dataClassification: DataClass;
  protocol: string;
  authN: string;
  authZContext: string;
  encrypted: '' | 'yes' | 'no' | 'unknown';
  contentOrigin: ContentOrigin;
  trustLevel: '' | 'trusted' | 'semi' | 'untrusted';
  plane: Plane;
}

export type BoundaryKind =
  | 'user-app'
  | 'app-provider'
  | 'tenant-tenant'
  | 'model-tool'
  | 'agent-agent'
  | 'app-enterprise'
  | 'control-data'
  | 'public-private'
  | 'other';

export interface TrustBoundary {
  id: string;
  name: string;
  kind: BoundaryKind;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export type AnswerStatus = 'yes' | 'no' | 'na' | 'unknown';

export interface Answer {
  status: AnswerStatus;
  note: string;
  evidence: string;
  owner: string;
  dueDate: string;
}

/** Answers keyed by `${targetId}::${questionId}`; intake-level answers use targetId "intake". */
export type AnswerMap = Record<string, Answer>;

export interface Intake {
  systemName: string;
  owner: string;
  purpose: string;
  outputs: string;
  failureImpact: string;
  prohibitedUses: string;
  systemTypes: string[];
  lifecycleStage: string;
  userPopulation: string[];
  exposure: '' | 'internal' | 'external-auth' | 'public';
  vulnerablePopulations: '' | 'yes' | 'no' | 'unknown';
  criticality: '' | 'advisory' | 'decision-support' | 'action-taking';
  regulatedImpact: string[];
  dataSensitivity: DataClass;
  dataTypes: string[];
  autonomy: '' | 'none' | 'suggest' | 'bounded' | 'broad';
  reversibility: '' | 'reversible' | 'partial' | 'irreversible';
  deployment: string[];
  regions: string;
  dependencies: string;
  operations: string;
  killSwitch: '' | 'yes' | 'no' | 'unknown';
  tierOverride: 0 | Tier;
}

/** Stage 3 – security objectives (Section 8). */
export type ObjectiveId = 'confidentiality' | 'integrity' | 'availability' | 'identity' | 'safety' | 'privacy' | 'transparency';

export interface Objectives {
  statements: Record<ObjectiveId, string>;
  /** Action authority (Stage 3): one action per line. */
  neverDo: string;
  withApproval: string;
  autonomous: string;
}

/** Four-point scale used for likelihood, impact and rating: 1 Low … 4 Critical. 0 = not rated. */
export type Level = 0 | 1 | 2 | 3 | 4;

export interface FrameworkRef {
  fw: string; // framework id, e.g. 'owasp-llm', 'atlas', 'attack', 'stride'
  id: string; // item id, e.g. 'LLM01', 'AML.T0051.001', 'T1190', 'S'
}

export type ThreatStatus = 'candidate' | 'accepted' | 'dismissed';
export type Treatment = '' | 'avoid' | 'mitigate' | 'transfer' | 'accept';

/** Appendix E threat scenario worksheet. */
export interface Threat {
  id: string;
  ref: string; // human-readable ID, e.g. "TS-007"
  ruleId: string | null; // generating rule, null for custom threats
  signature: string | null; // rule + subject; used to refresh without duplicating
  stale: boolean; // rule no longer matches the architecture
  edited: boolean; // analyst changed the scenario text; refresh will not overwrite it
  status: ThreatStatus;
  dismissReason: string;
  domain: string;
  title: string;
  componentIds: string[];
  flowIds: string[];
  actor: string;
  asset: string;
  objectives: ObjectiveId[];
  preconditions: string;
  attackPath: string;
  impact: string;
  frameworks: FrameworkRef[];
  existingControls: string;
  evidence: string;
  signals: string[]; // answers/intake facts that informed the suggested rating
  inherentLikelihood: Level;
  inherentImpact: Level;
  ratingRationale: string;
  ratingSuggested: boolean; // true until an analyst changes the rating
  treatment: Treatment;
  patterns: string[];
  requirements: string;
  owner: string;
  dueDate: string;
  validation: string;
  residualLikelihood: Level;
  residualImpact: Level;
  residualRationale: string;
  riskOwner: string;
  reviewDate: string;
}

/** Configurable risk matrix (Section 9: use the organization's approved matrix where one exists). */
export interface RiskMatrix {
  likelihoodLabels: [string, string, string, string];
  impactLabels: [string, string, string, string];
  ratingLabels: [string, string, string, string];
  /** grid[likelihood-1][impact-1] = rating level 1..4 */
  grid: Level[][];
}

/** Section 11 validation test: method, expected vs actual, evidence, tester. */
export type TestResult = '' | 'pass' | 'fail' | 'blocked';

export interface ValidationTest {
  id: string;
  method: string;
  negative: boolean; // proves unauthorized behavior is denied
  expected: string;
  actual: string;
  result: TestResult;
  evidenceLocation: string;
  testDate: string;
  tester: string;
  remediationOwner: string;
}

export type ControlStatus = 'planned' | 'in-progress' | 'implemented' | 'not-applicable';
export type EvidenceType = '' | 'architecture' | 'testing' | 'operational' | 'governance';

/** Appendix G control and evidence tracker row. */
export interface Control {
  id: string;
  ref: string; // e.g. "CTL-004"
  requirement: string;
  patternId: string | null;
  threatIds: string[];
  owner: string;
  status: ControlStatus;
  evidenceType: EvidenceType;
  tests: ValidationTest[];
  residualGap: string;
  dueDate: string;
}

export const CONTROL_STATUS_LABEL: Record<ControlStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In progress',
  implemented: 'Implemented',
  'not-applicable': 'Not applicable',
};

/** Section 13 lifecycle reassessment triggers. */
export const REASSESSMENT_TRIGGERS: { id: string; label: string }[] = [
  { id: 'model', label: 'New model, model version, provider, hosting region, endpoint, fine-tune or model-routing behavior' },
  { id: 'capability', label: 'New tool, plugin, connector, API, capability, permission, delegated agent or action type' },
  { id: 'data', label: 'New data source, classification, retrieval corpus, embedding/index change, training dataset or retention purpose' },
  { id: 'prompting', label: 'Change to system prompts, policies, orchestration, memory, context assembly, output handling or safety configuration' },
  { id: 'use', label: 'Change in user population, external exposure, tenant model, business purpose, scale, autonomy or decision impact' },
  { id: 'incident', label: 'Security incident, near miss, evaluation regression, drift, provider notification, vulnerability or material threat intelligence' },
  { id: 'obligation', label: 'Material change to applicable law, regulation, contract, internal policy or risk appetite' },
];

/** Appendix H – approval and sign-off record (Stage 8 decision). */
export type Decision = '' | 'approved' | 'approved-conditions' | 'hold' | 'redesign';

export interface SignOff {
  assessmentId: string;
  version: string;
  assessmentDate: string;
  businessOwner: string;
  technicalOwner: string;
  securityReviewer: string;
  privacyLegalRisk: string;
  decision: Decision;
  acceptanceAuthority: string;
  conditions: string;
  reassessmentDate: string;
  evidenceRepository: string;
  /** Stage 9 – maintain and re-open. */
  reviewCadence: string;
  monitoringOwner: string;
  triggers: string[];
}

export const DECISION_LABEL: Record<Exclude<Decision, ''>, string> = {
  approved: 'Approved',
  'approved-conditions': 'Approved with conditions',
  hold: 'Not approved / hold',
  redesign: 'Retire / redesign',
};

export const emptySignOff = (): SignOff => ({
  assessmentId: '',
  version: '1.0',
  assessmentDate: '',
  businessOwner: '',
  technicalOwner: '',
  securityReviewer: '',
  privacyLegalRisk: '',
  decision: '',
  acceptanceAuthority: '',
  conditions: '',
  reassessmentDate: '',
  evidenceRepository: '',
  reviewCadence: '',
  monitoringOwner: '',
  triggers: [],
});

export interface Settings {
  riskMatrix: RiskMatrix;
}

export interface Assessment {
  schemaVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  templateId: string | null;
  intake: Intake;
  components: Component[];
  flows: Flow[];
  boundaries: TrustBoundary[];
  answers: AnswerMap;
  objectives: Objectives;
  threats: Threat[];
  settings: Settings;
  signOff: SignOff;
  controls: Control[];
  /** Framework catalog versions this assessment is assessed against (spec §4a). */
  frameworkVersions: Record<string, string>;
}

export const emptyIntake = (): Intake => ({
  systemName: '',
  owner: '',
  purpose: '',
  outputs: '',
  failureImpact: '',
  prohibitedUses: '',
  systemTypes: [],
  lifecycleStage: '',
  userPopulation: [],
  exposure: '',
  vulnerablePopulations: '',
  criticality: '',
  regulatedImpact: [],
  dataSensitivity: '',
  dataTypes: [],
  autonomy: '',
  reversibility: '',
  deployment: [],
  regions: '',
  dependencies: '',
  operations: '',
  killSwitch: '',
  tierOverride: 0,
});

export const emptyAnswer = (): Answer => ({
  status: 'unknown',
  note: '',
  evidence: '',
  owner: '',
  dueDate: '',
});

export const answerKey = (targetId: string, questionId: string) => `${targetId}::${questionId}`;

export const OBJECTIVE_LABEL: Record<ObjectiveId, string> = {
  confidentiality: 'Confidentiality',
  integrity: 'Integrity',
  availability: 'Availability',
  identity: 'Identity & accountability',
  safety: 'Safety & human control',
  privacy: 'Privacy & lawful use',
  transparency: 'Transparency & explainability',
};

export const emptyObjectives = (): Objectives => ({
  statements: { confidentiality: '', integrity: '', availability: '', identity: '', safety: '', privacy: '', transparency: '' },
  neverDo: '',
  withApproval: '',
  autonomous: '',
});

export const defaultRiskMatrix = (): RiskMatrix => ({
  likelihoodLabels: ['Low', 'Medium', 'High', 'Critical'],
  impactLabels: ['Low', 'Medium', 'High', 'Critical'],
  ratingLabels: ['Low', 'Medium', 'High', 'Critical'],
  grid: [
    [1, 1, 2, 3],
    [1, 2, 3, 3],
    [2, 3, 3, 4],
    [2, 3, 4, 4],
  ],
});
