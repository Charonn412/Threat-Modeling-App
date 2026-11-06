import { useMemo, useState } from 'react';
import { BUILTIN_CATALOGS, CATALOGS, type Catalog, type CatalogItem } from '../../library/frameworks';
import { diffCatalog, parseMitreRelease, type CatalogDiff } from '../../library/frameworks/importers';
import { editorItems, useLibrary } from '../../library/registry';
import { templateFromAssessment, type Template } from '../../library/templates';
import { THREAT_RULES } from '../../library/threatRules';
import { getComponentType } from '../../library/catalog';
import { useStore } from '../../state/store';
import { Field, TextInput } from '../controls';
import { StateBadge, ID_RE } from './common';

// ── Templates ─────────────────────────────────────────────────────────────
export function TemplatesPane() {
  const pack = useLibrary((s) => s.pack);
  const { upsert, disable, restore, removeCustom } = useLibrary.getState();
  const assessment = useStore((s) => s.assessment);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const items = editorItems(pack, 'templates');
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const exists = items.some((x) => x.item.id === id);
  const canSave = !!assessment && assessment.components.length > 0 && !!id && ID_RE.test(id);

  return (
    <div className="lib-pane">
      <section className="card">
        <h3>Save the open assessment's architecture as a template</h3>
        {!assessment || !assessment.components.length ? (
          <p className="small muted">Open an assessment with an architecture first. Its components, flows, boundaries and system type become a starter template.</p>
        ) : (
          <>
            <p className="small muted">
              Captures {assessment.components.length} components, {assessment.flows.length} flows and {assessment.boundaries.length} boundaries from "{assessment.intake.systemName || 'Untitled'}". Answers and threats
              are not included.
            </p>
            <div className="grid2">
              <Field label="Template name">
                <TextInput value={name} onChange={setName} placeholder="e.g. Internal RAG on Azure" />
              </Field>
              <Field label="Description">
                <TextInput value={desc} onChange={setDesc} />
              </Field>
            </div>
            {exists && <p className="small warn">A template with ID "{id}" exists. Saving will replace it.</p>}
            <button
              type="button"
              className="btn primary small"
              disabled={!canSave}
              onClick={() => {
                upsert('templates', templateFromAssessment(assessment, id, name.trim(), desc.trim()));
                setName('');
                setDesc('');
              }}
            >
              Save as template
            </button>
          </>
        )}
      </section>
      <table className="table">
        <thead>
          <tr>
            <th>Template</th>
            <th>Contents</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map(({ item, state }) => {
            const t = item as Template;
            return (
              <tr key={t.id} className={state === 'disabled' ? 'off' : ''}>
                <td>
                  <strong>{t.name}</strong> <StateBadge state={state} />
                  <div className="small muted">{t.description}</div>
                </td>
                <td className="small">
                  {t.components.length} components · {t.flows.length} flows · {t.boundaries.length} boundaries
                  <div aria-hidden>{[...new Set(t.components.map((c) => getComponentType(c.type).glyph))].join(' ')}</div>
                </td>
                <td>
                  <div className="row gap">
                  {state === 'custom' && (
                    <button type="button" className="btn small danger" onClick={() => window.confirm(`Delete template "${t.name}"?`) && removeCustom('templates', t.id)}>
                      Delete
                    </button>
                  )}
                  {(state === 'builtin' || state === 'modified') && (
                    <button type="button" className="btn small" onClick={() => disable('templates', t.id)}>
                      Hide
                    </button>
                  )}
                  {state === 'disabled' && (
                    <button type="button" className="btn small" onClick={() => restore('templates', t.id)}>
                      Show
                    </button>
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Frameworks ────────────────────────────────────────────────────────────
interface PendingImport {
  catalog: Catalog;
  diff: CatalogDiff;
  current: Catalog;
  brokenRules: { rule: string; ids: string[] }[];
  brokenThreats: { ref: string; ids: string[] }[];
}

export function FrameworksPane() {
  const pack = useLibrary((s) => s.pack);
  useLibrary((s) => s.version);
  const { setCatalog, resetCatalog } = useLibrary.getState();
  const assessment = useStore((s) => s.assessment);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const builtinIds = new Set(BUILTIN_CATALOGS.map((c) => c.id));

  const importRelease = async () => {
    setError('');
    const file = await pickFileWithName('.json,.yaml,.yml');
    if (!file) return;
    setBusy(true);
    // Let the busy state paint before parsing a large file.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const catalog = parseMitreRelease(file.name, file.text);
      const current = CATALOGS.find((c) => c.id === catalog.id)!;
      const diff = diffCatalog(current, catalog);
      const removed = new Set(diff.removed.map((i) => i.id));
      const brokenRules = THREAT_RULES.map((r) => ({ rule: r.id, ids: r.tags.filter((t) => t.fw === catalog.id && removed.has(t.id)).map((t) => t.id) })).filter((x) => x.ids.length);
      const brokenThreats = (assessment?.threats ?? [])
        .filter((t) => t.status !== 'dismissed')
        .map((t) => ({ ref: t.ref, ids: t.frameworks.filter((f) => f.fw === catalog.id && removed.has(f.id)).map((f) => f.id) }))
        .filter((x) => x.ids.length);
      setPending({ catalog, diff, current, brokenRules, brokenThreats });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lib-pane">
      <section className="card">
        <h3>Import a MITRE release</h3>
        <p className="small muted">
          Load the official file to update a catalog: ATT&CK Enterprise <code>enterprise-attack.json</code> (STIX, from mitre-attack/attack-stix-data) or ATLAS <code>ATLAS-&lt;version&gt;.yaml</code>{' '}
          (from mitre-atlas/atlas-data, dist/v6). The file is parsed in your browser, and you review the changes before applying them.
        </p>
        <button type="button" className="btn small primary" onClick={importRelease} disabled={busy}>
          {busy ? 'Parsing…' : 'Choose release file…'}
        </button>
        {error && <p className="small warn">{error}</p>}
        {pending && (
          <div className="sub-card">
            <h4>
              {pending.catalog.name}: {pending.current.version} → {pending.catalog.version}
            </h4>
            <p className="small">
              {pending.catalog.items.length} items · <strong>{pending.diff.added.length}</strong> added · <strong>{pending.diff.removed.length}</strong> removed or deprecated ·{' '}
              <strong>{pending.diff.renamed.length}</strong> renamed
            </p>
            {pending.diff.removed.length > 0 && <DiffList title="Removed" items={pending.diff.removed.map((i) => `${i.id} ${i.name}`)} />}
            {pending.diff.added.length > 0 && <DiffList title="Added" items={pending.diff.added.map((i) => `${i.id} ${i.name}`)} />}
            {pending.diff.renamed.length > 0 && <DiffList title="Renamed" items={pending.diff.renamed.map((r) => `${r.id}: ${r.from} → ${r.to}`)} />}
            {pending.brokenRules.length > 0 ? (
              <p className="small warn">
                Threat rules that map to removed IDs: {pending.brokenRules.map((r) => `${r.rule} (${r.ids.join(', ')})`).join('; ')}. Update their mappings in Threat rules after importing.
              </p>
            ) : (
              <p className="small ok">No threat rules reference removed IDs.</p>
            )}
            {pending.brokenThreats.length > 0 && (
              <p className="small warn">Threats in the open assessment that map to removed IDs: {pending.brokenThreats.map((t) => `${t.ref} (${t.ids.join(', ')})`).join('; ')}.</p>
            )}
            <div className="row gap">
              <button
                type="button"
                className="btn small primary"
                onClick={() => {
                  setCatalog(pending.catalog);
                  setPending(null);
                }}
              >
                Apply {pending.catalog.version}
              </button>
              <button type="button" className="btn small" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <table className="table">
        <thead>
          <tr>
            <th>Framework</th>
            <th>Version</th>
            <th>Items</th>
            <th>Type</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {CATALOGS.map((c) => {
            const overridden = !!pack.catalogs[c.id];
            const custom = !builtinIds.has(c.id);
            const mitre = c.id === 'attack' || c.id === 'atlas';
            return (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong> <span className="small muted">({c.short})</span>
                  {custom ? <span className="badge lib-custom">custom</span> : overridden ? <span className="badge lib-modified">{mitre ? 'imported' : 'edited'}</span> : null}
                </td>
                <td>{c.version}</td>
                <td>{c.items.length}</td>
                <td className="small">{c.kind === 'ai' ? 'AI' : c.kind === 'compliance' ? 'Compliance' : 'Traditional'}</td>
                <td>
                  <div className="row gap">
                  {!mitre && (
                    <button type="button" className="btn small" onClick={() => setEditing(c.id)}>
                      Edit
                    </button>
                  )}
                  {overridden && (
                    <button type="button" className="btn small" onClick={() => window.confirm(custom ? `Delete framework ${c.name}?` : `Revert ${c.name} to the built-in version?`) && resetCatalog(c.id)}>
                      {custom ? 'Delete' : 'Revert'}
                    </button>
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn small" onClick={() => setEditing('__new__')}>
        + Add a framework (e.g. your internal control standard)
      </button>
      {editing && (
        <CatalogEditor
          key={editing}
          catalog={
            editing === '__new__'
              ? { id: '', name: '', short: '', version: '1.0', kind: 'traditional', source: '', items: [{ id: '', name: '' }] }
              : CATALOGS.find((c) => c.id === editing)!
          }
          isNew={editing === '__new__'}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DiffList({ title, items }: { title: string; items: string[] }) {
  return (
    <details className="small">
      <summary>
        {title} ({items.length})
      </summary>
      <ul className="diff-list">
        {items.slice(0, 300).map((x) => (
          <li key={x}>{x}</li>
        ))}
        {items.length > 300 && <li className="muted">…and {items.length - 300} more</li>}
      </ul>
    </details>
  );
}

function CatalogEditor({ catalog, isNew, onClose }: { catalog: Catalog; isNew: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Catalog>(() => ({ ...catalog, items: catalog.items.map((i) => ({ ...i })) }));
  const set = (p: Partial<Catalog>) => setDraft({ ...draft, ...p });
  const setItem = (idx: number, p: Partial<CatalogItem>) => set({ items: draft.items.map((it, i) => (i === idx ? { ...it, ...p } : it)) });
  const error = useMemo(() => {
    if (!draft.id || !ID_RE.test(draft.id)) return 'Framework ID is required (letters, digits, . _ : -).';
    if (isNew && CATALOGS.some((c) => c.id === draft.id)) return `Framework ID "${draft.id}" already exists.`;
    if (!draft.name.trim() || !draft.short.trim()) return 'Name and short name are required.';
    const ids = draft.items.map((i) => i.id.trim());
    if (ids.some((x) => !x)) return 'Every item needs an ID.';
    if (new Set(ids).size !== ids.length) return 'Item IDs must be unique.';
    return null;
  }, [draft, isNew]);

  return (
    <section className="card">
      <h3>{isNew ? 'New framework' : `Edit ${catalog.name}`}</h3>
      <div className="grid3">
        <Field label="ID">
          <input className="input mono" value={draft.id} disabled={!isNew} onChange={(e) => set({ id: e.target.value.trim() })} />
        </Field>
        <Field label="Name">
          <TextInput value={draft.name} onChange={(v) => set({ name: v })} />
        </Field>
        <Field label="Short name (chips)">
          <TextInput value={draft.short} onChange={(v) => set({ short: v })} />
        </Field>
        <Field label="Version">
          <TextInput value={draft.version} onChange={(v) => set({ version: v })} />
        </Field>
        <Field label="Type">
          <select className="input" value={draft.kind} onChange={(e) => set({ kind: e.target.value as Catalog['kind'] })}>
            <option value="ai">AI</option>
            <option value="traditional">Traditional</option>
            <option value="compliance">Compliance</option>
          </select>
        </Field>
        <Field label="Source URL">
          <TextInput value={draft.source} onChange={(v) => set({ source: v })} />
        </Field>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '22%' }}>Item ID</th>
            <th>Name</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {draft.items.map((it, idx) => (
            <tr key={idx}>
              <td>
                <input className="input mono" value={it.id} aria-label={`Item ${idx + 1} ID`} onChange={(e) => setItem(idx, { id: e.target.value })} />
              </td>
              <td>
                <input className="input" value={it.name} aria-label={`Item ${idx + 1} name`} onChange={(e) => setItem(idx, { name: e.target.value })} />
              </td>
              <td>
                <button type="button" className="chip-x" aria-label={`Remove item ${it.id}`} onClick={() => set({ items: draft.items.filter((_, i) => i !== idx) })}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="link small" onClick={() => set({ items: [...draft.items, { id: '', name: '' }] })}>
        + Add item
      </button>
      {error && <p className="small warn">{error}</p>}
      <div className="row gap mt-s">
        <button
          type="button"
          className="btn small primary"
          disabled={!!error}
          onClick={() => {
            useLibrary.getState().setCatalog({ ...draft, items: draft.items.map((i) => ({ ...i, id: i.id.trim(), name: i.name.trim() })) });
            onClose();
          }}
        >
          Save framework
        </button>
        <button type="button" className="btn small" onClick={onClose}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function pickFileWithName(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(
        (text) => resolve({ name: file.name, text }),
        () => resolve(null),
      );
    };
    input.click();
  });
}

