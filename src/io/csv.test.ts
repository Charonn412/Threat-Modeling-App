import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { atlasMitigationsFor, CATALOGS } from '../library/frameworks';
import { refreshThreats } from '../logic/threats';
import { generateControls } from '../logic/controls';
import type { Assessment } from '../model/types';
import { controlsCsv, jiraCsv, riskRegisterCsv, toCsv } from './csv';

/** Minimal RFC 4180 parser for round-trip checks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\r') continue;
    else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  return rows;
}

function treated(): Assessment {
  const a = instantiateTemplate(TEMPLATES[1]);
  a.threats = refreshThreats(a).threats.map((t, i) => (i < 4 ? { ...t, status: 'accepted', treatment: i < 3 ? 'mitigate' : '', owner: 'AI Platform' } : t));
  a.controls = generateControls(a).controls;
  return a;
}

describe('CSV', () => {
  it('escapes quotes, commas, newlines and neutralizes formulas', () => {
    const rows = parseCsv(toCsv([['a "b", c', 'line1\nline2', '=HYPERLINK("x")', '-1+2', 'plain']]));
    expect(rows[0]).toEqual(['a "b", c', 'line1\nline2', `'=HYPERLINK("x")`, `'-1+2`, 'plain']);
  });

  it('exports a consistent risk register, controls log and Jira import', () => {
    const a = treated();
    for (const csv of [riskRegisterCsv(a), controlsCsv(a), jiraCsv(a)]) {
      const rows = parseCsv(csv);
      expect(rows.length).toBeGreaterThan(1);
      for (const r of rows) expect(r).toHaveLength(rows[0].length);
    }
    const reg = parseCsv(riskRegisterCsv(a));
    expect(reg).toHaveLength(1 + a.threats.filter((t) => t.status !== 'candidate').length);
    const jira = parseCsv(jiraCsv(a));
    expect(jira[0]).toEqual(['Summary', 'Issue Type', 'Priority', 'Description', 'Labels', 'Due Date']);
    expect(jira.some((r) => r[0].startsWith('[CTL-'))).toBe(true);
    expect(jira.some((r) => r[0].includes('Decide treatment'))).toBe(true); // the confirmed but untreated threat
    for (const r of jira.slice(1)) expect(['Low', 'Medium', 'High', 'Highest']).toContain(r[2]);
  });
});

describe('ATLAS mitigations', () => {
  it('are loaded and matched to techniques, including via parent techniques', () => {
    const atlas = CATALOGS.find((c) => c.id === 'atlas')!;
    expect(atlas.mitigations!.length).toBeGreaterThan(20);
    const direct = atlasMitigationsFor(['AML.T0051']);
    const viaSub = atlasMitigationsFor(['AML.T0051.001']);
    expect(direct.length).toBeGreaterThan(0);
    for (const m of direct) expect(viaSub.map((x) => x.mitigation.id)).toContain(m.mitigation.id);
    expect(atlasMitigationsFor([])).toEqual([]);
  });
});
