import { useEffect, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { COMPONENT_TYPES, CATEGORY_LABEL, CATEGORY_ORDER } from '../library/catalog';
import { useStore, type Layers } from '../state/store';
import { Canvas, DND_MIME } from './Canvas';
import { Inspector } from './Inspector';
import { DescribePanel } from './DescribePanel';
import { NODE_H, NODE_W } from '../logic/analysis';

export function ArchitecturePage() {
  return (
    <ReactFlowProvider>
      <ArchitectureInner />
    </ReactFlowProvider>
  );
}

function ArchitectureInner() {
  const [describing, setDescribing] = useState(false);
  useDeleteKey();
  return (
    <div className="arch">
      <Palette onDescribe={() => setDescribing(true)} />
      <div className="arch-center">
        <Toolbar />
        <Canvas />
      </div>
      <aside className="arch-right">
        <Inspector />
      </aside>
      {describing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Describe your system">
          <div className="modal">
            <DescribePanel mode="existing" onDone={() => setDescribing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Palette({ onDescribe }: { onDescribe: () => void }) {
  const addComponent = useStore((s) => s.addComponent);
  const { screenToFlowPosition } = useReactFlow();
  const [filter, setFilter] = useState('');

  const addAtCenter = (type: string) => {
    const el = document.querySelector('.canvas');
    const r = el?.getBoundingClientRect();
    const p = r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    const jitter = () => Math.round((Math.random() - 0.5) * 80);
    addComponent(type, { x: p.x - NODE_W / 2 + jitter(), y: p.y - NODE_H / 2 + jitter() });
  };

  const f = filter.trim().toLowerCase();
  return (
    <aside className="palette">
      <button type="button" className="btn primary block" onClick={onDescribe}>
        ✍️ Describe system → suggest
      </button>
      <input className="input" placeholder="Filter components…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter components" />
      {CATEGORY_ORDER.map((cat) => {
        const items = COMPONENT_TYPES.filter((t) => t.category === cat && (!f || t.label.toLowerCase().includes(f) || t.description.toLowerCase().includes(f)));
        if (!items.length) return null;
        return (
          <div key={cat} className="palette-group">
            <h4>{CATEGORY_LABEL[cat]}</h4>
            {items.map((t) => (
              <button
                type="button"
                key={t.id}
                className="palette-item"
                draggable
                title={`${t.description}${t.areas.length ? ` (Appendix ${t.areas.join(', ')})` : ''}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_MIME, t.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => addAtCenter(t.id)}
              >
                <span aria-hidden>{t.glyph}</span> {t.label}
              </button>
            ))}
          </div>
        );
      })}
    </aside>
  );
}

function Toolbar() {
  const layers = useStore((s) => s.layers);
  const toggle = useStore((s) => s.toggleLayer);
  const addBoundary = useStore((s) => s.addBoundary);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const LAYERS: [keyof Layers, string][] = [
    ['data', 'Data plane'],
    ['control', 'Control plane'],
    ['boundaries', 'Trust boundaries'],
    ['labels', 'Flow labels'],
  ];
  return (
    <div className="toolbar">
      <button
        type="button"
        className="btn small"
        onClick={() => {
          const r = document.querySelector('.canvas')?.getBoundingClientRect();
          const p = r ? screenToFlowPosition({ x: r.left + 40, y: r.top + 40 }) : { x: 0, y: 0 };
          addBoundary(p);
        }}
      >
        ⬚ Add trust boundary
      </button>
      <button type="button" className="btn small" onClick={() => fitView({ padding: 0.15, duration: 300 })}>
        Fit view
      </button>
      <span className="toolbar-sep" />
      <span className="small muted">Layers:</span>
      {LAYERS.map(([k, label]) => (
        <label key={k} className="small toggle">
          <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} /> {label}
        </label>
      ))}
    </div>
  );
}

/** Delete / Backspace removes the selected flow or boundary; components ask for confirmation in the inspector. */
function useDeleteKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const { selection, removeFlow, removeBoundary, removeComponent, assessment } = useStore.getState();
      if (!selection || !assessment) return;
      if (selection.kind === 'flow') removeFlow(selection.id);
      else if (selection.kind === 'boundary') removeBoundary(selection.id);
      else {
        const c = assessment.components.find((x) => x.id === selection.id);
        if (c && window.confirm(`Delete "${c.name}", its flows and its answers?`)) removeComponent(c.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
