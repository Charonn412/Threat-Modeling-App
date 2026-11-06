import dagre from '@dagrejs/dagre';
import type { Assessment } from '../model/types';
import { NODE_H, NODE_W } from './analysis';

/**
 * Automatic layered layout (left → right in flow direction). Trust
 * boundaries become clusters so every component stays inside the same
 * boundaries it was in, and boundaries are resized to fit their members.
 */

const PAD = 28; // space inside a boundary around its components
const LABEL = 22; // room for the boundary label

export interface LayoutResult {
  components: Record<string, { x: number; y: number }>;
  boundaries: Record<string, { x: number; y: number; width: number; height: number }>;
}

/** Innermost boundary for each component, and parent boundary for nested boundaries (by geometry). */
function hierarchy(a: Assessment) {
  const area = (b: Assessment['boundaries'][number]) => b.width * b.height;
  const inside = (x: number, y: number, b: Assessment['boundaries'][number]) => x >= b.position.x && x <= b.position.x + b.width && y >= b.position.y && y <= b.position.y + b.height;
  const compParent = new Map<string, string>();
  for (const c of a.components) {
    const cx = c.position.x + NODE_W / 2;
    const cy = c.position.y + NODE_H / 2;
    const owners = a.boundaries.filter((b) => inside(cx, cy, b)).sort((x, y) => area(x) - area(y));
    if (owners[0]) compParent.set(c.id, owners[0].id);
  }
  const boundaryParent = new Map<string, string>();
  for (const b of a.boundaries) {
    const cx = b.position.x + b.width / 2;
    const cy = b.position.y + b.height / 2;
    const owners = a.boundaries.filter((o) => o.id !== b.id && area(o) > area(b) && inside(cx, cy, o)).sort((x, y) => area(x) - area(y));
    if (owners[0]) boundaryParent.set(b.id, owners[0].id);
  }
  return { compParent, boundaryParent };
}

export function autoLayout(a: Assessment): LayoutResult {
  const { compParent, boundaryParent } = hierarchy(a);
  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 90, marginx: 30, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  // Only boundaries that (transitively) contain components take part.
  const used = new Set<string>();
  for (const id of compParent.values()) {
    let b: string | undefined = id;
    while (b && !used.has(b)) {
      used.add(b);
      b = boundaryParent.get(b);
    }
  }
  for (const b of a.boundaries) if (used.has(b.id)) g.setNode(b.id, { paddingTop: PAD + LABEL, paddingBottom: PAD, paddingLeft: PAD, paddingRight: PAD });
  for (const b of a.boundaries) if (used.has(b.id) && boundaryParent.get(b.id) && used.has(boundaryParent.get(b.id)!)) g.setParent(b.id, boundaryParent.get(b.id)!);
  for (const c of a.components) {
    g.setNode(c.id, { width: NODE_W, height: NODE_H });
    const p = compParent.get(c.id);
    if (p) g.setParent(c.id, p);
  }
  const ids = new Set(a.components.map((c) => c.id));
  for (const f of a.flows) {
    if (!ids.has(f.source) || !ids.has(f.target) || f.source === f.target) continue;
    // Control-plane edges pull less on the layout than data-plane flows.
    g.setEdge(f.source, f.target, { weight: f.plane === 'control' ? 1 : 3, minlen: 1 }, f.id);
  }
  dagre.layout(g);

  const components: LayoutResult['components'] = {};
  for (const c of a.components) {
    const n = g.node(c.id) as { x: number; y: number };
    components[c.id] = { x: Math.round(n.x - NODE_W / 2), y: Math.round(n.y - NODE_H / 2) };
  }
  const boundaries: LayoutResult['boundaries'] = {};
  for (const b of a.boundaries) {
    if (!used.has(b.id)) continue;
    const n = g.node(b.id) as { x: number; y: number; width: number; height: number };
    boundaries[b.id] = { x: Math.round(n.x - n.width / 2), y: Math.round(n.y - n.height / 2), width: Math.round(n.width), height: Math.round(n.height) };
  }
  // Empty boundaries keep their size and are placed below the diagram.
  const bottom = Math.max(0, ...Object.values(components).map((p) => p.y + NODE_H), ...Object.values(boundaries).map((r) => r.y + r.height));
  let x = 30;
  for (const b of a.boundaries) {
    if (used.has(b.id)) continue;
    boundaries[b.id] = { x, y: bottom + 60, width: b.width, height: b.height };
    x += b.width + 30;
  }
  return { components, boundaries };
}
