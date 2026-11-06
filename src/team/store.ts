import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { canEdit, ConflictError, TeamApi, type Role, type TeamAssessmentRow } from './api';
import { useStore } from '../state/store';
import { saveAssessment } from '../state/workspace';
import { uid } from '../model/factory';
import type { Assessment } from '../model/types';

/**
 * Team workspace state: connection settings, sign-in session, and the cloud
 * link for the open assessment (revision, your role, save status).
 * Cloud saves are debounced and use optimistic concurrency; on conflict the
 * user chooses, and nothing is ever silently overwritten.
 */

export interface TeamConfig {
  url: string;
  key: string;
}

export type CloudStatus = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error' | 'readonly';

export interface CloudLink {
  id: string;
  revision: number;
  role: Role;
  status: CloudStatus;
  error?: string;
}

interface TeamState {
  config: TeamConfig | null;
  api: TeamApi | null;
  session: Session | null;
  cloud: CloudLink | null;
  list: TeamAssessmentRow[];
  busy: boolean;
  configure(c: TeamConfig | null): Promise<void>;
  refreshList(): Promise<void>;
  openCloud(id: string): Promise<void>;
  shareCurrent(): Promise<void>;
  saveNow(): Promise<void>;
  resolveKeepTheirs(): Promise<void>;
  resolveOverwrite(): Promise<void>;
  /** For tests: inject an API implementation. */
  _setApi(api: TeamApi | null, session?: Session | null): void;
}

const CONFIG_KEY = 'ai-tm-team-config';

function readConfig(): TeamConfig | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY };
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as TeamConfig) : null;
  } catch {
    return null;
  }
}

async function makeApi(c: TeamConfig): Promise<TeamApi> {
  const { createClient } = await import('@supabase/supabase-js');
  return new TeamApi(createClient(c.url, c.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } }));
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loadingFromCloud = false;
let stopAuth: (() => void) | null = null;

export const useTeam = create<TeamState>()((set, get) => ({
  config: null,
  api: null,
  session: null,
  cloud: null,
  list: [],
  busy: false,

  configure: async (c) => {
    stopAuth?.();
    stopAuth = null;
    try {
      if (c) window.localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
      else window.localStorage.removeItem(CONFIG_KEY);
    } catch {
      /* storage unavailable: config lasts for this session only */
    }
    if (!c) {
      set({ config: null, api: null, session: null, cloud: null, list: [] });
      return;
    }
    const api = await makeApi(c);
    const session = await api.session();
    set({ config: c, api, session });
    stopAuth = api.onAuthChange((s) => {
      set({ session: s });
      if (s) void get().refreshList();
      else set({ list: [], cloud: null });
    });
    if (session) await get().refreshList();
  },

  refreshList: async () => {
    const { api, session } = get();
    if (!api || !session) return;
    set({ list: await api.list(session.user.id) });
  },

  openCloud: async (id) => {
    const { api, session } = get();
    if (!api || !session) return;
    set({ busy: true });
    try {
      const r = await api.load(id, session.user.id);
      set({ cloud: { id, revision: r.revision, role: r.role, status: canEdit(r.role) ? 'saved' : 'readonly' } });
      // Loading from the cloud is not a local edit, even when the same assessment is re-opened.
      loadingFromCloud = true;
      try {
        useStore.getState().load(r.assessment);
      } finally {
        loadingFromCloud = false;
      }
    } finally {
      set({ busy: false });
    }
  },

  shareCurrent: async () => {
    const { api, session } = get();
    const a = useStore.getState().assessment;
    if (!api || !session || !a) return;
    set({ busy: true });
    try {
      const revision = await api.share(a);
      set({ cloud: { id: a.id, revision, role: 'owner', status: 'saved' } });
      await get().refreshList();
    } finally {
      set({ busy: false });
    }
  },

  saveNow: async () => {
    const { api, cloud } = get();
    const a = useStore.getState().assessment;
    if (!api || !cloud || !a || a.id !== cloud.id || !canEdit(cloud.role)) return;
    if (cloud.status === 'conflict' || cloud.status === 'saving') return;
    set({ cloud: { ...cloud, status: 'saving', error: undefined } });
    try {
      const revision = await api.save(a, cloud.revision);
      const now = get().cloud;
      // Edits made while saving keep the link dirty so they are saved next.
      const stillSame = useStore.getState().assessment === a;
      if (now) set({ cloud: { ...now, revision, status: stillSame ? 'saved' : 'dirty' } });
      if (!stillSame) schedule();
    } catch (e) {
      const now = get().cloud;
      if (!now) return;
      if (e instanceof ConflictError) set({ cloud: { ...now, status: 'conflict', error: e.message } });
      else set({ cloud: { ...now, status: 'error', error: e instanceof Error ? e.message : String(e) } });
    }
  },

  /** Load the team's latest version; your unsaved edits are kept as a separate local assessment. */
  resolveKeepTheirs: async () => {
    const { cloud } = get();
    const mine = useStore.getState().assessment;
    if (!cloud) return;
    if (mine) {
      const copy: Assessment = { ...structuredClone(mine), id: uid('a'), intake: { ...mine.intake, systemName: `${mine.intake.systemName || 'Untitled'} (my unsaved edits)` } };
      saveAssessment(copy);
    }
    await get().openCloud(cloud.id);
  },

  /** Replace the team copy with yours (owners and editors only). */
  resolveOverwrite: async () => {
    const { api, session, cloud } = get();
    if (!api || !session || !cloud) return;
    const latest = await api.load(cloud.id, session.user.id);
    set({ cloud: { ...cloud, revision: latest.revision, status: 'dirty', error: undefined } });
    await get().saveNow();
  },

  _setApi: (api, session = null) => set({ api, session, config: api ? { url: 'test', key: 'test' } : null }),
}));

function schedule(delay = 1500) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void useTeam.getState().saveNow(), delay);
}

// Keep the cloud link in sync with the open assessment.
useStore.subscribe((s, prev) => {
  const team = useTeam.getState();
  const cloud = team.cloud;
  if (!cloud) return;
  if (!s.assessment || s.assessment.id !== cloud.id) {
    // Another assessment was opened: this one is no longer linked.
    if (saveTimer) clearTimeout(saveTimer);
    useTeam.setState({ cloud: null });
    return;
  }
  if (loadingFromCloud || s.assessment === prev.assessment || prev.assessment?.id !== s.assessment.id) return;
  if (!canEdit(cloud.role) || cloud.status === 'conflict') return;
  if (cloud.status !== 'saving') useTeam.setState({ cloud: { ...cloud, status: 'dirty' } });
  schedule();
});

/** Initialise from saved settings (call once at startup). */
export function initTeam() {
  const c = readConfig();
  if (c) void useTeam.getState().configure(c).catch(() => undefined);
}
