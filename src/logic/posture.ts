import { getComponentType } from '../library/catalog';
import { QUESTIONS, questionsForAreas, type Question } from '../library/questions';
import { answerKey, type Answer, type Assessment, type Component } from '../model/types';

/**
 * Security posture from Appendix B answers. Each question knows which answer
 * is the secure one (Question.secure), so answers become findings:
 *  secure – answer matches the secure design
 *  weak   – answer indicates a weakness (a security finding)
 *  gap    – "Unknown" (tracked gap, never an implicit pass)
 *  na/info/unanswered – excluded from the score
 */
export type Finding = 'secure' | 'weak' | 'gap' | 'na' | 'info' | 'unanswered';

export function classify(q: Question, ans: Answer | undefined): Finding {
  if (!ans) return 'unanswered';
  if (ans.status === 'unknown') return 'gap';
  if (ans.status === 'na') return 'na';
  const secure = q.secure ?? 'yes';
  if (secure === 'info') return 'info';
  return ans.status === secure ? 'secure' : 'weak';
}

export interface Posture {
  secure: number;
  weak: number;
  gap: number;
  /** 0–100, or null when nothing scorable has been answered. */
  score: number | null;
}

const empty = (): Posture => ({ secure: 0, weak: 0, gap: 0, score: null });

function finish(p: Posture): Posture {
  const n = p.secure + p.weak + p.gap;
  return { ...p, score: n ? Math.round((p.secure / n) * 100) : null };
}

export function componentPosture(a: Assessment, c: Component): Posture {
  const p = empty();
  for (const q of questionsForAreas(getComponentType(c.type).areas)) {
    const f = classify(q, a.answers[answerKey(c.id, q.id)]);
    if (f === 'secure' || f === 'weak' || f === 'gap') p[f] += 1;
  }
  return finish(p);
}

export function overallPosture(a: Assessment): Posture {
  const p = empty();
  for (const c of a.components) {
    const cp = componentPosture(a, c);
    p.secure += cp.secure;
    p.weak += cp.weak;
    p.gap += cp.gap;
  }
  return finish(p);
}

export interface WeakAnswer {
  component: Component;
  question: Question;
  answer: Answer;
}

/** Every answer that indicates a weakness, across all components (regardless of tier). */
export function weakAnswers(a: Assessment): WeakAnswer[] {
  const qById = new Map(QUESTIONS.map((q) => [q.id, q]));
  const out: WeakAnswer[] = [];
  for (const c of a.components) {
    const areas = new Set(getComponentType(c.type).areas);
    for (const [key, answer] of Object.entries(a.answers)) {
      const [cid, qid] = key.split('::');
      if (cid !== c.id) continue;
      const q = qById.get(qid);
      if (!q || !areas.has(q.area)) continue;
      if (classify(q, answer) === 'weak') out.push({ component: c, question: q, answer });
    }
  }
  return out.sort((x, y) => x.question.tier - y.question.tier || x.question.id.localeCompare(y.question.id, undefined, { numeric: true }));
}
