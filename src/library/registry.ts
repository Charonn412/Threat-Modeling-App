import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BUILTIN_COMPONENT_TYPES, _setComponentTypes, COMPONENT_TYPES, type ComponentType } from './catalog';
import { BUILTIN_QUESTIONS, _setQuestions, QUESTIONS, AREAS, type Question } from './questions';
import { BUILTIN_THREAT_RULES, _setThreatRules, THREAT_RULES, DOMAINS, type Cond, type ThreatRule } from './threatRules';
import { BUILTIN_LEXICON, _setLexicon, LEXICON, type LexiconEntry } from './lexicon';
import { BUILTIN_PATTERNS, _setPatterns, PATTERNS, type Pattern } from './patterns';
import { BUILTIN_TEMPLATES, _setTemplates, TEMPLATES, type Template } from './templates';
import { BUILTIN_CATALOGS, _setCatalogs, CATALOGS, type Catalog } from './frameworks';

/**
 * Library editing (spec §4, §8). Built-in content ships with the app; the
 * user's edits are an overlay ("library pack") stored in this browser and
 * exportable as JSON. Overlays keep built-ins upgradeable: an override
 * replaces one built-in item, a disabled id hides one, custom items are added.
 */

export interface Overlay<T> {
  custom: T[];
  overrides: Record<string, T>;
  disabled: string[];
}

export type CollectionId = 'components' | 'questions' | 'rules' | 'lexicon' | 'patterns' | 'templates';

export interface LibraryPack {
  kind: 'ai-threat-model-library';
  schemaVersion: 1;
  name: string;
  updatedAt: string;
  components: Overlay<ComponentType>;
  questions: Overlay<Question>;
  rules: Overlay<ThreatRule>;
  lexicon: Overlay<LexiconEntry>;
  patterns: Overlay<Pattern>;
  templates: Overlay<Template>;
  /** Replacement (same id as a built-in) or additional framework catalogs. */
  catalogs: Record<string, Catalog>;
}

type ItemOf<C extends CollectionId> = C extends 'components'
  ? ComponentType
  : C extends 'questions'
    ? Question
    : C extends 'rules'
      ? ThreatRule
      : C extends 'lexicon'
        ? LexiconEntry
        : C extends 'patterns'
          ? Pattern
          : Template;

const emptyOverlay = <T,>(): Overlay<T> => ({ custom: [], overrides: {}, disabled: [] });

export const emptyPack = (): LibraryPack => ({
  kind: 'ai-threat-model-library',
  schemaVersion: 1,
  name: 'My library',
  updatedAt: new Date().toISOString(),
  components: emptyOverlay(),
  questions: emptyOverlay(),
  rules: emptyOverlay(),
  lexicon: emptyOverlay(),
  patterns: emptyOverlay(),
  templates: emptyOverlay(),
  catalogs: {},
});

export const BUILTINS: { [C in CollectionId]: ItemOf<C>[] } = {
  components: BUILTIN_COMPONENT_TYPES,
  questions: BUILTIN_QUESTIONS,
  rules: BUILTIN_THREAT_RULES,
  lexicon: BUILTIN_LEXICON,
  patterns: BUILTIN_PATTERNS,
  templates: BUILTIN_TEMPLATES,
};

export function mergeOverlay<T extends { id: string }>(builtins: T[], o: Overlay<T>): T[] {
  const disabled = new Set(o.disabled);
  const builtinIds = new Set(builtins.map((b) => b.id));
  return [
    ...builtins.filter((b) => !disabled.has(b.id)).map((b) => o.overrides[b.id] ?? b),
    ...o.custom.filter((c) => !builtinIds.has(c.id) && !disabled.has(c.id)),
  ];
}

export function mergeCatalogs(pack: LibraryPack): Catalog[] {
  const builtinIds = new Set(BUILTIN_CATALOGS.map((c) => c.id));
  return [...BUILTIN_CATALOGS.map((c) => pack.catalogs[c.id] ?? c), ...Object.values(pack.catalogs).filter((c) => !builtinIds.has(c.id))];
}

/** Pushes the merged library into the live collections every module reads. */
export function applyPack(pack: LibraryPack) {
  _setComponentTypes(mergeOverlay(BUILTIN_COMPONENT_TYPES, pack.components));
  _setQuestions(mergeOverlay(BUILTIN_QUESTIONS, pack.questions));
  _setThreatRules(mergeOverlay(BUILTIN_THREAT_RULES, pack.rules));
  _setLexicon(mergeOverlay(BUILTIN_LEXICON, pack.lexicon));
  _setPatterns(mergeOverlay(BUILTIN_PATTERNS, pack.patterns));
  _setTemplates(mergeOverlay(BUILTIN_TEMPLATES, pack.templates));
  _setCatalogs(mergeCatalogs(pack));
}

export type ItemState = 'builtin' | 'modified' | 'custom' | 'disabled';

export function itemState(pack: LibraryPack, c: CollectionId, id: string): ItemState {
  const o = pack[c] as Overlay<{ id: string }>;
  if (o.disabled.includes(id)) return 'disabled';
  if (o.overrides[id]) return 'modified';
  if ((BUILTINS[c] as { id: string }[]).some((b) => b.id === id)) return 'builtin';
  return 'custom';
}

/** All items for an editor list, including disabled ones. */
export function editorItems<C extends CollectionId>(pack: LibraryPack, c: C): { item: ItemOf<C>; state: ItemState }[] {
  const o = pack[c] as unknown as Overlay<ItemOf<C>>;
  const builtins = BUILTINS[c] as ItemOf<C>[];
  const builtinIds = new Set(builtins.map((b) => b.id));
  return [
    ...builtins.map((b) => ({ item: o.overrides[b.id] ?? b, state: itemState(pack, c, b.id) })),
    ...o.custom.filter((x) => !builtinIds.has(x.id)).map((x) => ({ item: x, state: (o.disabled.includes(x.id) ? 'disabled' : 'custom') as ItemState })),
  ];
}

// ── Validation ────────────────────────────────────────────────────────────

export interface Issue {
  collection: CollectionId | 'catalogs';
  id: string;
  message: string;
}

function condTypes(c: Cond): string[] {
  switch (c.kind) {
    case 'type':
    case 'has':
    case 'lacks':
    case 'connected':
      return c.types;
    case 'flow':
      return [...(c.source ?? []), ...(c.target ?? [])];
    case 'any':
    case 'all':
      return c.conds.flatMap(condTypes);
    case 'not':
      return condTypes(c.cond);
    default:
      return [];
  }
}

const COND_KINDS = new Set(['type', 'flow', 'has', 'lacks', 'connected', 'intake', 'answer', 'data', 'dataAboveApproval', 'any', 'all', 'not']);

export function validateConds(conds: unknown): string | null {
  if (!Array.isArray(conds)) return 'Conditions must be a JSON array.';
  const check = (c: unknown, path: string): string | null => {
    if (!c || typeof c !== 'object') return `${path}: must be an object`;
    const k = (c as { kind?: string }).kind;
    if (!k || !COND_KINDS.has(k)) return `${path}: unknown kind "${k}" (use ${[...COND_KINDS].join(', ')})`;
    const o = c as Record<string, unknown>;
    if (['type', 'has', 'lacks', 'connected'].includes(k) && !Array.isArray(o.types)) return `${path}: "${k}" needs a "types" array`;
    if (k === 'connected' && !['in', 'out', 'any'].includes(String(o.direction))) return `${path}: "connected" needs direction in|out|any`;
    if (k === 'intake' && (typeof o.field !== 'string' || !Array.isArray(o.in))) return `${path}: "intake" needs "field" and "in"`;
    if (k === 'answer' && (typeof o.q !== 'string' || !Array.isArray(o.in))) return `${path}: "answer" needs "q" and "in"`;
    if (k === 'data' && !['public', 'internal', 'confidential', 'restricted'].includes(String(o.min))) return `${path}: "data" needs "min": public|internal|confidential|restricted`;
    if (k === 'any' || k === 'all') {
      if (!Array.isArray(o.conds)) return `${path}: "${k}" needs a "conds" array`;
      for (let i = 0; i < o.conds.length; i++) {
        const e = check(o.conds[i], `${path}.conds[${i}]`);
        if (e) return e;
      }
    }
    if (k === 'not') return check(o.cond, `${path}.cond`);
    return null;
  };
  for (let i = 0; i < conds.length; i++) {
    const e = check(conds[i], `[${i}]`);
    if (e) return e;
  }
  return null;
}

/** Checks the active library for references that no longer resolve. */
export function libraryHealth(): Issue[] {
  const issues: Issue[] = [];
  const types = new Set(COMPONENT_TYPES.map((t) => t.id));
  const qids = new Set(QUESTIONS.map((q) => q.id));
  const pids = new Set(PATTERNS.map((p) => p.id));
  const areas = new Set(AREAS.map((a) => a.id));
  const domains = new Set(DOMAINS.map((d) => d.id));
  const items = new Map(CATALOGS.map((c) => [c.id, new Set(c.items.map((i) => i.id))]));
  const dupes = (c: CollectionId, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.id)) issues.push({ collection: c, id: x.id, message: 'Duplicate ID' });
      seen.add(x.id);
    }
  };
  dupes('components', COMPONENT_TYPES);
  dupes('questions', QUESTIONS);
  dupes('rules', THREAT_RULES);
  dupes('lexicon', LEXICON);
  dupes('patterns', PATTERNS);

  for (const t of COMPONENT_TYPES) for (const a of t.areas) if (!areas.has(a)) issues.push({ collection: 'components', id: t.id, message: `Unknown area ${a}` });
  for (const q of QUESTIONS) {
    if (!areas.has(q.area)) issues.push({ collection: 'questions', id: q.id, message: `Unknown area ${q.area}` });
    if (q.suggest && !types.has(q.suggest.addType)) issues.push({ collection: 'questions', id: q.id, message: `Suggestion adds unknown component type "${q.suggest.addType}"` });
  }
  for (const r of THREAT_RULES) {
    if (!domains.has(r.domain)) issues.push({ collection: 'rules', id: r.id, message: `Unknown domain "${r.domain}"` });
    const ce = validateConds(r.when);
    if (ce) issues.push({ collection: 'rules', id: r.id, message: `Conditions: ${ce}` });
    else for (const t of new Set([...r.when.flatMap(condTypes), ...(r.involves ?? [])])) if (!types.has(t)) issues.push({ collection: 'rules', id: r.id, message: `Unknown component type "${t}"` });
    for (const tag of r.tags) {
      const set = items.get(tag.fw);
      if (!set) issues.push({ collection: 'rules', id: r.id, message: `Unknown framework "${tag.fw}"` });
      else if (!set.has(tag.id)) issues.push({ collection: 'rules', id: r.id, message: `${tag.fw} ${tag.id} is not in the current catalog` });
    }
    for (const p of r.patterns) if (!pids.has(p)) issues.push({ collection: 'rules', id: r.id, message: `Unknown pattern "${p}"` });
    for (const s of r.signals ?? []) if (!qids.has(s.q)) issues.push({ collection: 'rules', id: r.id, message: `Signal references unknown question ${s.q}` });
  }
  for (const e of LEXICON) {
    if (e.type && !types.has(e.type)) issues.push({ collection: 'lexicon', id: e.id, message: `Unknown component type "${e.type}"` });
    for (const p of e.patterns) {
      try {
        new RegExp(p, 'i');
      } catch {
        issues.push({ collection: 'lexicon', id: e.id, message: `Invalid pattern: ${p}` });
      }
    }
  }
  for (const t of TEMPLATES) for (const c of t.components) if (!types.has(c.type)) issues.push({ collection: 'templates', id: t.id, message: `Unknown component type "${c.type}"` });
  return issues;
}

// ── Pack import/export ────────────────────────────────────────────────────

export function parsePack(text: string): LibraryPack {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const p = data as Partial<LibraryPack>;
  if (!p || p.kind !== 'ai-threat-model-library') throw new Error('Not a library pack (expected kind "ai-threat-model-library").');
  if ((p.schemaVersion ?? 1) > 1) throw new Error('This library pack was made by a newer version of the app.');
  const ov = <T,>(o: Partial<Overlay<T>> | undefined): Overlay<T> => ({
    custom: Array.isArray(o?.custom) ? o!.custom : [],
    overrides: o?.overrides && typeof o.overrides === 'object' ? o.overrides : {},
    disabled: Array.isArray(o?.disabled) ? o!.disabled : [],
  });
  return {
    ...emptyPack(),
    name: typeof p.name === 'string' ? p.name : 'Imported library',
    updatedAt: p.updatedAt ?? new Date().toISOString(),
    components: ov(p.components),
    questions: ov(p.questions),
    rules: ov(p.rules),
    lexicon: ov(p.lexicon),
    patterns: ov(p.patterns),
    templates: ov(p.templates),
    catalogs: p.catalogs && typeof p.catalogs === 'object' ? p.catalogs : {},
  };
}

export function packStats(pack: LibraryPack) {
  const cols: CollectionId[] = ['components', 'questions', 'rules', 'lexicon', 'patterns', 'templates'];
  let changes = 0;
  for (const c of cols) {
    const o = pack[c] as Overlay<unknown>;
    changes += o.custom.length + Object.keys(o.overrides).length + o.disabled.length;
  }
  return { changes: changes + Object.keys(pack.catalogs).length };
}

// ── Store ─────────────────────────────────────────────────────────────────

interface LibraryState {
  pack: LibraryPack;
  /** Bumped on every change so views re-render with the new library. */
  version: number;
  upsert<C extends CollectionId>(c: C, item: ItemOf<C>, previousId?: string): void;
  disable(c: CollectionId, id: string): void;
  restore(c: CollectionId, id: string): void;
  removeCustom(c: CollectionId, id: string): void;
  setCatalog(cat: Catalog): void;
  resetCatalog(id: string): void;
  replacePack(p: LibraryPack): void;
  resetAll(): void;
}

const isBuiltin = (c: CollectionId, id: string) => (BUILTINS[c] as { id: string }[]).some((b) => b.id === id);

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => {
      const commit = (pack: LibraryPack) => {
        const next = { ...pack, updatedAt: new Date().toISOString() };
        applyPack(next);
        set({ pack: next, version: get().version + 1 });
      };
      const overlay = (c: CollectionId) => ({ ...(get().pack[c] as Overlay<{ id: string }>) });
      return {
        pack: emptyPack(),
        version: 0,
        upsert: (c, item, previousId) => {
          const o = overlay(c);
          const id = (item as { id: string }).id;
          if (isBuiltin(c, id)) {
            o.overrides = { ...o.overrides, [id]: item as { id: string } };
          } else {
            const without = o.custom.filter((x) => x.id !== id && x.id !== previousId);
            o.custom = [...without, item as { id: string }];
          }
          commit({ ...get().pack, [c]: o });
        },
        disable: (c, id) => {
          const o = overlay(c);
          if (!o.disabled.includes(id)) o.disabled = [...o.disabled, id];
          commit({ ...get().pack, [c]: o });
        },
        restore: (c, id) => {
          const o = overlay(c);
          const overrides = { ...o.overrides };
          delete overrides[id];
          o.overrides = overrides;
          o.disabled = o.disabled.filter((x) => x !== id);
          commit({ ...get().pack, [c]: o });
        },
        removeCustom: (c, id) => {
          const o = overlay(c);
          o.custom = o.custom.filter((x) => x.id !== id);
          o.disabled = o.disabled.filter((x) => x !== id);
          commit({ ...get().pack, [c]: o });
        },
        setCatalog: (cat) => commit({ ...get().pack, catalogs: { ...get().pack.catalogs, [cat.id]: cat } }),
        resetCatalog: (id) => {
          const catalogs = { ...get().pack.catalogs };
          delete catalogs[id];
          commit({ ...get().pack, catalogs });
        },
        replacePack: (p) => commit(p),
        resetAll: () => commit(emptyPack()),
      };
    },
    {
      name: 'ai-threat-modeler-library',
      version: 1,
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          const mem = new Map<string, string>();
          return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
        }
      }),
      partialize: (s) => ({ pack: s.pack }),
      merge: (persisted, current) => {
        let pack = current.pack;
        try {
          const p = (persisted as { pack?: unknown } | undefined)?.pack;
          if (p) pack = parsePack(JSON.stringify(p));
        } catch {
          pack = emptyPack();
        }
        applyPack(pack);
        return { ...current, pack };
      },
    },
  ),
);
