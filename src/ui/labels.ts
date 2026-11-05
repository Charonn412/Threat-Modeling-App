import type { Option } from '../library/intake';
import type { BoundaryKind } from '../model/types';

export const BOUNDARY_KIND_LABEL: Record<BoundaryKind, string> = {
  'user-app': 'User ↔ app',
  'app-provider': 'App ↔ model provider',
  'tenant-tenant': 'Tenant ↔ tenant',
  'model-tool': 'Model ↔ tool',
  'agent-agent': 'Agent ↔ agent',
  'app-enterprise': 'App ↔ enterprise system',
  'control-data': 'Control plane ↔ data plane',
  'public-private': 'Public ↔ private network',
  other: 'Other',
};

export const BOUNDARY_KIND_OPTIONS: Option[] = Object.entries(BOUNDARY_KIND_LABEL).map(([value, label]) => ({ value, label }));

export const CONTENT_ORIGIN_OPTIONS: Option[] = [
  { value: 'user', label: 'User-controlled' },
  { value: 'retrieved', label: 'Retrieved' },
  { value: 'model', label: 'Model-generated' },
  { value: 'tool', label: 'Tool-returned' },
  { value: 'system', label: 'System / configuration' },
];

export const TRUST_OPTIONS: Option[] = [
  { value: 'trusted', label: 'Trusted' },
  { value: 'semi', label: 'Semi-trusted' },
  { value: 'untrusted', label: 'Untrusted' },
];

export const YNU_OPTIONS: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
];

export const PLANE_OPTIONS: Option[] = [
  { value: 'data', label: 'Data plane' },
  { value: 'control', label: 'Control plane' },
];
