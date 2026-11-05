import type { Block, Cell } from './blocks';

/** Content width in twentieths of a point for US Letter with 0.75" margins (6.75"). */
const CONTENT_TWIPS = 9720;
const CONTENT_PX = 648; // 6.75in at 96 dpi

/**
 * Renders report blocks to a .docx Blob. `diagramPng` maps each diagram block
 * (by index among diagram blocks) to PNG bytes rasterized in the browser.
 */
export async function renderDocx(blocks: Block[], title: string, diagramPngs: Uint8Array[] = []): Promise<Blob> {
  const d = await import('docx');
  const { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } = d;

  const runs = (text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) =>
    text.split('\n').map(
      (line, i) =>
        new TextRun({
          text: line,
          break: i > 0 ? 1 : undefined,
          bold: opts.bold,
          italics: opts.italics,
          color: opts.color?.replace('#', ''),
          size: opts.size,
        }),
    );

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'CED4DA' };
  const borders = { top: border, bottom: border, left: border, right: border };

  const tcell = (c: Cell, width: number, opts: { header?: boolean; small?: boolean; labelFill?: boolean } = {}) => {
    const styled = typeof c === 'string' ? { text: c } : c;
    const fill = opts.header ? 'E9ECEF' : opts.labelFill ? 'F8F9FA' : styled.fill?.replace('#', '');
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders,
      shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: runs(styled.text, { bold: opts.header || opts.labelFill || styled.bold, color: styled.color, size: opts.small ? 15 : 17 }) })],
    });
  };

  const colWidths = (rel: number[] | undefined, cols: number) => {
    const r = rel && rel.length === cols ? rel : new Array(cols).fill(1);
    const sum = r.reduce((x, y) => x + y, 0);
    return r.map((x) => Math.floor((x / sum) * CONTENT_TWIPS));
  };

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  let diagramIndex = 0;
  const gap = () => children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));

  for (const b of blocks) {
    switch (b.t) {
      case 'pagebreak':
        if (children.length) children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'title':
        children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: runs(b.text) }));
        children.push(new Paragraph({ spacing: { after: 200 }, children: runs(b.subtitle, { color: '#5d6673', size: 18 }) }));
        break;
      case 'h1':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(b.text) }));
        break;
      case 'h2':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(b.text) }));
        break;
      case 'h3':
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs(b.text) }));
        break;
      case 'p': {
        const boxed = b.style === 'narrative' || b.style === 'callout';
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            shading: boxed ? { type: ShadingType.CLEAR, color: 'auto', fill: b.style === 'callout' ? 'FFF4E6' : 'F1F3F5' } : undefined,
            border: boxed ? { left: { style: BorderStyle.SINGLE, size: 18, color: b.style === 'callout' ? 'D9480F' : '2F5BD3', space: 6 } } : undefined,
            children: runs(b.text, { color: b.style === 'muted' ? '#5d6673' : undefined, italics: b.style === 'narrative', size: 19 }),
          }),
        );
        break;
      }
      case 'list':
        for (const item of b.items) children.push(new Paragraph({ bullet: { level: 0 }, children: runs(item, { size: 19 }) }));
        gap();
        break;
      case 'kv': {
        const [w1, w2] = colWidths([1.4, 4], 2);
        children.push(
          new Table({
            width: { size: CONTENT_TWIPS, type: WidthType.DXA },
            columnWidths: [w1, w2],
            rows: b.rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [tcell(k, w1, { labelFill: true }), tcell(v, w2)] })),
          }),
        );
        gap();
        break;
      }
      case 'table': {
        const widths = colWidths(b.widths, b.head.length);
        children.push(
          new Table({
            width: { size: CONTENT_TWIPS, type: WidthType.DXA },
            columnWidths: widths,
            rows: [
              new TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((h, i) => tcell(h, widths[i], { header: true, small: b.small })) }),
              ...b.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => tcell(c, widths[i], { small: b.small })) })),
            ],
          }),
        );
        gap();
        break;
      }
      case 'diagram': {
        const png = diagramPngs[diagramIndex++];
        if (!png) {
          children.push(new Paragraph({ children: runs('[Architecture diagram not available in this export]', { italics: true, color: '#868e96' }) }));
          break;
        }
        const scale = Math.min(1, CONTENT_PX / b.width, 820 / b.height);
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({ type: 'png', data: png, transformation: { width: Math.round(b.width * scale), height: Math.round(b.height * scale) } })],
          }),
        );
        break;
      }
    }
  }

  const doc = new Document({
    creator: 'AI Threat Modeler',
    title,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 20 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: '1F3A93' }, paragraph: { spacing: { before: 280, after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true }, paragraph: { spacing: { before: 200, after: 80 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 21, bold: true }, paragraph: { spacing: { before: 180, after: 60 }, keepNext: true } },
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 40, bold: true }, paragraph: { spacing: { after: 80 } } },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: `${title} · Page `, size: 15, color: '868E96' }), new TextRun({ children: [PageNumber.CURRENT], size: 15, color: '868E96' }), new TextRun({ text: ' of ', size: 15, color: '868E96' }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: '868E96' })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** Rasterizes an SVG string to PNG bytes in the browser (2× for crisp print). */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render diagram'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
