import { QUESTIONS } from '../library/questions';
import { THREAT_RULES } from '../library/threatRules';
import { TEMPLATES, instantiateTemplate } from '../library/templates';
import { classify, componentPosture, overallPosture, weakAnswers } from './posture';
import { suggestRating } from './threats';
import type { Answer } from '../model/types';

const ans = (status: Answer['status'], note = ''): Answer => ({ status, note, evidence: '', owner: '', dueDate: '' });
const q = (id: string) => QUESTIONS.find((x) => x.id === id)!;

describe('question polarity', () => {
  it('every question declares a secure answer', () => {
    for (const x of QUESTIONS) expect(['yes', 'no', 'info'], x.id).toContain(x.secure);
  });

  it('rule signals only fire on the weak answer or Unknown, never the secure one', () => {
    for (const r of THREAT_RULES) {
      for (const s of r.signals ?? []) {
        const question = q(s.q);
        if (question.secure === 'info') continue;
        expect(s.in, `${r.id} signal ${s.q} fires on the secure answer`).not.toContain(question.secure);
      }
    }
  });

  it('classifies answers by meaning, not by Yes/No', () => {
    expect(classify(q('B2.1'), ans('yes'))).toBe('secure'); // authorization enforced
    expect(classify(q('B2.1'), ans('no'))).toBe('weak');
    expect(classify(q('B4.2'), ans('yes'))).toBe('weak'); // users can influence instructions
    expect(classify(q('B4.2'), ans('no'))).toBe('secure');
    expect(classify(q('B7.3'), ans('yes'))).toBe('info'); // agent persists memory: capability
    expect(classify(q('B2.1'), ans('unknown'))).toBe('gap');
    expect(classify(q('B2.1'), ans('na'))).toBe('na');
    expect(classify(q('B2.1'), undefined)).toBe('unanswered');
  });
});

describe('posture scoring and findings', () => {
  it('scores components and the assessment', () => {
    const a = instantiateTemplate(TEMPLATES[1]);
    const backend = a.components.find((c) => c.type === 'app_backend')!;
    expect(componentPosture(a, backend).score).toBeNull();
    a.answers[`${backend.id}::B2.1`] = ans('yes');
    a.answers[`${backend.id}::B2.3`] = ans('no', 'Validation only on the UI');
    a.answers[`${backend.id}::B2.5`] = ans('unknown');
    const p = componentPosture(a, backend);
    expect(p).toEqual({ secure: 1, weak: 1, gap: 1, score: 33 });
    expect(overallPosture(a).weak).toBe(1);
    const w = weakAnswers(a);
    expect(w).toHaveLength(1);
    expect(w[0].question.id).toBe('B2.3');
    expect(w[0].answer.note).toBe('Validation only on the UI');
  });

  it('relevant weak answers raise threat likelihood; unrelated ones do not', () => {
    const a = instantiateTemplate(TEMPLATES[1]);
    const sandbox = a.components.find((c) => c.type === 'code_sandbox')!;
    const rule = THREAT_RULES.find((r) => r.id === 'OUT-CODE-EXEC')!;
    const base = suggestRating(a, rule, [sandbox.id]).likelihood;
    a.answers[`${sandbox.id}::B9.4`] = ans('no'); // packages not controlled: related (B9), not a rule signal
    const after = suggestRating(a, rule, [sandbox.id]);
    expect(after.likelihood).toBe(Math.min(4, base + 1));
    expect(after.signals.join(' ')).toContain('B9.4');

    const agent = a.components.find((c) => c.type === 'agent')!;
    const misinfoBase = suggestRating(a, THREAT_RULES.find((r) => r.id === 'MON-TAMPER')!, [agent.id]).likelihood;
    a.answers[`${agent.id}::B7.1`] = ans('no'); // B7 is unrelated to the monitoring domain
    expect(suggestRating(a, THREAT_RULES.find((r) => r.id === 'MON-TAMPER')!, [agent.id]).likelihood).toBe(misinfoBase);
  });
});
