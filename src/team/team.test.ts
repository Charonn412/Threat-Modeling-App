import type { Session } from '@supabase/supabase-js';
import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { useStore } from '../state/store';
import { listAssessments, setStorage } from '../state/workspace';
import type { Assessment } from '../model/types';
import { ConflictError, type Role, type TeamApi } from './api';
import { useTeam } from './store';

/** In-memory stand-in for the Supabase-backed API with the same revision semantics as save_assessment(). */
class FakeApi {
  rows = new Map<string, { data: Assessment; revision: number }>();
  roles = new Map<string, Role>();
  saves = 0;
  async list() {
    return [...this.rows].map(([id, r]) => ({ id, name: r.data.intake.systemName, revision: r.revision, updated_at: '', role: this.roles.get(id) ?? 'viewer' }));
  }
  async share(a: Assessment) {
    this.rows.set(a.id, { data: structuredClone(a), revision: 1 });
    this.roles.set(a.id, 'owner');
    return 1;
  }
  async load(id: string) {
    const r = this.rows.get(id)!;
    return { assessment: structuredClone(r.data), revision: r.revision, role: this.roles.get(id) ?? 'viewer' };
  }
  async save(a: Assessment, expected: number) {
    this.saves += 1;
    const r = this.rows.get(a.id)!;
    if (r.revision !== expected) throw new ConflictError('Someone else saved this assessment since you opened it.');
    r.data = structuredClone(a);
    r.revision += 1;
    return r.revision;
  }
  /** Simulates a teammate saving from another browser. */
  theirSave(id: string, mutate: (a: Assessment) => void) {
    const r = this.rows.get(id)!;
    mutate(r.data);
    r.revision += 1;
  }
}

const session = { user: { id: 'u1', email: 'me@example.com' } } as unknown as Session;
let api: FakeApi;

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

beforeEach(() => {
  vi.useFakeTimers();
  setStorage(mem());
  api = new FakeApi();
  useTeam.setState({ cloud: null, list: [] });
  useTeam.getState()._setApi(api as unknown as TeamApi, session);
  useStore.getState().load(instantiateTemplate(TEMPLATES[0]));
});
afterEach(() => vi.useRealTimers());

const edit = (name: string) => useStore.getState().updateIntake({ systemName: name });
const flush = async () => {
  await vi.advanceTimersByTimeAsync(2000);
};

describe('team sync', () => {
  it('shares, then saves edits after a debounce with increasing revisions', async () => {
    await useTeam.getState().shareCurrent();
    expect(useTeam.getState().cloud).toMatchObject({ revision: 1, role: 'owner', status: 'saved' });
    edit('A');
    edit('AB');
    expect(useTeam.getState().cloud?.status).toBe('dirty');
    await flush();
    expect(api.saves).toBe(1); // debounced: two edits, one save
    expect(useTeam.getState().cloud).toMatchObject({ revision: 2, status: 'saved' });
    expect(api.rows.get(useStore.getState().assessment!.id)!.data.intake.systemName).toBe('AB');
  });

  it('detects a conflict instead of overwriting a teammate', async () => {
    await useTeam.getState().shareCurrent();
    const id = useStore.getState().assessment!.id;
    api.theirSave(id, (a) => (a.intake.purpose = 'theirs'));
    edit('mine');
    await flush();
    expect(useTeam.getState().cloud?.status).toBe('conflict');
    expect(api.rows.get(id)!.data.intake.purpose).toBe('theirs');
    edit('more mine');
    await flush();
    expect(api.saves).toBe(1); // no retries while in conflict
  });

  it('resolving by loading theirs keeps my edits as a local copy', async () => {
    await useTeam.getState().shareCurrent();
    const id = useStore.getState().assessment!.id;
    api.theirSave(id, (a) => (a.intake.purpose = 'theirs'));
    edit('mine');
    await flush();
    await useTeam.getState().resolveKeepTheirs();
    expect(useStore.getState().assessment!.intake.purpose).toBe('theirs');
    expect(useTeam.getState().cloud).toMatchObject({ status: 'saved', revision: 2 }); // theirs; my rejected save never incremented it
    expect(listAssessments().some((e) => e.name === 'mine (my unsaved edits)')).toBe(true);
  });

  it('resolving by overwriting saves my version on top of the latest revision', async () => {
    await useTeam.getState().shareCurrent();
    const id = useStore.getState().assessment!.id;
    api.theirSave(id, (a) => (a.intake.purpose = 'theirs'));
    edit('mine');
    await flush();
    await useTeam.getState().resolveOverwrite();
    expect(useTeam.getState().cloud?.status).toBe('saved');
    expect(api.rows.get(id)!.data.intake.systemName).toBe('mine');
  });

  it('never saves for read-only roles, and unlinks when another assessment is opened', async () => {
    const a = useStore.getState().assessment!;
    await api.share(a);
    api.roles.set(a.id, 'reviewer');
    await useTeam.getState().openCloud(a.id);
    expect(useTeam.getState().cloud?.status).toBe('readonly');
    edit('local only');
    await flush();
    expect(api.saves).toBe(0);
    useStore.getState().load(instantiateTemplate(TEMPLATES[1]));
    expect(useTeam.getState().cloud).toBeNull();
  });
});
