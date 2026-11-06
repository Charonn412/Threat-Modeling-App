import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { RuleBasedAnalyzer, applySuggestions } from './describe';
import { newAssessment } from '../model/factory';
import type { Assessment } from '../model/types';
import { NODE_H, NODE_W, membership } from './analysis';
import { autoLayout } from './layout';

function apply(a: Assessment): Assessment {
  const r = autoLayout(a);
  return {
    ...a,
    components: a.components.map((c) => ({ ...c, position: r.components[c.id] })),
    boundaries: a.boundaries.map((b) => ({ ...b, position: { x: r.boundaries[b.id].x, y: r.boundaries[b.id].y }, width: r.boundaries[b.id].width, height: r.boundaries[b.id].height })),
  };
}

const overlaps = (a: Assessment) => {
  for (let i = 0; i < a.components.length; i++)
    for (let j = i + 1; j < a.components.length; j++) {
      const p = a.components[i].position;
      const q = a.components[j].position;
      if (Math.abs(p.x - q.x) < NODE_W && Math.abs(p.y - q.y) < NODE_H) return true;
    }
  return false;
};

describe('auto-layout', () => {
  it('keeps every component in the same trust boundaries and avoids overlaps', () => {
    for (const t of TEMPLATES) {
      const a = instantiateTemplate(t);
      const before = membership(a);
      const after = apply(a);
      const m = membership(after);
      for (const c of a.components) expect(m.get(c.id)?.sort(), `${t.id}: ${c.name}`).toEqual(before.get(c.id)?.sort());
      expect(overlaps(after)).toBe(false);
    }
  });

  it('lays flows out left to right', () => {
    const a = apply(instantiateTemplate(TEMPLATES[0]));
    const byName = (n: string) => a.components.find((c) => c.name === n)!.position.x;
    expect(byName('Employee')).toBeLessThan(byName('Assistant chat UI'));
  });

  it('tidies a described system without boundaries', () => {
    const base = applySuggestions(newAssessment(), new RuleBasedAnalyzer().analyze('Chat assistant using Claude via Bedrock, Pinecone, Jira tickets, Okta SSO and Splunk logs.'), true);
    expect(overlaps(apply(base))).toBe(false);
  });
});
