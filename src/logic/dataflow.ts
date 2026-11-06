import type { Assessment, Component, DataClass, Flow } from '../model/types';
import { crossedBoundaries, membership } from './analysis';

/**
 * Data-sensitivity propagation (Section 7: label flows with data
 * classification). Explicit labels win; unlabeled flows inherit the
 * sensitivity of the data their source holds. Data sources with no label
 * are seeded from the intake's highest classification (marked inferred).
 */

export const CLASS_RANK: Record<DataClass, number> = { '': 0, public: 1, internal: 2, confidential: 3, restricted: 4 };
const BY_RANK: DataClass[] = ['', 'public', 'internal', 'confidential', 'restricted'];
export const CLASS_LABEL: Record<DataClass, string> = { '': 'Unclassified', public: 'Public', internal: 'Internal', confidential: 'Confidential', restricted: 'Restricted' };

const SOURCE_TYPES = new Set(['knowledge_source', 'database', 'object_storage', 'enterprise_api', 'feature_store']);
const EXTERNAL_KINDS = new Set(['app-provider', 'public-private']);
const EXTERNAL_TYPES = new Set(['third_party_service', 'browser_automation']);
const LOG_TYPES = new Set(['monitoring', 'cache', 'memory_store']);

export interface Held {
  level: DataClass;
  /** Where the level came from. */
  basis: 'labeled' | 'inherited' | 'intake' | 'none';
  /** Component the inherited level came from, if any. */
  from?: string;
}

export interface Carried {
  level: DataClass;
  inferred: boolean;
}

export interface DataModel {
  held: Map<string, Held>;
  carried: Map<string, Carried>;
}

const max = (a: DataClass, b: DataClass): DataClass => (CLASS_RANK[a] >= CLASS_RANK[b] ? a : b);

export function propagate(a: Assessment): DataModel {
  const held = new Map<string, Held>();
  for (const c of a.components) {
    if (c.classification) held.set(c.id, { level: c.classification, basis: 'labeled' });
    else if (SOURCE_TYPES.has(c.type) && a.intake.dataSensitivity) held.set(c.id, { level: a.intake.dataSensitivity, basis: 'intake' });
    else held.set(c.id, { level: '', basis: 'none' });
  }
  const carried = new Map<string, Carried>();
  const flowLevel = (f: Flow): Carried => (f.dataClassification ? { level: f.dataClassification, inferred: false } : { level: held.get(f.source)?.level ?? '', inferred: true });

  // Monotone fixed point: levels only rise, at most 4 steps per node.
  for (let i = 0; i < a.components.length * 4 + 4; i++) {
    let changed = false;
    for (const f of a.flows) {
      if (f.plane === 'control' && !f.dataClassification) continue; // control traffic does not carry business data unless labeled
      const lv = flowLevel(f);
      const dst = held.get(f.target);
      if (!dst) continue;
      // A component's label is what it is approved for; it still holds (and passes on)
      // anything more sensitive it receives. Mismatches are reported by dataExposures().
      if (CLASS_RANK[lv.level] > CLASS_RANK[dst.level]) {
        held.set(f.target, { level: lv.level, basis: 'inherited', from: f.source });
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const f of a.flows) carried.set(f.id, f.plane === 'control' && !f.dataClassification ? { level: '', inferred: true } : flowLevel(f));
  return { held, carried };
}

/** Highest sensitivity a component receives on its inbound flows. */
export function received(a: Assessment, dm: DataModel, componentId: string): DataClass {
  return a.flows.filter((f) => f.target === componentId).reduce<DataClass>((m, f) => max(m, dm.carried.get(f.id)?.level ?? ''), '');
}

export type ExposureKind = 'leaves-org' | 'unencrypted-crossing' | 'above-approval' | 'sensitive-in-logs';

export interface Exposure {
  kind: ExposureKind;
  level: DataClass;
  flowId?: string;
  componentId: string;
  detail: string;
}

export const EXPOSURE_LABEL: Record<ExposureKind, string> = {
  'leaves-org': 'Sensitive data leaves the organization',
  'unencrypted-crossing': 'Sensitive data crosses a trust boundary without confirmed encryption',
  'above-approval': 'Component receives data above its approved classification',
  'sensitive-in-logs': 'Sensitive data lands in logs, caches or memory',
};

const sensitive = (c: DataClass) => CLASS_RANK[c] >= CLASS_RANK.confidential;

export function dataExposures(a: Assessment, dm: DataModel = propagate(a)): Exposure[] {
  const out: Exposure[] = [];
  const byId = new Map(a.components.map((c) => [c.id, c]));
  const members = membership(a);
  const kinds = new Map(a.boundaries.map((b) => [b.id, b.kind]));
  const name = (id: string) => byId.get(id)?.name ?? '?';

  for (const f of a.flows) {
    const lv = dm.carried.get(f.id)?.level ?? '';
    if (!sensitive(lv)) continue;
    const crossed = crossedBoundaries(f, members);
    const dst = byId.get(f.target);
    const leaves = crossed.some((b) => EXTERNAL_KINDS.has(kinds.get(b) as string)) || (dst && EXTERNAL_TYPES.has(dst.type));
    if (leaves)
      out.push({ kind: 'leaves-org', level: lv, flowId: f.id, componentId: f.target, detail: `${CLASS_LABEL[lv]} data flows from ${name(f.source)} to ${name(f.target)} across an external boundary.` });
    if (crossed.length && f.encrypted !== 'yes')
      out.push({
        kind: 'unencrypted-crossing',
        level: lv,
        flowId: f.id,
        componentId: f.target,
        detail: `${CLASS_LABEL[lv]} data on ${name(f.source)} → ${name(f.target)}; encryption is ${f.encrypted || 'not recorded'}.`,
      });
  }
  for (const c of a.components) {
    const rec = received(a, dm, c.id);
    if (c.classification && CLASS_RANK[rec] > CLASS_RANK[c.classification])
      out.push({ kind: 'above-approval', level: rec, componentId: c.id, detail: `${c.name} is classified ${CLASS_LABEL[c.classification]} but receives ${CLASS_LABEL[rec]} data.` });
    if (LOG_TYPES.has(c.type) && sensitive(rec))
      out.push({ kind: 'sensitive-in-logs', level: rec, componentId: c.id, detail: `${c.name} receives ${CLASS_LABEL[rec]} data; confirm minimization, access control and retention.` });
  }
  return out;
}

export function heldLevel(dm: DataModel, c: Component): Held {
  return dm.held.get(c.id) ?? { level: '', basis: 'none' };
}

export { BY_RANK };
