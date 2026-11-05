import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { refreshThreats } from '../logic/threats';
import { newAssessment } from '../model/factory';
import type { Assessment } from '../model/types';
import { cellText, type Block } from './blocks';
import { buildReport, defaultReportOptions } from './build';
import { renderArchitectureSvg } from './diagram';
import { toPdfDefinition } from './pdf';

function populated(): Assessment {
  const a = instantiateTemplate(TEMPLATES[1]);
  a.intake.systemName = 'Support <Agent> & Co';
  a.threats = refreshThreats(a).threats;
  a.threats[0].status = 'accepted';
  a.threats[0].treatment = 'mitigate';
  a.threats[0].residualLikelihood = 1;
  a.threats[0].residualImpact = 2;
  a.threats[1].status = 'dismissed';
  a.threats[1].dismissReason = 'Read-only scopes';
  const sandbox = a.components.find((c) => c.type === 'code_sandbox')!;
  a.answers[`${sandbox.id}::B9.2`] = { status: 'unknown', note: 'Need platform input', evidence: '', owner: 'Sam', dueDate: '2026-12-01' };
  a.signOff.decision = 'approved-conditions';
  return a;
}

const text = (blocks: Block[]) =>
  blocks
    .map((b) => {
      switch (b.t) {
        case 'title':
          return `${b.text} ${b.subtitle}`;
        case 'kv':
          return b.rows.map(([k, v]) => `${k} ${cellText(v)}`).join(' ');
        case 'table':
          return [...b.head, ...b.rows.flat().map(cellText)].join(' ');
        case 'list':
          return b.items.join(' ');
        case 'diagram':
        case 'pagebreak':
          return '';
        default:
          return b.text;
      }
    })
    .join('\n');

describe('report builder', () => {
  it('includes every methodology output section in order', () => {
    const blocks = buildReport(populated());
    const h1 = blocks.filter((b): b is Extract<Block, { t: 'h1' }> => b.t === 'h1').map((b) => b.text);
    expect(h1).toEqual([
      '1. Executive summary',
      '2. Assessment charter and scope',
      '3. Architecture and data flows',
      '4. Architecture discovery record',
      '5. Security objectives',
      '6. Threat scenarios',
      '7. Risk register and treatment',
      '8. Framework coverage',
      '9. Open items, assumptions and gaps',
      '10. Approval and sign-off',
    ]);
    expect(blocks.some((b) => b.t === 'diagram')).toBe(true);
  });

  it('reports confirmed threats with narrative and frameworks, dismissed with reasons, and unknowns with owners', () => {
    const a = populated();
    const t = text(buildReport(a));
    expect(t).toContain(a.threats[0].ref);
    expect(t).toContain('Read-only scopes');
    expect(t).toContain('Need platform input');
    expect(t).toContain('Sam');
    expect(t).toContain('Approved with conditions');
    expect(t).toMatch(/STRIDE: /);
    expect(t).toContain('candidate scenarios have not been reviewed');
  });

  it('respects section and option toggles and renumbers', () => {
    const opts = defaultReportOptions();
    opts.sections.answers = false;
    opts.sections.coverage = false;
    opts.includeDismissed = false;
    const blocks = buildReport(populated(), opts);
    const h1 = blocks.filter((b): b is Extract<Block, { t: 'h1' }> => b.t === 'h1').map((b) => b.text);
    expect(h1).not.toContain('4. Architecture discovery record');
    expect(h1[3]).toBe('4. Security objectives');
    expect(text(blocks)).not.toContain('Read-only scopes');
  });

  it('works for an empty assessment', () => {
    const blocks = buildReport(newAssessment());
    expect(blocks[0].t).toBe('title');
    expect(text(blocks)).toContain('No threats have been confirmed yet');
  });
});

describe('architecture SVG', () => {
  it('escapes names and numbers every flow', () => {
    const a = populated();
    a.components[0].name = 'A <b>"x"</b> & y';
    const { svg, width, height } = renderArchitectureSvg(a);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;');
    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThan(100);
    for (let i = 1; i <= a.flows.length; i++) expect(svg).toContain(`>F${i}<`);
  });
});

describe('PDF definition', () => {
  it('maps every block and keeps table rows consistent with headers', () => {
    const blocks = buildReport(populated());
    const def = toPdfDefinition(blocks, 'Test') as { content: Record<string, unknown>[] };
    expect(def.content.length).toBeGreaterThan(blocks.filter((b) => b.t !== 'pagebreak').length - 1);
    for (const n of def.content) {
      const table = n.table as { body: unknown[][]; widths: unknown[] } | undefined;
      if (!table) continue;
      for (const row of table.body) expect(row.length).toBe(table.widths.length);
    }
    expect(def.content.some((n) => typeof n.svg === 'string')).toBe(true);
    expect(def.content.some((n) => n.pageBreak === 'before')).toBe(true);
  });

  it('contains no glyphs missing from the embedded PDF font', () => {
    const def = toPdfDefinition(buildReport(populated()), 'A → B');
    const json = JSON.stringify(def.content) + JSON.stringify((def.footer as (c: number, t: number) => unknown)(1, 2));
    expect(json).not.toMatch(/[→↔←]/);
  });
});
