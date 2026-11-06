import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { newComponent, newFlow } from '../model/factory';
import { diffAssessments } from '../logic/diff';
import { buildReport } from '../report/build';
import {
  deleteAssessment,
  duplicateAssessment,
  getVersion,
  listAssessments,
  listVersions,
  loadAssessment,
  prepareImport,
  saveAssessment,
  saveVersion,
  setStorage,
  StorageFullError,
  type KV,
} from './workspace';

function memory(limit = Infinity): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      const size = [...m.entries()].reduce((n, [kk, vv]) => n + (kk === k ? 0 : vv.length), 0) + v.length;
      if (size > limit) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
    removeItem: (k) => void m.delete(k),
  };
}

beforeEach(() => setStorage(memory()));

describe('workspace', () => {
  it('keeps several assessments with an index', () => {
    const a = instantiateTemplate(TEMPLATES[0]);
    a.intake.systemName = 'RAG';
    const b = instantiateTemplate(TEMPLATES[1]);
    b.intake.systemName = 'Agent';
    saveAssessment(a);
    saveAssessment(b);
    expect(listAssessments().map((e) => e.name).sort()).toEqual(['Agent', 'RAG']);
    expect(loadAssessment(a.id)!.components).toHaveLength(a.components.length);
    const copy = duplicateAssessment(b.id)!;
    expect(copy.id).not.toBe(b.id);
    expect(listAssessments()).toHaveLength(3);
    deleteAssessment(a.id);
    expect(listAssessments().some((e) => e.id === a.id)).toBe(false);
    expect(loadAssessment(a.id)).toBeNull();
  });

  it('saves versions as immutable snapshots', () => {
    const a = instantiateTemplate(TEMPLATES[1]);
    const v = saveVersion(a, 'v1.0 approved');
    a.components[0].name = 'Changed later';
    expect(getVersion(a.id, v.id)!.components[0].name).not.toBe('Changed later');
    expect(listVersions(a.id)).toHaveLength(1);
    expect(listAssessments()[0].versions).toBe(1);
  });

  it('imports a diverged copy of an existing assessment as a new one', () => {
    const a = instantiateTemplate(TEMPLATES[0]);
    saveAssessment(a);
    expect(prepareImport(a).id).toBe(a.id); // identical: no duplicate
    const theirs = { ...structuredClone(a), intake: { ...a.intake, purpose: 'edited elsewhere' } };
    const imported = prepareImport(theirs);
    expect(imported.id).not.toBe(a.id);
    expect(imported.intake.systemName).toContain('(imported)');
  });

  it('reports a full browser storage clearly', () => {
    setStorage(memory(2000));
    expect(() => saveAssessment(instantiateTemplate(TEMPLATES[1]))).toThrow(StorageFullError);
  });
});

describe('version comparison', () => {
  it('lists changes and derives Section 13 triggers', () => {
    const before = instantiateTemplate(TEMPLATES[1]);
    const after = structuredClone(before);
    const agent = after.components.find((c) => c.type === 'agent')!;
    const slack = newComponent('tool_connector', { x: 0, y: 0 }, { name: 'Slack connector' });
    after.components.push(slack);
    after.flows.push(newFlow(agent.id, slack.id));
    after.components.find((c) => c.type === 'model_endpoint')!.provider = 'New model v2';
    after.intake.exposure = 'public';
    const d = diffAssessments(before, after);
    expect(d.changes.some((c) => c.area === 'component' && c.kind === 'added' && c.label === 'Slack connector')).toBe(true);
    const ids = d.triggers.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['capability', 'model', 'use']));
    expect(ids).not.toContain('obligation');
    expect(diffAssessments(before, structuredClone(before))).toEqual({ changes: [], triggers: [] });
  });

  it('adds a changes section to the report when a baseline is chosen', () => {
    const before = instantiateTemplate(TEMPLATES[0]);
    const after = structuredClone(before);
    after.components.push(newComponent('code_sandbox', { x: 0, y: 0 }));
    const blocks = buildReport(after, {
      sections: Object.fromEntries(['summary', 'changes', 'charter', 'architecture', 'answers', 'objectives', 'threats', 'register', 'controls', 'coverage', 'gaps', 'dod', 'signoff'].map((s) => [s, true])) as never,
      includeDismissed: true,
      includeUnanswered: false,
      baseline: { label: 'v1.0', createdAt: '2026-11-01T00:00:00Z', data: before },
    });
    const h1 = blocks.filter((b) => b.t === 'h1').map((b) => (b as { text: string }).text);
    expect(h1[1]).toBe('2. Changes since v1.0');
    expect(JSON.stringify(blocks)).toContain('New tool, plugin, connector');
  });
});
