import { getComponentType } from '../library/catalog';
import { crossedBoundaries, membership, NODE_H, NODE_W } from '../logic/analysis';
import type { Assessment } from '../model/types';
import { BOUNDARY_KIND_LABEL } from '../ui/labels';

/**
 * Renders the architecture as a standalone, print-friendly SVG (light theme,
 * no external references) for the report. Flows are numbered F1…Fn and
 * described in the flow table, which keeps the drawing legible on paper.
 */

const CAT_COLOR: Record<string, string> = {
  actors: '#8d6e63',
  entry: '#0b7285',
  application: '#495057',
  ai: '#7048e8',
  data: '#2b8a3e',
  capabilities: '#d9480f',
  control: '#5c7cfa',
  effects: '#c2255c',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function flowNumbers(a: Assessment): Map<string, string> {
  return new Map(a.flows.map((f, i) => [f.id, `F${i + 1}`]));
}

export function renderArchitectureSvg(a: Assessment): { svg: string; width: number; height: number } {
  const PAD = 30;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of a.components) {
    xs.push(c.position.x, c.position.x + NODE_W);
    ys.push(c.position.y, c.position.y + NODE_H);
  }
  for (const b of a.boundaries) {
    xs.push(b.position.x, b.position.x + b.width);
    ys.push(b.position.y - 14, b.position.y + b.height);
  }
  if (!xs.length) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80" viewBox="0 0 400 80"><text x="20" y="45" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#5d6673">No components modeled.</text></svg>`;
    return { svg, width: 400, height: 80 };
  }
  const minX = Math.min(...xs) - PAD;
  const minY = Math.min(...ys) - PAD;
  const width = Math.ceil(Math.max(...xs) - minX + PAD);
  const height = Math.ceil(Math.max(...ys) - minY + PAD);
  const X = (x: number) => Math.round(x - minX);
  const Y = (y: number) => Math.round(y - minY);

  const parts: string[] = [];
  const font = 'font-family="Helvetica, Arial, sans-serif"';
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);

  for (const b of a.boundaries) {
    parts.push(
      `<rect x="${X(b.position.x)}" y="${Y(b.position.y)}" width="${b.width}" height="${b.height}" rx="10" fill="#fff4ec" stroke="#d9480f" stroke-width="1.5" stroke-dasharray="7 5"/>`,
    );
    // ASCII separators: the SVG is also embedded in PDFs whose fonts may lack arrow glyphs.
    const label = `${b.name} (${BOUNDARY_KIND_LABEL[b.kind].replace(/ ↔ /g, ' / ')})`;
    const lw = Math.min(b.width - 16, label.length * 6.2 + 12);
    parts.push(`<rect x="${X(b.position.x) + 10}" y="${Y(b.position.y) - 9}" width="${lw}" height="17" fill="#ffffff"/>`);
    parts.push(`<text x="${X(b.position.x) + 16}" y="${Y(b.position.y) + 4}" ${font} font-size="11" font-weight="bold" fill="#d9480f">${esc(trunc(label, Math.floor(lw / 6.2)))}</text>`);
  }

  const byId = new Map(a.components.map((c) => [c.id, c]));
  const members = membership(a);
  const nums = flowNumbers(a);
  const labels: string[] = [];
  for (const f of a.flows) {
    const s = byId.get(f.source);
    const d = byId.get(f.target);
    if (!s || !d) continue;
    const sx = s.position.x;
    const sy = s.position.y;
    const dx = d.position.x;
    const dy = d.position.y;
    let p1: [number, number];
    let p2: [number, number];
    if (dx >= sx + NODE_W) {
      p1 = [sx + NODE_W, sy + NODE_H / 2];
      p2 = [dx, dy + NODE_H / 2];
    } else if (dx + NODE_W <= sx) {
      p1 = [sx, sy + NODE_H / 2];
      p2 = [dx + NODE_W, dy + NODE_H / 2];
    } else if (dy >= sy) {
      p1 = [sx + NODE_W / 2, sy + NODE_H];
      p2 = [dx + NODE_W / 2, dy];
    } else {
      p1 = [sx + NODE_W / 2, sy];
      p2 = [dx + NODE_W / 2, dy + NODE_H];
    }
    const crossing = crossedBoundaries(f, members).length > 0;
    const control = f.plane === 'control';
    const color = crossing ? '#d9480f' : control ? '#6b5bb5' : '#6c757d';
    const [x1, y1, x2, y2] = [X(p1[0]), Y(p1[1]), X(p2[0]), Y(p2[1])];
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${crossing ? 2 : 1.4}"${control ? ' stroke-dasharray="6 4"' : ''}/>`);
    // Arrowhead as a polygon (more portable than SVG markers across PDF/Word converters).
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const L = 9;
    const W = 4.5;
    const ax = x2 - L * Math.cos(ang);
    const ay = y2 - L * Math.sin(ang);
    const pts = [
      [x2, y2],
      [ax + W * Math.sin(ang), ay - W * Math.cos(ang)],
      [ax - W * Math.sin(ang), ay + W * Math.cos(ang)],
    ]
      .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
      .join(' ');
    parts.push(`<polygon points="${pts}" fill="${color}"/>`);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const n = nums.get(f.id)!;
    labels.push(
      `<rect x="${(mx - 13).toFixed(1)}" y="${(my - 8).toFixed(1)}" width="26" height="15" rx="7" fill="#ffffff" stroke="${color}" stroke-width="1"/>` +
        `<text x="${mx.toFixed(1)}" y="${(my + 3.5).toFixed(1)}" ${font} font-size="9.5" font-weight="bold" fill="${color}" text-anchor="middle">${n}</text>`,
    );
  }

  for (const c of a.components) {
    const t = getComponentType(c.type);
    const x = X(c.position.x);
    const y = Y(c.position.y);
    const stroke = c.plane === 'control' ? ' stroke-dasharray="5 3"' : '';
    parts.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="7" fill="#ffffff" stroke="#adb5bd" stroke-width="1.2"${stroke}/>`);
    parts.push(`<rect x="${x}" y="${y}" width="6" height="${NODE_H}" rx="2" fill="${CAT_COLOR[t.category] ?? '#495057'}"/>`);
    parts.push(`<text x="${x + 14}" y="${y + 26}" ${font} font-size="12" font-weight="bold" fill="#1b1f24">${esc(trunc(c.name, 27))}</text>`);
    parts.push(`<text x="${x + 14}" y="${y + 44}" ${font} font-size="10" fill="#5d6673">${esc(trunc(t.label + (c.provider ? ` · ${c.provider}` : ''), 32))}</text>`);
  }
  parts.push(...labels);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
  return { svg, width, height };
}
