import type { AreaId, Category, Plane } from '../model/types';

export interface ComponentType {
  id: string;
  label: string;
  category: Category;
  /** Appendix B areas whose questions apply to this component. */
  areas: AreaId[];
  plane: Plane;
  /** Short glyph shown on the node. */
  glyph: string;
  description: string;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  actors: 'Actors',
  entry: 'Entry points',
  application: 'Application',
  ai: 'AI processing',
  data: 'Data & knowledge',
  capabilities: 'Tools & capabilities',
  control: 'Control plane & ops',
  effects: 'Approvals & effects',
};

export const CATEGORY_ORDER: Category[] = [
  'actors',
  'entry',
  'application',
  'ai',
  'data',
  'capabilities',
  'control',
  'effects',
];

/** Built-in component catalog. The active catalog (with library edits applied) is COMPONENT_TYPES. */
export const BUILTIN_COMPONENT_TYPES: ComponentType[] = [
  // Actors (Section 7)
  { id: 'end_user', label: 'End user', category: 'actors', areas: [], plane: 'data', glyph: '👤', description: 'Employee, customer, partner or public user.' },
  { id: 'admin_user', label: 'Administrator / operator', category: 'actors', areas: ['B13'], plane: 'control', glyph: '🛠', description: 'Configures, deploys or operates the system.' },
  { id: 'developer', label: 'Developer / ML engineer', category: 'actors', areas: ['B12', 'B13'], plane: 'control', glyph: '👩‍💻', description: 'Authors prompts, code, models or pipelines.' },
  { id: 'external_system', label: 'External system / caller', category: 'actors', areas: ['B10', 'B17'], plane: 'data', glyph: '🌐', description: 'Service, partner or another agent calling in.' },
  { id: 'human_approver', label: 'Human approver', category: 'actors', areas: ['B16'], plane: 'data', glyph: '✅', description: 'Reviews and approves consequential actions.' },

  // Entry points (B1)
  { id: 'web_ui', label: 'Web / mobile UI', category: 'entry', areas: ['B1'], plane: 'data', glyph: '🖥', description: 'Browser or mobile client.' },
  { id: 'chat_ui', label: 'Chat interface', category: 'entry', areas: ['B1'], plane: 'data', glyph: '💬', description: 'Chat, copilot pane, Slack/Teams bot front end.' },
  { id: 'public_api', label: 'API / SDK endpoint', category: 'entry', areas: ['B1', 'B10'], plane: 'data', glyph: '🔌', description: 'Programmatic entry point exposed to callers.' },
  { id: 'file_upload', label: 'File / media upload', category: 'entry', areas: ['B1'], plane: 'data', glyph: '📎', description: 'Documents, images, audio supplied by users.' },
  { id: 'event_webhook', label: 'Event / webhook / batch', category: 'entry', areas: ['B1', 'B10'], plane: 'data', glyph: '⚡', description: 'Event bus, webhook, scheduled or batch trigger.' },

  // Application (B2, B10, identity)
  { id: 'app_backend', label: 'Application backend', category: 'application', areas: ['B2'], plane: 'data', glyph: '⚙️', description: 'Server-side services and business logic.' },
  { id: 'api_gateway', label: 'API gateway', category: 'application', areas: ['B10'], plane: 'data', glyph: '🚪', description: 'Ingress / egress gateway, WAF, rate limiting.' },
  { id: 'identity_provider', label: 'Identity provider', category: 'application', areas: ['B1', 'B13'], plane: 'control', glyph: '🪪', description: 'SSO / OAuth / workload identity issuer.' },
  { id: 'secrets_manager', label: 'Secrets / key manager', category: 'application', areas: ['B14'], plane: 'control', glyph: '🔑', description: 'Vault, KMS, key vault, secret store.' },

  // AI processing (B3, B4, B6, B7)
  { id: 'model_gateway', label: 'Model gateway / router', category: 'ai', areas: ['B3', 'B10'], plane: 'data', glyph: '🔀', description: 'Brokers, routes and meters model access.' },
  { id: 'model_endpoint', label: 'Model / inference endpoint', category: 'ai', areas: ['B3'], plane: 'data', glyph: '🧠', description: 'Hosted or self-hosted model (LLM or ML).' },
  { id: 'prompt_assembly', label: 'Prompt & context assembly', category: 'ai', areas: ['B4'], plane: 'data', glyph: '🧩', description: 'Builds system/user/retrieved context for the model.' },
  { id: 'guardrail', label: 'Guardrail / classifier', category: 'ai', areas: ['B4', 'B15'], plane: 'data', glyph: '🛡', description: 'Input/output filters, moderation, PII redaction.' },
  { id: 'agent', label: 'Agent', category: 'ai', areas: ['B7'], plane: 'data', glyph: '🤖', description: 'Plans and acts using tools toward a task.' },
  { id: 'orchestrator', label: 'Orchestrator / planner', category: 'ai', areas: ['B7'], plane: 'data', glyph: '🎛', description: 'Coordinates multi-step or multi-agent work.' },
  { id: 'memory_store', label: 'Memory / conversation state', category: 'ai', areas: ['B6', 'B11'], plane: 'data', glyph: '🗂', description: 'Short/long-term memory, profile, task state.' },

  // Data & knowledge (B5, B11, B12)
  { id: 'rag_retriever', label: 'Retriever (RAG)', category: 'data', areas: ['B5'], plane: 'data', glyph: '🔎', description: 'Query-time retrieval and ranking.' },
  { id: 'ingestion_pipeline', label: 'Ingestion / indexing pipeline', category: 'data', areas: ['B5'], plane: 'data', glyph: '📥', description: 'Parsing, OCR, chunking, embedding, indexing.' },
  { id: 'vector_store', label: 'Vector store / index', category: 'data', areas: ['B5', 'B11'], plane: 'data', glyph: '🧮', description: 'Embeddings and metadata index.' },
  { id: 'knowledge_source', label: 'Knowledge source', category: 'data', areas: ['B5', 'B17'], plane: 'data', glyph: '📚', description: 'SharePoint, Confluence, file shares, websites.' },
  { id: 'database', label: 'Database', category: 'data', areas: ['B11'], plane: 'data', glyph: '🛢', description: 'Relational / document database.' },
  { id: 'object_storage', label: 'Object / file storage', category: 'data', areas: ['B11'], plane: 'data', glyph: '🪣', description: 'Blob, bucket or file storage.' },
  { id: 'cache', label: 'Cache', category: 'data', areas: ['B11'], plane: 'data', glyph: '⚡', description: 'Response, embedding or session cache.' },
  { id: 'training_pipeline', label: 'Training / fine-tuning pipeline', category: 'data', areas: ['B12'], plane: 'control', glyph: '🏋', description: 'Datasets, training, evaluation, release.' },
  { id: 'model_registry', label: 'Model registry / artifacts', category: 'data', areas: ['B12', 'B11'], plane: 'control', glyph: '📦', description: 'Weights, adapters, model versions.' },

  // Tools & capabilities (B8, B9, B10, B17)
  { id: 'tool_connector', label: 'Tool / connector', category: 'capabilities', areas: ['B8'], plane: 'data', glyph: '🔧', description: 'CRM, ticketing, email, files, DB query, etc.' },
  { id: 'mcp_server', label: 'MCP server / plugin', category: 'capabilities', areas: ['B8', 'B17'], plane: 'data', glyph: '🧷', description: 'Model Context Protocol server or plugin.' },
  { id: 'code_sandbox', label: 'Code execution sandbox', category: 'capabilities', areas: ['B9'], plane: 'data', glyph: '🧪', description: 'Runs generated code, SQL or shell.' },
  { id: 'browser_automation', label: 'Browser / web access', category: 'capabilities', areas: ['B9', 'B17'], plane: 'data', glyph: '🧭', description: 'Web search, browsing, browser automation.' },
  { id: 'enterprise_api', label: 'Enterprise system / API', category: 'capabilities', areas: ['B10'], plane: 'data', glyph: '🏢', description: 'Internal system of record or service API.' },
  { id: 'third_party_service', label: 'Third-party service', category: 'capabilities', areas: ['B17', 'B10'], plane: 'data', glyph: '🤝', description: 'Vendor SaaS or external data provider.' },

  // Control plane & operations (B13, B14, B15)
  { id: 'admin_console', label: 'Admin console / control plane', category: 'control', areas: ['B13'], plane: 'control', glyph: '🧰', description: 'Configures prompts, tools, models, policies.' },
  { id: 'cicd', label: 'CI/CD & deployment', category: 'control', areas: ['B13', 'B14'], plane: 'control', glyph: '🚀', description: 'Build and release pipeline for app/prompts/models.' },
  { id: 'runtime_host', label: 'Runtime / hosting', category: 'control', areas: ['B14'], plane: 'control', glyph: '☁️', description: 'Containers, serverless, VMs, network segments.' },
  { id: 'monitoring', label: 'Logging & monitoring', category: 'control', areas: ['B15'], plane: 'control', glyph: '📈', description: 'Telemetry, SIEM, alerting, incident response.' },

  // Approvals & effects (B16)
  { id: 'approval_gate', label: 'Approval gate', category: 'effects', areas: ['B16'], plane: 'data', glyph: '⛔', description: 'Deterministic gate requiring human approval.' },
  { id: 'downstream_action', label: 'Downstream effect', category: 'effects', areas: ['B16'], plane: 'data', glyph: '🎯', description: 'Record change, payment, message, access change.' },
];

// Live binding: replaced when library edits are applied (see registry.ts).
export let COMPONENT_TYPES: ComponentType[] = BUILTIN_COMPONENT_TYPES;
let BY_ID = new Map(COMPONENT_TYPES.map((t) => [t.id, t]));

export function _setComponentTypes(next: ComponentType[]) {
  COMPONENT_TYPES = next;
  BY_ID = new Map(next.map((t) => [t.id, t]));
}

export function getComponentType(id: string): ComponentType {
  const t = BY_ID.get(id);
  if (!t) {
    return { id, label: id, category: 'application', areas: [], plane: 'data', glyph: '❔', description: 'Unknown component type' };
  }
  return t;
}

export function hasComponentType(id: string): boolean {
  return BY_ID.has(id);
}
