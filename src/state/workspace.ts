import { migrate } from '../io/file';
import type { Assessment } from '../model/types';
import { uid } from '../model/factory';

/**
 * Local workspace: every assessment is stored separately in browser storage,
 * with an index for the Home list and named version snapshots per assessment.
 * Storage is injectable so the logic can be unit-tested.
 */

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface IndexEntry {
  id: string;
  name: string;
  updatedAt: string;
  components: number;
  confirmedThreats: number;
  versions: number;
}

export interface Version {
  id: string;
  label: string;
  note: string;
  createdAt: string;
  data: Assessment;
}

const INDEX = 'ai-tm-index';
const A = (id: string) => `ai-tm-a:${id}`;
const V = (id: string) => `ai-tm-v:${id}`;

function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

let kv: KV = (() => {
  try {
    const s = window.localStorage;
    s.getItem('x');
    return s;
  } catch {
    return memoryKV();
  }
})();

export function setStorage(next: KV) {
  kv = next;
}

const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = kv.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

export class StorageFullError extends Error {}

const write = (k: string, v: unknown) => {
  try {
    kv.setItem(k, JSON.stringify(v));
  } catch (e) {
    throw new StorageFullError(`Browser storage is full (${e instanceof Error ? e.message : 'quota exceeded'}). Export or delete older assessments or versions.`);
  }
};

export function listAssessments(): IndexEntry[] {
  return read<IndexEntry[]>(INDEX, []).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
}

function entryFor(a: Assessment): IndexEntry {
  return {
    id: a.id,
    name: a.intake.systemName || 'Untitled assessment',
    updatedAt: a.updatedAt,
    components: a.components.length,
    confirmedThreats: a.threats.filter((t) => t.status === 'accepted').length,
    versions: listVersions(a.id).length,
  };
}

export function saveAssessment(a: Assessment) {
  write(A(a.id), a);
  const idx = read<IndexEntry[]>(INDEX, []).filter((e) => e.id !== a.id);
  write(INDEX, [...idx, entryFor(a)]);
}

export function loadAssessment(id: string): Assessment | null {
  const raw = read<unknown>(A(id), null);
  if (!raw) return null;
  try {
    return migrate(raw);
  } catch {
    return null;
  }
}

export function deleteAssessment(id: string) {
  kv.removeItem(A(id));
  kv.removeItem(V(id));
  write(
    INDEX,
    read<IndexEntry[]>(INDEX, []).filter((e) => e.id !== id),
  );
}

export function duplicateAssessment(id: string): Assessment | null {
  const a = loadAssessment(id);
  if (!a) return null;
  const now = new Date().toISOString();
  const copy: Assessment = { ...structuredClone(a), id: uid('a'), createdAt: now, updatedAt: now, intake: { ...a.intake, systemName: `${a.intake.systemName || 'Untitled'} (copy)` } };
  saveAssessment(copy);
  return copy;
}

export function listVersions(assessmentId: string): Version[] {
  return read<Version[]>(V(assessmentId), []);
}

export function saveVersion(a: Assessment, label: string, note = ''): Version {
  const v: Version = { id: uid('ver'), label: label.trim() || `Version ${listVersions(a.id).length + 1}`, note, createdAt: new Date().toISOString(), data: structuredClone(a) };
  write(V(a.id), [...listVersions(a.id), v]);
  saveAssessment(a);
  return v;
}

export function deleteVersion(assessmentId: string, versionId: string) {
  write(
    V(assessmentId),
    listVersions(assessmentId).filter((v) => v.id !== versionId),
  );
}

export function getVersion(assessmentId: string, versionId: string): Assessment | null {
  const v = listVersions(assessmentId).find((x) => x.id === versionId);
  return v ? migrate(structuredClone(v.data)) : null;
}

/** Approximate storage used by the workspace, in bytes. */
export function workspaceBytes(): number {
  let n = (kv.getItem(INDEX) ?? '').length;
  for (const e of read<IndexEntry[]>(INDEX, [])) n += (kv.getItem(A(e.id)) ?? '').length + (kv.getItem(V(e.id)) ?? '').length;
  return n * 2;
}

/** Opening a file never overwrites a different local copy of the same assessment. */
export function prepareImport(a: Assessment): Assessment {
  const existing = loadAssessment(a.id);
  if (!existing || JSON.stringify(existing) === JSON.stringify(a)) return a;
  return { ...a, id: uid('a'), intake: { ...a.intake, systemName: `${a.intake.systemName || 'Untitled'} (imported)` } };
}
