import { getComponentType } from '../library/catalog';
import { catalogVersions } from '../library/frameworks';
import {
  SCHEMA_VERSION,
  defaultRiskMatrix,
  emptyIntake,
  emptyObjectives,
  emptySignOff,
  type Assessment,
  type BoundaryKind,
  type Component,
  type Flow,
  type TrustBoundary,
} from './types';

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter.toString(36)}`;
}

export function newComponent(type: string, position = { x: 0, y: 0 }, overrides: Partial<Component> = {}): Component {
  const t = getComponentType(type);
  return {
    id: uid('c'),
    type,
    name: t.label,
    owner: '',
    provider: '',
    environment: '',
    classification: '',
    identity: '',
    plane: t.plane,
    notes: '',
    position,
    ...overrides,
  };
}

export function newFlow(source: string, target: string, overrides: Partial<Flow> = {}): Flow {
  return {
    id: uid('f'),
    source,
    target,
    label: '',
    dataClassification: '',
    protocol: '',
    authN: '',
    authZContext: '',
    encrypted: '',
    contentOrigin: '',
    trustLevel: '',
    plane: 'data',
    ...overrides,
  };
}

export function newBoundary(
  name: string,
  kind: BoundaryKind,
  rect: { x: number; y: number; width: number; height: number },
): TrustBoundary {
  return { id: uid('b'), name, kind, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height };
}

/** Framework catalog versions recorded on each assessment (spec §4a). */
export const DEFAULT_FRAMEWORK_VERSIONS: Record<string, string> = catalogVersions();

export function newAssessment(): Assessment {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('a'),
    createdAt: now,
    updatedAt: now,
    templateId: null,
    intake: emptyIntake(),
    components: [],
    flows: [],
    boundaries: [],
    answers: {},
    objectives: emptyObjectives(),
    threats: [],
    settings: { riskMatrix: defaultRiskMatrix() },
    signOff: emptySignOff(),
    frameworkVersions: catalogVersions(),
  };
}
