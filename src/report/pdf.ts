import type { Block, Cell } from './blocks';

/** Page geometry (US Letter portrait, points). */
const PAGE_W = 612;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

type Node = Record<string, unknown> | string;

/** The embedded Roboto subset lacks arrow glyphs; substitute ASCII so nothing renders as a box. */
const safe = (s: string) => s.replace(/→/g, '->').replace(/↔/g, '<->').replace(/←/g, '<-');

function cell(c: Cell, small: boolean, header = false): Node {
  if (typeof c === 'string') return { text: safe(c), fontSize: small ? 7.5 : 8.5, bold: header, fillColor: header ? '#e9ecef' : undefined };
  return {
    text: safe(c.text),
    fontSize: small ? 7.5 : 8.5,
    bold: header || c.bold,
    color: c.color,
    fillColor: header ? '#e9ecef' : c.fill,
  };
}

function widthsFor(rel: number[] | undefined, cols: number): number[] {
  const r = rel && rel.length === cols ? rel : new Array(cols).fill(1);
  const sum = r.reduce((x, y) => x + y, 0);
  // Subtract cell padding (≈ 8pt per column) so the table fits the content width.
  return r.map((x) => Math.max(18, (x / sum) * (CONTENT_W - cols * 8)));
}

const LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#ced4da',
  vLineColor: () => '#ced4da',
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

export function toPdfDefinition(blocks: Block[], title: string): Record<string, unknown> {
  const content: Node[] = [];
  let breakNext = false;
  const push = (n: Record<string, unknown>) => {
    if (breakNext) {
      n.pageBreak = 'before';
      breakNext = false;
    }
    content.push(n);
  };

  for (const b of blocks) {
    switch (b.t) {
      case 'pagebreak':
        breakNext = content.length > 0;
        break;
      case 'title':
        push({ text: safe(b.text), fontSize: 20, bold: true, margin: [0, 0, 0, 4] });
        push({ text: safe(b.subtitle), fontSize: 9, color: '#5d6673', margin: [0, 0, 0, 12] });
        break;
      case 'h1':
        push({ text: safe(b.text), fontSize: 15, bold: true, color: '#1f3a93', margin: [0, 14, 0, 6], headlineLevel: 1 });
        break;
      case 'h2':
        push({ text: safe(b.text), fontSize: 12, bold: true, margin: [0, 10, 0, 4] });
        break;
      case 'h3':
        push({ text: safe(b.text), fontSize: 10.5, bold: true, margin: [0, 9, 0, 3] });
        break;
      case 'p':
        if (b.style === 'narrative' || b.style === 'callout') {
          push({
            table: { widths: ['*'], body: [[{ text: safe(b.text), fontSize: 8.5, italics: b.style === 'narrative', color: '#1b1f24' }]] },
            layout: { ...LAYOUT, hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2.5 : 0), vLineColor: () => (b.style === 'callout' ? '#d9480f' : '#2f5bd3'), paddingLeft: () => 8 },
            fillColor: b.style === 'callout' ? '#fff4e6' : '#f1f3f5',
            margin: [0, 2, 0, 6],
          });
        } else push({ text: safe(b.text), fontSize: 9, color: b.style === 'muted' ? '#5d6673' : '#1b1f24', margin: [0, 2, 0, 6] });
        break;
      case 'list':
        push({ ul: b.items.map((x) => ({ text: safe(x), fontSize: 9 })), margin: [0, 2, 0, 6] });
        break;
      case 'kv':
        push({
          table: { widths: [130, '*'], body: b.rows.map(([k, v]) => [{ text: safe(k), fontSize: 8.5, bold: true, fillColor: '#f8f9fa' }, cell(v, false)]) },
          layout: LAYOUT,
          margin: [0, 2, 0, 8],
        });
        break;
      case 'table': {
        const small = !!b.small;
        push({
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: widthsFor(b.widths, b.head.length),
            body: [b.head.map((h) => cell(h, small, true)), ...b.rows.map((r) => r.map((c) => cell(c, small)))],
          },
          layout: LAYOUT,
          margin: [0, 2, 0, 8],
        });
        break;
      }
      case 'diagram': {
        const scale = Math.min(1, CONTENT_W / b.width, 620 / b.height);
        push({ svg: b.svg, width: b.width * scale, margin: [0, 4, 0, 6] });
        break;
      }
    }
  }

  return {
    pageSize: 'LETTER',
    pageMargins: [MARGIN, 44, MARGIN, 44],
    info: { title, creator: 'AI Threat Modeler' },
    defaultStyle: { fontSize: 9, lineHeight: 1.15 },
    footer: (current: number, total: number) => ({
      columns: [
        { text: safe(title), fontSize: 7.5, color: '#868e96', margin: [MARGIN, 0, 0, 0] },
        { text: `Page ${current} of ${total}`, alignment: 'right', fontSize: 7.5, color: '#868e96', margin: [0, 0, MARGIN, 0] },
      ],
    }),
    content,
  };
}

export async function renderPdf(blocks: Block[], title: string): Promise<Blob> {
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake.createPdf(toPdfDefinition(blocks, title)).getBlob();
}

