// Core domain model for an assessment. See docs/PRODUCT_SPEC.md §3.

export const SCHEMA_VERSION = 1;

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
