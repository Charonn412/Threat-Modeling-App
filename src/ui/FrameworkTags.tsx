import { useMemo, useState } from 'react';
import { CATALOGS, getCatalog, lookup, searchCatalogs } from '../library/frameworks';
import type { FrameworkRef } from '../model/types';

/** Framework mappings grouped by catalog, with search-to-add across all catalogs. */
export function FrameworkTags({ value, onChange }: { value: FrameworkRef[]; onChange: (v: FrameworkRef[]) => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchCatalogs(q, 30), [q]);
  const has = (fw: string, id: string) => value.some((x) => x.fw === fw && x.id === id);

  return (
    <div className="fw-tags">
      {CATALOGS.filter((c) => value.some((v) => v.fw === c.id)).map((c) => (
        <div key={c.id} className="fw-group">
          <span className={`fw-name ${c.kind}`} title={`${c.name} ${c.version}`}>
            {c.short}
          </span>
          <span className="chips">
            {value
              .filter((v) => v.fw === c.id)
              .map((v) => {
                const item = lookup(v.fw, v.id);
                return (
                  <span key={v.id} className={`chip static fw ${item ? '' : 'invalid'}`} title={item ? `${v.id} ${item.name}${item.tactics?.length ? ` · ${item.tactics.join(', ')}` : ''}` : 'Not found in the current catalog'}>
                    <strong>{v.id}</strong> {item?.name ?? '(unknown)'}
                    <button type="button" className="chip-x" aria-label={`Remove ${v.id}`} onClick={() => onChange(value.filter((x) => !(x.fw === v.fw && x.id === v.id)))}>
                      ×
                    </button>
                  </span>
                );
              })}
          </span>
        </div>
      ))}
      <div className="fw-search">
        <input className="input" placeholder="Add mapping: search OWASP, ATLAS, ATT&CK, STRIDE… (e.g. T1190, poisoning)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search frameworks" />
        {results.length > 0 && (
          <ul className="fw-results" role="listbox">
            {results.map(({ catalog, item }) => (
              <li key={`${catalog.id}:${item.id}`}>
                <button
                  type="button"
                  disabled={has(catalog.id, item.id)}
                  onClick={() => {
                    onChange([...value, { fw: catalog.id, id: item.id }]);
                    setQ('');
                  }}
                >
                  <span className="muted">{getCatalog(catalog.id)?.short}</span> <strong>{item.id}</strong> {item.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
