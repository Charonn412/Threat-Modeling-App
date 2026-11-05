import { useMemo, useState, type ReactNode } from 'react';
import { useLibrary, editorItems, type CollectionId, type ItemState } from '../../library/registry';

export const ID_RE = /^[A-Za-z0-9_.:-]+$/;

export function StateBadge({ state }: { state: ItemState }) {
  if (state === 'builtin') return null;
  return <span className={`badge lib-${state}`}>{state === 'modified' ? 'edited' : state}</span>;
}

/** Searchable list of a collection's items with their overlay state. */
export function ItemList<T extends { id: string }>({
  collection,
  selected,
  onSelect,
  onNew,
  label,
  sub,
  newLabel,
}: {
  collection: CollectionId;
  selected: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  label: (item: T) => string;
  sub?: (item: T) => string;
  newLabel: string;
}) {
  const pack = useLibrary((s) => s.pack);
  const [q, setQ] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const items = useMemo(() => editorItems(pack, collection) as unknown as { item: T; state: ItemState }[], [pack, collection]);
  const f = q.trim().toLowerCase();
  const shown = items.filter(({ item, state }) => (!onlyChanged || state !== 'builtin') && (!f || `${item.id} ${label(item)} ${sub?.(item) ?? ''}`.toLowerCase().includes(f)));
  return (
    <div className="lib-list">
      <div className="lib-list-head">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search library items" />
        <div className="row between">
          <label className="small toggle">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Only my changes
          </label>
          <button type="button" className="link small" onClick={onNew}>
            + {newLabel}
          </button>
        </div>
        <span className="small muted">
          {shown.length} of {items.length}
        </span>
      </div>
      <ul>
        {shown.map(({ item, state }) => (
          <li key={item.id}>
            <button type="button" className={`lib-item ${selected === item.id ? 'on' : ''} ${state === 'disabled' ? 'off' : ''}`} onClick={() => onSelect(item.id)}>
              <span className="row between">
                <span className="q-id">{item.id}</span>
                <StateBadge state={state} />
              </span>
              <span className="lib-item-label">{label(item)}</span>
              {sub && <span className="small muted">{sub(item)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Save / cancel / disable / restore / delete controls shared by all item editors. */
export function EditorActions({
  collection,
  id,
  state,
  isNew,
  dirty,
  error,
  onSave,
  onCancel,
  onDeleted,
}: {
  collection: CollectionId;
  id: string;
  state: ItemState | null;
  isNew: boolean;
  dirty: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const { disable, restore, removeCustom } = useLibrary.getState();
  return (
    <div className="lib-actions">
      {error && <p className="small warn">{error}</p>}
      <div className="row gap">
        <button type="button" className="btn primary small" disabled={!!error || (!dirty && !isNew)} onClick={onSave}>
          {isNew ? 'Add to library' : 'Save changes'}
        </button>
        {(dirty || isNew) && (
          <button type="button" className="btn small" onClick={onCancel}>
            {isNew ? 'Discard' : 'Revert'}
          </button>
        )}
        <span className="spacer" />
        {!isNew && state === 'modified' && (
          <button type="button" className="btn small" onClick={() => window.confirm(`Discard your edits to ${id} and restore the built-in version?`) && restore(collection, id)}>
            Restore built-in
          </button>
        )}
        {!isNew && (state === 'builtin' || state === 'modified') && (
          <button type="button" className="btn small" onClick={() => disable(collection, id)}>
            Disable
          </button>
        )}
        {!isNew && state === 'disabled' && (
          <button type="button" className="btn small" onClick={() => restore(collection, id)}>
            Enable
          </button>
        )}
        {!isNew && state === 'custom' && (
          <button
            type="button"
            className="btn small danger"
            onClick={() => {
              if (window.confirm(`Delete ${id} from your library?`)) {
                removeCustom(collection, id);
                onDeleted();
              }
            }}
          >
            Delete
          </button>
        )}
      </div>
      {state === 'disabled' && <p className="small muted">Disabled: hidden from the app until you enable it again.</p>}
    </div>
  );
}

/** JSON textarea with parse + custom validation; reports the parsed value upward. */
export function JsonField({ label, value, onChange, validate, rows = 8, help }: { label: string; value: unknown; onChange: (v: unknown, error: string | null) => void; validate?: (v: unknown) => string | null; rows?: number; help?: ReactNode }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea
        className={`input mono ${error ? 'invalid' : ''}`}
        rows={rows}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          let parsed: unknown;
          try {
            parsed = JSON.parse(e.target.value);
          } catch (err) {
            const msg = `Invalid JSON: ${err instanceof Error ? err.message : ''}`;
            setError(msg);
            onChange(value, msg);
            return;
          }
          const v = validate?.(parsed) ?? null;
          setError(v);
          onChange(parsed, v);
        }}
      />
      {error ? <span className="field-hint warn">{error}</span> : help ? <span className="field-hint">{help}</span> : null}
    </label>
  );
}

export const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
