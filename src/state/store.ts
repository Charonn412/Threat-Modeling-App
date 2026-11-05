import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { newAssessment, newBoundary, newComponent, newFlow } from '../model/factory';
import {
  answerKey,
  emptyAnswer,
  type Answer,
  type Assessment,
  type Component,
  type Flow,
  type Intake,
  type Objectives,
  type SignOff,
  type Control,
  type RiskMatrix,
  type Threat,
  type TrustBoundary,
} from '../model/types';
import { NODE_W } from '../logic/analysis';
import type { DiagramSuggestion } from '../library/questions';
import { migrate } from '../io/file';
import { emptyThreat, nextThreatRef, refreshThreats, type RefreshResult } from '../logic/threats';
import { emptyControl, generateControls } from '../logic/controls';
import { catalogVersions } from '../library/frameworks';

export type Step = 'start' | 'intake' | 'architecture' | 'gaps' | 'objectives' | 'threats' | 'risk' | 'report' | 'settings' | 'libraries' | 'validation';
export type Selection = { kind: 'component' | 'flow' | 'boundary'; id: string } | null;

export interface Layers {
  data: boolean;
  control: boolean;
  boundaries: boolean;
  labels: boolean;
}

interface State {
  assessment: Assessment | null;
  step: Step;
  selection: Selection;
  layers: Layers;
  showAllTiers: boolean;

  setStep(step: Step): void;
  load(a: Assessment): void;
  startBlank(): void;
  close(): void;
  replaceAssessment(a: Assessment): void;

  updateIntake(patch: Partial<Intake>): void;

  addComponent(type: string, position: { x: number; y: number }): string;
  updateComponent(id: string, patch: Partial<Component>): void;
  removeComponent(id: string): void;

  addFlow(source: string, target: string, patch?: Partial<Flow>): string | null;
  updateFlow(id: string, patch: Partial<Flow>): void;
  removeFlow(id: string): void;

  addBoundary(position: { x: number; y: number }): string;
  updateBoundary(id: string, patch: Partial<TrustBoundary>): void;
  removeBoundary(id: string): void;

  setAnswer(targetId: string, questionId: string, patch: Partial<Answer>): void;
  clearAnswer(targetId: string, questionId: string): void;
  applyDiagramSuggestion(fromComponentId: string, s: DiagramSuggestion): void;

  updateObjectives(patch: Partial<Objectives>): void;

  refreshThreats(): RefreshResult | null;
  updateThreat(id: string, patch: Partial<Threat>): void;
  addCustomThreat(): string;
  removeThreat(id: string): void;
  selectedThreat: string | null;
  selectThreat(id: string | null): void;

  updateRiskMatrix(m: RiskMatrix): void;
  updateSignOff(patch: Partial<SignOff>): void;

  generateControls(): { added: number; linked: number } | null;
  addControl(): string;
  updateControl(id: string, patch: Partial<Control>): void;
  removeControl(id: string): void;
  selectedControl: string | null;
  selectControl(id: string | null): void;

  select(sel: Selection): void;
  toggleLayer(k: keyof Layers): void;
  setShowAllTiers(v: boolean): void;
}

const touch = (a: Assessment): Assessment => ({ ...a, updatedAt: new Date().toISOString() });

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const mutate = (fn: (a: Assessment) => Assessment) => {
        const a = get().assessment;
        if (!a) return;
        set({ assessment: touch(fn(a)) });
      };

      return {
        assessment: null,
        step: 'start',
        selection: null,
        layers: { data: true, control: true, boundaries: true, labels: true },
        showAllTiers: false,

        setStep: (step) => set({ step }),
        load: (a) => set({ assessment: a, selection: null, selectedThreat: null, step: 'intake' }),
        startBlank: () => set({ assessment: newAssessment(), selection: null, step: 'intake' }),
        close: () => set({ assessment: null, selection: null, step: 'start' }),
        replaceAssessment: (a) => set({ assessment: touch(a) }),

        updateIntake: (patch) => mutate((a) => ({ ...a, intake: { ...a.intake, ...patch } })),

        addComponent: (type, position) => {
          const c = newComponent(type, position);
          mutate((a) => ({ ...a, components: [...a.components, c] }));
          set({ selection: { kind: 'component', id: c.id } });
          return c.id;
        },
        updateComponent: (id, patch) =>
          mutate((a) => ({ ...a, components: a.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
        removeComponent: (id) => {
          mutate((a) => {
            const answers = Object.fromEntries(Object.entries(a.answers).filter(([k]) => !k.startsWith(`${id}::`)));
            return {
              ...a,
              components: a.components.filter((c) => c.id !== id),
              flows: a.flows.filter((f) => f.source !== id && f.target !== id),
              answers,
            };
          });
          set({ selection: null });
        },

        addFlow: (source, target, patch = {}) => {
          if (source === target) return null;
          const f = newFlow(source, target, patch);
          mutate((a) => ({ ...a, flows: [...a.flows, f] }));
          set({ selection: { kind: 'flow', id: f.id } });
          return f.id;
        },
        updateFlow: (id, patch) => mutate((a) => ({ ...a, flows: a.flows.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
        removeFlow: (id) => {
          mutate((a) => ({ ...a, flows: a.flows.filter((f) => f.id !== id) }));
          set({ selection: null });
        },

        addBoundary: (position) => {
          const b = newBoundary('New trust boundary', 'other', { ...position, width: 420, height: 260 });
          mutate((a) => ({ ...a, boundaries: [...a.boundaries, b] }));
          set({ selection: { kind: 'boundary', id: b.id } });
          return b.id;
        },
        updateBoundary: (id, patch) =>
          mutate((a) => ({ ...a, boundaries: a.boundaries.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
        removeBoundary: (id) => {
          mutate((a) => ({ ...a, boundaries: a.boundaries.filter((b) => b.id !== id) }));
          set({ selection: null });
        },

        setAnswer: (targetId, questionId, patch) =>
          mutate((a) => {
            const key = answerKey(targetId, questionId);
            const prev = a.answers[key] ?? emptyAnswer();
            return { ...a, answers: { ...a.answers, [key]: { ...prev, ...patch } } };
          }),
        clearAnswer: (targetId, questionId) =>
          mutate((a) => {
            const answers = { ...a.answers };
            delete answers[answerKey(targetId, questionId)];
            return { ...a, answers };
          }),

        applyDiagramSuggestion: (fromId, s) => {
          const a = get().assessment;
          const from = a?.components.find((c) => c.id === fromId);
          if (!a || !from) return;
          const offsetX = s.direction === 'out' ? NODE_W + 80 : -(NODE_W + 80);
          // Nudge down until free of overlap with existing nodes.
          const pos = { x: from.position.x + offsetX, y: from.position.y };
          while (a.components.some((c) => Math.abs(c.position.x - pos.x) < NODE_W && Math.abs(c.position.y - pos.y) < 70)) pos.y += 90;
          const c = newComponent(s.addType, pos);
          const f = s.direction === 'out' ? newFlow(from.id, c.id, { label: s.flowLabel }) : newFlow(c.id, from.id, { label: s.flowLabel });
          mutate((x) => ({ ...x, components: [...x.components, c], flows: [...x.flows, f] }));
          set({ selection: { kind: 'component', id: c.id } });
        },

        updateObjectives: (patch) =>
          mutate((a) => ({ ...a, objectives: { ...a.objectives, ...patch, statements: { ...a.objectives.statements, ...(patch.statements ?? {}) } } })),

        refreshThreats: () => {
          const a = get().assessment;
          if (!a) return null;
          const r = refreshThreats(a);
          const changed = r.added || r.removed || JSON.stringify(r.threats) !== JSON.stringify(a.threats);
          if (changed) mutate((x) => ({ ...x, threats: r.threats, frameworkVersions: catalogVersions() }));
          return r;
        },
        updateThreat: (id, patch) =>
          mutate((a) => ({
            ...a,
            threats: a.threats.map((t) => {
              if (t.id !== id) return t;
              const scenarioEdit = ['title', 'actor', 'asset', 'objectives', 'preconditions', 'attackPath', 'impact', 'frameworks', 'patterns', 'domain'].some((k) => k in patch);
              const ratingEdit = 'inherentLikelihood' in patch || 'inherentImpact' in patch;
              return {
                ...t,
                ...patch,
                edited: t.edited || scenarioEdit,
                ratingSuggested: ratingEdit ? false : t.ratingSuggested,
              };
            }),
          })),
        addCustomThreat: () => {
          const a = get().assessment!;
          const t = { ...emptyThreat(nextThreatRef(a)), title: 'New threat scenario', edited: true };
          mutate((x) => ({ ...x, threats: [...x.threats, t] }));
          set({ selectedThreat: t.id });
          return t.id;
        },
        removeThreat: (id) => {
          mutate((a) => ({
            ...a,
            threats: a.threats.filter((t) => t.id !== id),
            controls: a.controls.map((c) => ({ ...c, threatIds: c.threatIds.filter((x) => x !== id) })),
          }));
          set({ selectedThreat: null });
        },
        selectedThreat: null,
        selectThreat: (selectedThreat) => set({ selectedThreat }),

        generateControls: () => {
          const a = get().assessment;
          if (!a) return null;
          const r = generateControls(a);
          if (r.added || r.linked) mutate((x) => ({ ...x, controls: r.controls }));
          return { added: r.added, linked: r.linked };
        },
        addControl: () => {
          const c = emptyControl(get().assessment!.controls);
          mutate((a) => ({ ...a, controls: [...a.controls, c] }));
          set({ selectedControl: c.id });
          return c.id;
        },
        updateControl: (id, patch) => mutate((a) => ({ ...a, controls: a.controls.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
        removeControl: (id) => {
          mutate((a) => ({ ...a, controls: a.controls.filter((c) => c.id !== id) }));
          set({ selectedControl: null });
        },
        selectedControl: null,
        selectControl: (selectedControl) => set({ selectedControl }),
        updateSignOff: (patch) => mutate((a) => ({ ...a, signOff: { ...a.signOff, ...patch } })),
        updateRiskMatrix: (m) => mutate((a) => ({ ...a, settings: { ...a.settings, riskMatrix: m } })),

        select: (selection) => set({ selection }),
        toggleLayer: (k) => set({ layers: { ...get().layers, [k]: !get().layers[k] } }),
        setShowAllTiers: (showAllTiers) => set({ showAllTiers }),
      };
    },
    {
      name: 'ai-threat-modeler',
      version: 1,
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          // Storage blocked (private mode, sandboxed preview): fall back to memory.
          const mem = new Map<string, string>();
          return {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
          };
        }
      }),
      partialize: (s) => ({ assessment: s.assessment, step: s.step, layers: s.layers, showAllTiers: s.showAllTiers }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        let assessment: Assessment | null = null;
        try {
          assessment = p.assessment ? migrate(p.assessment) : null;
        } catch {
          assessment = null;
        }
        return { ...current, ...p, assessment, step: assessment ? (p.step ?? 'intake') : 'start' };
      },
    },
  ),
);
