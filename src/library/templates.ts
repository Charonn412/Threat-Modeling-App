import { newAssessment, newBoundary, newComponent, newFlow } from '../model/factory';
import type { Assessment, BoundaryKind, Component, Flow, Intake } from '../model/types';

/**
 * Starter templates: typical components, flows and trust boundaries for a
 * system pattern. Everything is editable after creation.
 */

interface TComp {
  key: string;
  type: string;
  name?: string;
  x: number;
  y: number;
}
interface TFlow extends Partial<Omit<Flow, 'id' | 'source' | 'target'>> {
  from: string;
  to: string;
  label: string;
}
interface TBoundary {
  name: string;
  kind: BoundaryKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  intake: Partial<Intake>;
  boundaries: TBoundary[];
  components: TComp[];
  flows: TFlow[];
}

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'rag-assistant',
    name: 'RAG knowledge assistant',
    description: 'Chat assistant answering from enterprise documents via retrieval, using a hosted LLM.',
    intake: { systemTypes: ['genai', 'rag'], criticality: 'advisory', autonomy: 'none' },
    boundaries: [
      { name: 'User zone', kind: 'user-app', x: 0, y: 140, w: 220, h: 160 },
      { name: 'Application trust zone', kind: 'public-private', x: 250, y: 60, w: 760, h: 470 },
      { name: 'Model provider (external)', kind: 'app-provider', x: 1040, y: 60, w: 250, h: 160 },
      { name: 'Enterprise knowledge sources', kind: 'app-enterprise', x: 1040, y: 260, w: 250, h: 300 },
    ],
    components: [
      { key: 'user', type: 'end_user', name: 'Employee', x: 20, y: 200 },
      { key: 'chat', type: 'chat_ui', name: 'Assistant chat UI', x: 280, y: 200 },
      { key: 'idp', type: 'identity_provider', name: 'Enterprise SSO', x: 280, y: 420 },
      { key: 'backend', type: 'app_backend', name: 'Assistant API', x: 520, y: 200 },
      { key: 'logs', type: 'monitoring', name: 'Logging & SIEM', x: 520, y: 420 },
      { key: 'prompt', type: 'prompt_assembly', name: 'Prompt builder', x: 780, y: 100 },
      { key: 'retriever', type: 'rag_retriever', name: 'Retriever', x: 780, y: 280 },
      { key: 'vector', type: 'vector_store', name: 'Vector index', x: 780, y: 440 },
      { key: 'model', type: 'model_endpoint', name: 'Hosted LLM', x: 1070, y: 110 },
      { key: 'ingest', type: 'ingestion_pipeline', name: 'Ingestion pipeline', x: 1070, y: 300 },
      { key: 'source', type: 'knowledge_source', name: 'Document repository', x: 1070, y: 460 },
    ],
    flows: [
      { from: 'user', to: 'chat', label: 'question + attachments', contentOrigin: 'user', trustLevel: 'untrusted' },
      { from: 'chat', to: 'idp', label: 'SSO sign-in', plane: 'control', protocol: 'OIDC' },
      { from: 'chat', to: 'backend', label: 'authenticated request', contentOrigin: 'user', protocol: 'HTTPS' },
      { from: 'backend', to: 'retriever', label: 'query + user entitlements', contentOrigin: 'user' },
      { from: 'retriever', to: 'vector', label: 'ACL-filtered similarity search' },
      { from: 'retriever', to: 'prompt', label: 'retrieved chunks', contentOrigin: 'retrieved', trustLevel: 'untrusted' },
      { from: 'backend', to: 'prompt', label: 'user input + system instructions', contentOrigin: 'user' },
      { from: 'prompt', to: 'model', label: 'assembled prompt', protocol: 'HTTPS' },
      { from: 'model', to: 'backend', label: 'completion', contentOrigin: 'model', trustLevel: 'untrusted' },
      { from: 'backend', to: 'chat', label: 'answer + citations', contentOrigin: 'model' },
      { from: 'source', to: 'ingest', label: 'documents + ACLs', contentOrigin: 'retrieved' },
      { from: 'ingest', to: 'vector', label: 'chunks + embeddings + ACL metadata', contentOrigin: 'retrieved' },
      { from: 'backend', to: 'logs', label: 'telemetry + audit events', plane: 'control' },
    ],
  },
  {
    id: 'agent-with-tools',
    name: 'Agent with tools',
    description: 'Autonomous agent that plans with an LLM, uses tools and enterprise APIs, with memory and approval gates.',
    intake: { systemTypes: ['genai', 'agentic'], criticality: 'action-taking', autonomy: 'bounded' },
    boundaries: [
      { name: 'User zone', kind: 'user-app', x: 0, y: 140, w: 220, h: 160 },
      { name: 'Agent runtime', kind: 'public-private', x: 250, y: 60, w: 520, h: 520 },
      { name: 'Model provider (external)', kind: 'app-provider', x: 800, y: 20, w: 260, h: 140 },
      { name: 'Tool execution zone', kind: 'model-tool', x: 800, y: 190, w: 260, h: 390 },
      { name: 'Enterprise systems', kind: 'app-enterprise', x: 1090, y: 190, w: 260, h: 390 },
    ],
    components: [
      { key: 'user', type: 'end_user', name: 'Requesting user', x: 20, y: 200 },
      { key: 'chat', type: 'chat_ui', name: 'Agent chat UI', x: 280, y: 100 },
      { key: 'backend', type: 'app_backend', name: 'Agent service', x: 280, y: 260 },
      { key: 'agent', type: 'agent', name: 'Task agent', x: 520, y: 260 },
      { key: 'memory', type: 'memory_store', name: 'Agent memory', x: 520, y: 420 },
      { key: 'logs', type: 'monitoring', name: 'Logging & SIEM', x: 280, y: 480 },
      { key: 'gateway', type: 'model_gateway', name: 'Model gateway', x: 520, y: 100 },
      { key: 'model', type: 'model_endpoint', name: 'Hosted LLM', x: 830, y: 60 },
      { key: 'crm', type: 'tool_connector', name: 'CRM tool (read/write)', x: 830, y: 230 },
      { key: 'sandbox', type: 'code_sandbox', name: 'Code sandbox', x: 830, y: 350 },
      { key: 'gate', type: 'approval_gate', name: 'Action approval gate', x: 830, y: 480 },
      { key: 'crmapi', type: 'enterprise_api', name: 'CRM API', x: 1120, y: 230 },
      { key: 'approver', type: 'human_approver', name: 'Approver', x: 1120, y: 380 },
      { key: 'effect', type: 'downstream_action', name: 'Customer record change', x: 1120, y: 500 },
    ],
    flows: [
      { from: 'user', to: 'chat', label: 'task request', contentOrigin: 'user', trustLevel: 'untrusted' },
      { from: 'chat', to: 'backend', label: 'authenticated request', contentOrigin: 'user', protocol: 'HTTPS' },
      { from: 'backend', to: 'agent', label: 'task + user context', contentOrigin: 'user' },
      { from: 'agent', to: 'gateway', label: 'plan / reasoning prompt' },
      { from: 'gateway', to: 'model', label: 'brokered inference', protocol: 'HTTPS' },
      { from: 'agent', to: 'memory', label: 'memory read/write', contentOrigin: 'model' },
      { from: 'agent', to: 'crm', label: 'tool call (model-generated args)', contentOrigin: 'model', trustLevel: 'untrusted' },
      { from: 'crm', to: 'crmapi', label: 'API request (scoped token)', protocol: 'HTTPS' },
      { from: 'crmapi', to: 'agent', label: 'tool result', contentOrigin: 'tool', trustLevel: 'untrusted' },
      { from: 'agent', to: 'sandbox', label: 'generated code', contentOrigin: 'model', trustLevel: 'untrusted' },
      { from: 'agent', to: 'gate', label: 'proposed write action', contentOrigin: 'model' },
      { from: 'gate', to: 'approver', label: 'approval request (bound payload)' },
      { from: 'gate', to: 'effect', label: 'approved action' },
      { from: 'agent', to: 'logs', label: 'agent/tool audit events', plane: 'control' },
    ],
  },
];

// Live binding: replaced when library edits are applied (see registry.ts).
export let TEMPLATES: Template[] = BUILTIN_TEMPLATES;
export function _setTemplates(next: Template[]) {
  TEMPLATES = next;
}

export function instantiateTemplate(t: Template): Assessment {
  const a = newAssessment();
  a.templateId = t.id;
  a.intake = { ...a.intake, ...t.intake };
  const byKey = new Map<string, Component>();
  for (const c of t.components) {
    const comp = newComponent(c.type, { x: c.x, y: c.y }, c.name ? { name: c.name } : {});
    byKey.set(c.key, comp);
    a.components.push(comp);
  }
  for (const f of t.flows) {
    const { from, to, ...rest } = f;
    const s = byKey.get(from);
    const d = byKey.get(to);
    if (!s || !d) throw new Error(`Template ${t.id}: unknown flow endpoint ${from}→${to}`);
    a.flows.push(newFlow(s.id, d.id, rest));
  }
  a.boundaries = t.boundaries.map((b) => newBoundary(b.name, b.kind, { x: b.x, y: b.y, width: b.w, height: b.h }));
  return a;
}

/** Captures an assessment's architecture as a reusable starter template. */
export function templateFromAssessment(a: Assessment, id: string, name: string, description: string): Template {
  const keyOf = new Map(a.components.map((c, i) => [c.id, `c${i + 1}`]));
  return {
    id,
    name,
    description,
    intake: {
      systemTypes: [...a.intake.systemTypes],
      criticality: a.intake.criticality,
      autonomy: a.intake.autonomy,
      exposure: a.intake.exposure,
      deployment: [...a.intake.deployment],
    },
    boundaries: a.boundaries.map((b) => ({ name: b.name, kind: b.kind, x: b.position.x, y: b.position.y, w: b.width, h: b.height })),
    components: a.components.map((c) => ({ key: keyOf.get(c.id)!, type: c.type, name: c.name, x: c.position.x, y: c.position.y })),
    flows: a.flows
      .filter((f) => keyOf.has(f.source) && keyOf.has(f.target))
      .map((f) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, source, target, ...rest } = f;
        return { ...rest, from: keyOf.get(source)!, to: keyOf.get(target)!, label: f.label };
      }),
  };
}
