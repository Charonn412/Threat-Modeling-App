import type { AreaId, Tier } from '../model/types';

/**
 * Appendix B question bank. Each question has an assurance tier (1 Light,
 * 2 Standard, 3 Deep) and a kind: AI-specific or traditional security.
 * Traditional AppSec / cloud questions are deliberately part of every area
 * (spec §4a: traditional security baked in everywhere).
 *
 * A question may carry a diagram suggestion: answering "Yes" offers to add a
 * connected component (two-way sync, spec §5).
 */

export type QuestionKind = 'ai' | 'traditional';

export interface DiagramSuggestion {
  addType: string;
  /** 'out': new flow from this component to the new one; 'in': the reverse. */
  direction: 'out' | 'in';
  flowLabel: string;
  prompt: string;
}

export interface Question {
  id: string;
  area: AreaId;
  tier: Tier;
  kind: QuestionKind;
  text: string;
  suggest?: DiagramSuggestion;
}

export interface Area {
  id: AreaId;
  title: string;
  securePattern: string;
}

export const AREAS: Area[] = [
  { id: 'B1', title: 'User interface, client & entry points', securePattern: 'Use enterprise identity and session controls; derive identity server-side; bind every request to an authorized tenant and user; validate and scan files; enforce quotas and size limits; never trust client-supplied role/tenant fields; provide clear AI-use notices and safe error messages.' },
  { id: 'B2', title: 'Application backend & business logic', securePattern: 'Keep business logic and security policy in deterministic backend services; enforce authorization on every object/action; use typed schemas, allowlisted operations, idempotency keys, bounded retries/timeouts, and server-side secret management; isolate environments.' },
  { id: 'B3', title: 'Model, provider & inference endpoint', securePattern: 'Use approved model catalog/providers and pinned or governed model versions; minimize and classify outbound context; configure no-training/retention settings; use authenticated private endpoints where feasible; gateway model access; log model/version and routing; evaluate before upgrades; define fallback and provider exit plans.' },
  { id: 'B4', title: 'Prompt construction & context assembly', securePattern: 'Keep privileged instructions server-controlled and access-restricted; treat all user/retrieved/tool content as untrusted data; preserve provenance and delimit content; minimize context; prevent secret injection; version and test prompts; never rely on prompt text as an authorization boundary.' },
  { id: 'B5', title: 'RAG, knowledge sources & retrieval', securePattern: 'Enforce source authorization before ingestion and at retrieval; preserve ACLs and provenance; isolate indexes by tenant/security boundary; validate ingestion sources; scan and quarantine suspicious content; support deletion propagation and freshness; treat retrieved text as untrusted; test cross-user and cross-tenant leakage.' },
  { id: 'B6', title: 'Memory, conversation state & personalization', securePattern: 'Use explicit memory types and scopes; apply access controls and TTLs; minimize persisted data; treat writes as untrusted and validate them; require approval for high-impact persistent facts; support deletion and correction; audit memory changes; isolate user and tenant state.' },
  { id: 'B7', title: 'Agents, planners & orchestration', securePattern: 'Use narrowly scoped agents with explicit task contracts; constrain delegation and tool inheritance; pass minimal, typed context with provenance; enforce step/time/cost/recursion budgets; prevent self-granted privileges; isolate planning from execution; require policy checks and approvals before consequential actions; support stop and rollback.' },
  { id: 'B8', title: 'Tools, plugins, connectors & capabilities', securePattern: 'Use an allowlisted tool registry; least-privilege per-tool identities and narrow scopes; separate read/write capabilities; validate arguments against strict schemas and resource allowlists; enforce authorization in the tool service; isolate execution; require confirmation for sensitive/destructive/external actions; apply transaction limits; log complete calls; rotate/revoke credentials.' },
  { id: 'B9', title: 'Code execution, shell, notebooks & browser automation', securePattern: 'Use disposable sandboxed runtimes with no ambient credentials; deny network by default and allowlist destinations; isolate filesystem/process/container; enforce CPU, memory, time and storage quotas; scan dependencies/artifacts; mediate commands; block metadata services and secrets; require approval for production changes.' },
  { id: 'B10', title: 'APIs, gateways & service-to-service integrations', securePattern: 'Use authenticated service-to-service channels, audience-restricted tokens, mTLS where appropriate, object-level authorization, strict request/response schemas, replay protections, egress allowlists, rate limits, and centralized API inventory; do not permit arbitrary model-directed destinations.' },
  { id: 'B11', title: 'Data stores, vector databases, caches & file storage', securePattern: 'Encrypt at rest with managed keys; enforce least privilege and tenant isolation; preserve object-level ACLs in derived stores; design cache keys around authenticated identity and authorization context; minimize sensitive persistence; keep secrets out of embeddings/logs; test deletion and backup lifecycle.' },
  { id: 'B12', title: 'Training, fine-tuning, evaluation & model lifecycle', securePattern: 'Govern datasets and lineage; validate provenance and rights; scan and curate training data; separate duties for data/model release; protect and sign artifacts; use reproducible pipelines; gate release on documented evaluations; monitor drift and maintain rollback/retirement controls.' },
  { id: 'B13', title: 'Platform control plane & administration', securePattern: 'Separate control and data planes; enforce strong privileged access and just-in-time elevation; segregate duties; isolate tenants/environments; protect audit logs; apply secure baselines and configuration-as-code; monitor admin actions; periodically review privileges and provider assurance.' },
  { id: 'B14', title: 'Network, hosting, containers & infrastructure', securePattern: 'Apply hardened baselines, segmentation, least-privilege workload identities, private connectivity, restricted egress, signed/scanned images, non-root ephemeral workloads, secrets management, patching, and tested recovery.' },
  { id: 'B15', title: 'Logging, monitoring, evaluation & incident response', securePattern: 'Create privacy-aware end-to-end telemetry with correlation IDs; protect logs from tampering; monitor behavior and tool/action patterns; establish baselines and alert thresholds; maintain AI-specific incident playbooks; support kill switch, credential revocation, tool disablement, rollback and forensic preservation.' },
  { id: 'B16', title: 'Human review, approvals & downstream effects', securePattern: 'Use explicit approval gates for consequential, irreversible, external, financial, privileged or regulated actions; show context and consequences; bind approval to a specific immutable action payload; enforce separation of duties; expire approvals; fail closed when approval is absent; record decision and actor.' },
  { id: 'B17', title: 'Third parties, supply chain & external content', securePattern: 'Perform risk-based third-party due diligence; document shared responsibility and data terms; monitor material changes; pin and scan dependencies; validate external content as untrusted; maintain exit/portability and continuity plans.' },
];

const q = (
  id: string,
  tier: Tier,
  kind: QuestionKind,
  text: string,
  suggest?: DiagramSuggestion,
): Omit<Question, 'area'> => ({ id, tier, kind, text, suggest });

const RAW: Record<AreaId, Omit<Question, 'area'>[]> = {
  B1: [
    q('B1.1', 1, 'ai', 'Are all interfaces identified (web, mobile, chat, API, SDK, batch, event, webhook, file upload)?'),
    q('B1.2', 1, 'traditional', 'Are users authenticated with enterprise identity, with MFA or step-up for sensitive actions?', { addType: 'identity_provider', direction: 'out', flowLabel: 'authentication', prompt: 'Add the identity provider used to authenticate users?' }),
    q('B1.3', 1, 'traditional', 'Is tenant/user context derived server-side, so a caller cannot spoof another user or tenant?'),
    q('B1.4', 2, 'ai', 'Are uploads, URLs, pasted content, images, audio and files treated as untrusted input and scanned/validated?'),
    q('B1.5', 2, 'traditional', 'Are rate limits, request-size limits, abuse controls and bot controls applied?'),
    q('B1.6', 2, 'traditional', 'Are standard web protections in place (CSRF, CORS, CSP, output encoding, secure cookies/session handling)?'),
    q('B1.7', 2, 'ai', 'Can users see when AI is used, its limits, and how to report unsafe or incorrect behavior?'),
    q('B1.8', 3, 'ai', 'Is model output rendered safely in the client (no raw HTML/markdown/link injection, image-based exfiltration blocked)?'),
    q('B1.9', 3, 'traditional', 'Can users request deletion, correction, export, or escalation where required?'),
  ],
  B2: [
    q('B2.1', 1, 'traditional', 'Is authorization enforced server-side on every object and action, independent of model output?'),
    q('B2.2', 1, 'ai', 'Does the model call internal functions only through a controlled, mediating service?'),
    q('B2.3', 2, 'traditional', 'Does the backend validate input types, length, encoding, schemas and allowed operations?'),
    q('B2.4', 2, 'traditional', 'Are business invariants, transaction limits, segregation of duties and idempotency enforced?'),
    q('B2.5', 2, 'traditional', 'Are errors, retries and timeouts bounded so retries cannot duplicate an action?'),
    q('B2.6', 2, 'traditional', 'Are application secrets and configuration server-side and separated per environment?', { addType: 'secrets_manager', direction: 'out', flowLabel: 'secret retrieval', prompt: 'Add the secrets manager the backend uses?' }),
    q('B2.7', 3, 'traditional', 'Are SAST, dependency (SCA) scanning and secure code review applied to backend code?'),
    q('B2.8', 3, 'traditional', 'Are injection classes (SQL/NoSQL/command/template/deserialization) prevented when model output reaches backend logic?'),
  ],
  B3: [
    q('B3.1', 1, 'ai', 'Are the model(s), versions, modalities, endpoints and providers identified, including any dynamic routing?'),
    q('B3.2', 1, 'ai', 'Is it documented what data is sent to the provider, for what purpose, in which region, and under what retention/training terms?'),
    q('B3.3', 1, 'traditional', 'Is the endpoint authenticated, encrypted in transit, and reached over private networking where feasible?'),
    q('B3.4', 2, 'ai', 'Can provider-side model updates change behavior without a release, and are such changes detected and evaluated?'),
    q('B3.5', 2, 'traditional', 'Are model access quotas, abuse monitoring, fallback models and provider outages addressed?'),
    q('B3.6', 2, 'ai', 'Is model access brokered through a gateway that logs model/version and routing?', { addType: 'model_gateway', direction: 'in', flowLabel: 'brokered inference', prompt: 'Add a model gateway in front of this endpoint?' }),
    q('B3.7', 3, 'ai', 'Is the model evaluated for quality, safety, security and bias relevant to the use case?'),
    q('B3.8', 3, 'traditional', 'Is the shared-responsibility boundary with the provider documented, with evidence for relied-upon controls?'),
  ],
  B4: [
    q('B4.1', 1, 'ai', 'Are system/developer instructions server-controlled, access-restricted and stored outside user reach?'),
    q('B4.2', 1, 'ai', 'Can users, retrieved documents, tool outputs or prior conversations influence higher-trust instructions?'),
    q('B4.3', 2, 'ai', 'Are instructions separated from data, with source, provenance and trust labels preserved?'),
    q('B4.4', 2, 'traditional', 'Can context contain secrets, credentials, excessive personal data or cross-tenant content?'),
    q('B4.5', 2, 'ai', 'Are prompts versioned, reviewed, tested and deployed through change control?'),
    q('B4.6', 3, 'ai', 'Are context-window limits, truncation, ordering and conflicting instructions handled deterministically?'),
    q('B4.7', 3, 'ai', 'Are input/output guardrails applied, and is it understood they are not a security boundary?', { addType: 'guardrail', direction: 'out', flowLabel: 'screening', prompt: 'Add a guardrail / classifier component?' }),
  ],
  B5: [
    q('B5.1', 1, 'ai', 'Are all ingested repositories, databases, websites, file shares and records identified with owners?', { addType: 'knowledge_source', direction: 'in', flowLabel: 'source documents', prompt: 'Add a knowledge source feeding this component?' }),
    q('B5.2', 1, 'traditional', 'Does ingestion preserve source ACLs and metadata, and are permissions rechecked at query time?'),
    q('B5.3', 1, 'ai', 'Can retrieval return data across tenants, groups or security labels, and is this tested?'),
    q('B5.4', 2, 'ai', 'Can poisoned, malicious, stale or instruction-bearing documents enter the corpus?'),
    q('B5.5', 2, 'ai', 'Are parsing, OCR, chunking, embedding, indexing, deletion and re-indexing defined and controlled?'),
    q('B5.6', 2, 'traditional', 'Are source system credentials used for ingestion least-privilege and separately managed?'),
    q('B5.7', 3, 'ai', 'Are citations available, and can users open only sources they are authorized to access?'),
    q('B5.8', 3, 'traditional', 'Does deletion at the source propagate to chunks, embeddings, caches and backups?'),
  ],
  B6: [
    q('B6.1', 1, 'ai', 'Is it defined what is stored as short-term state, long-term memory, profile or task state?'),
    q('B6.2', 1, 'traditional', 'Is memory scoped to user, tenant, task and purpose so one user cannot influence another?'),
    q('B6.3', 2, 'ai', 'Can an agent write memory without review, and can untrusted input poison persistent memory?'),
    q('B6.4', 2, 'traditional', 'Are retention, expiry, correction, deletion and legal hold handled?'),
    q('B6.5', 3, 'traditional', 'Are memory reads/writes logged, versioned and recoverable?'),
  ],
  B7: [
    q('B7.1', 1, 'ai', 'Is each agent\'s exact task and allowed scope documented (task contract)?'),
    q('B7.2', 1, 'ai', 'Can agents plan multi-step work, loop, spawn subagents or delegate to other agents?', { addType: 'agent', direction: 'out', flowLabel: 'delegation (task + context)', prompt: 'Add the delegated subagent to the diagram?' }),
    q('B7.3', 1, 'ai', 'Does the agent persist long-term memory or state between sessions?', { addType: 'memory_store', direction: 'out', flowLabel: 'memory read/write', prompt: 'Add a memory store connected to this agent?' }),
    q('B7.4', 2, 'ai', 'Are maximum steps, execution time, token/cost budget, recursion and parallelism bounded?'),
    q('B7.5', 2, 'ai', 'Can an agent change its own tools, instructions, goals, permissions or routing?'),
    q('B7.6', 2, 'ai', 'Can the agent take consequential action directly, rather than proposing it to a separate executor with approval?', { addType: 'approval_gate', direction: 'out', flowLabel: 'proposed action', prompt: 'Add an approval gate between the agent and its consequential actions?' }),
    q('B7.7', 3, 'ai', 'Is context passed between agents minimal and typed, with provenance and trust labels retained?'),
    q('B7.8', 3, 'traditional', 'Does each agent run with a distinct workload identity, with delegation chains recorded?'),
    q('B7.9', 3, 'ai', 'Are conflicting outputs, failed tasks, retries and partial completion handled safely?'),
  ],
  B8: [
    q('B8.1', 1, 'ai', 'Are the exact operations exposed by this tool listed, with read and write actions separated?'),
    q('B8.2', 1, 'traditional', 'What identity does the tool use (delegated user, workload identity, shared service account, vendor token), and is it least-privilege?'),
    q('B8.3', 1, 'ai', 'Can tool arguments be influenced by prompt injection, and are arguments validated against strict schemas and destination allowlists?'),
    q('B8.4', 2, 'ai', 'Are high-impact actions gated by independent policy and human approval, with limits enforced?', { addType: 'approval_gate', direction: 'in', flowLabel: 'approved action', prompt: 'Add an approval gate in front of this tool?' }),
    q('B8.5', 2, 'traditional', 'Is authorization enforced inside the tool service rather than trusted from the caller?'),
    q('B8.6', 2, 'traditional', 'Are tool calls logged with caller, agent, arguments, result, timestamp and correlation ID?', { addType: 'monitoring', direction: 'out', flowLabel: 'tool-call audit events', prompt: 'Add logging & monitoring for tool calls?' }),
    q('B8.7', 3, 'traditional', 'How are connector updates, OAuth scopes, secrets rotation and tool supply-chain risk managed?'),
  ],
  B9: [
    q('B9.1', 1, 'ai', 'Can AI generate or execute code, shell commands, SQL, scripts or browser actions here?'),
    q('B9.2', 1, 'traditional', 'Is execution ephemeral, isolated, network-restricted and resource-limited?'),
    q('B9.3', 1, 'traditional', 'Is access to host files, credentials, cloud metadata services, internal networks and other tenants blocked?'),
    q('B9.4', 2, 'traditional', 'Are packages, dependencies, downloads and generated artifacts controlled and scanned?'),
    q('B9.5', 2, 'ai', 'Are commands allowlisted or mediated, with dangerous operations blocked?'),
    q('B9.6', 3, 'ai', 'Are outputs, files and browser destinations validated before being passed onward?'),
  ],
  B10: [
    q('B10.1', 1, 'traditional', 'Are the APIs called or exposed identified as internal, partner or public?'),
    q('B10.2', 1, 'traditional', 'Are services authenticated (mTLS, OAuth, workload identity) with constrained scopes and audiences?'),
    q('B10.3', 2, 'traditional', 'Are object-level authorization, schema validation, replay protection, rate limits and size controls enforced?'),
    q('B10.4', 2, 'ai', 'Can a model-generated URL or identifier cause SSRF, IDOR or access to unintended resources?'),
    q('B10.5', 2, 'traditional', 'Are destinations allowlisted and outbound network paths controlled?'),
    q('B10.6', 3, 'traditional', 'Are API versions, breaking changes, retries and error responses managed (no sensitive data in errors)?'),
  ],
  B11: [
    q('B11.1', 1, 'traditional', 'Is it known what is persisted here (prompts, outputs, embeddings, metadata, files, intermediate artifacts)?'),
    q('B11.2', 1, 'traditional', 'Are encryption at rest, key ownership, access control and tenant isolation implemented?'),
    q('B11.3', 2, 'ai', 'Are row/document-level permissions preserved in derived indexes and caches?'),
    q('B11.4', 2, 'traditional', 'Can cache keys or retrieval filters be manipulated to cross users or tenants?'),
    q('B11.5', 2, 'traditional', 'Are secrets excluded from logs, embeddings, indexes and debug traces?'),
    q('B11.6', 3, 'traditional', 'Are retention, backup expiry, restore and secure disposal verified?'),
  ],
  B12: [
    q('B12.1', 1, 'ai', 'Is a model trained or fine-tuned, and are datasets, labels, human feedback and synthetic data identified?'),
    q('B12.2', 1, 'ai', 'Are data rights, provenance, consent, quality, poisoning and sensitive attributes assessed?'),
    q('B12.3', 2, 'traditional', 'Is it controlled who can alter datasets, training code, weights, evaluation thresholds and release approvals?'),
    q('B12.4', 2, 'traditional', 'Are artifacts signed, versioned, stored securely and traceable to source data and code?'),
    q('B12.5', 2, 'ai', 'Are evaluations representative of intended use and adversarial cases, with regressions gated?'),
    q('B12.6', 3, 'ai', 'Are drift, retraining triggers, rollback and retirement handled?'),
    q('B12.7', 3, 'traditional', 'Are serialized model formats safe to load (no arbitrary code execution, e.g. pickle) and scanned?'),
  ],
  B13: [
    q('B13.1', 1, 'traditional', 'Is it controlled who can deploy models, register tools, alter prompts, configure gateways or change policies?'),
    q('B13.2', 1, 'traditional', 'Are admin and runtime identities separated, with privileged access time-bound and approved?'),
    q('B13.3', 2, 'traditional', 'Are tenants, workspaces, environments and projects isolated?'),
    q('B13.4', 2, 'ai', 'Can administrators bypass logging, safety controls, quotas or approvals?'),
    q('B13.5', 2, 'traditional', 'Are configuration changes (including prompts and tool registrations) reviewed, versioned and auditable?'),
    q('B13.6', 3, 'traditional', 'Are platform vulnerabilities, patching, secure defaults and provider controls verified?'),
  ],
  B14: [
    q('B14.1', 1, 'traditional', 'Are the compute, containers, serverless services, networks, endpoints and regions identified?'),
    q('B14.2', 1, 'traditional', 'Is ingress/egress restricted, with private endpoints and segmentation?'),
    q('B14.3', 2, 'traditional', 'Are workloads isolated from each other and from management planes?'),
    q('B14.4', 2, 'traditional', 'Are images, dependencies, patches, secrets and runtime configuration secured (signed/scanned images, non-root)?'),
    q('B14.5', 2, 'traditional', 'Are metadata services, host mounts, privileged containers and lateral movement paths restricted?'),
    q('B14.6', 3, 'traditional', 'Are resilience, backup, recovery and capacity protections defined and tested?'),
  ],
  B15: [
    q('B15.1', 1, 'traditional', 'Are events logged across UI, gateway, model, prompt, retrieval, agent, tool, identity and action layers?'),
    q('B15.2', 1, 'ai', 'Can the system be paused, tools disabled, credentials revoked, model rolled back or traffic redirected quickly?'),
    q('B15.3', 2, 'traditional', 'Can events be correlated end-to-end without unnecessarily storing sensitive prompt content?'),
    q('B15.4', 2, 'traditional', 'Are logs tamper-resistant, access-controlled, retained appropriately and monitored?'),
    q('B15.5', 2, 'ai', 'Are there signals for prompt injection, abnormal retrieval, tool misuse, unusual autonomy, cost spikes or policy bypass?'),
    q('B15.6', 3, 'traditional', 'Is it defined who receives alerts and which containment actions/playbooks exist?'),
  ],
  B16: [
    q('B16.1', 1, 'ai', 'Is it defined which outputs or actions require human review, and why?'),
    q('B16.2', 1, 'ai', 'Is approval bound to the exact action payload, so it cannot be spoofed, reused or bypassed?'),
    q('B16.3', 2, 'ai', 'Does the reviewer see the proposed action, evidence, affected records, risk and reversibility?'),
    q('B16.4', 2, 'traditional', 'Is the approver independent of the initiating agent/user where needed (separation of duties)?'),
    q('B16.5', 2, 'ai', 'Can a human meaningfully reject, edit or stop the action, and does it fail closed when no approval exists?'),
    q('B16.6', 3, 'ai', 'Are high-impact decisions explainable, contestable and subject to required oversight?'),
  ],
  B17: [
    q('B17.1', 1, 'traditional', 'Are vendors, model/data providers, open-source packages and hosted services identified?'),
    q('B17.2', 1, 'traditional', 'Are subprocessors, regions, retention, training use and breach-notification terms known?'),
    q('B17.3', 2, 'ai', 'Can third-party content or responses influence instructions, tool calls or privileged workflows?'),
    q('B17.4', 2, 'traditional', 'Are dependencies pinned and scanned, with vulnerability and model-change notifications received?'),
    q('B17.5', 3, 'traditional', 'Are contracts, security attestations, penetration tests and continuity/exit plans reviewed?'),
  ],
};

export const QUESTIONS: Question[] = (Object.keys(RAW) as AreaId[]).flatMap((area) =>
  RAW[area].map((qq) => ({ ...qq, area })),
);

const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]));
export const getArea = (id: AreaId) => AREA_BY_ID.get(id)!;

export function questionsForAreas(areas: AreaId[]): Question[] {
  const set = new Set(areas);
  return QUESTIONS.filter((x) => set.has(x.area));
}
