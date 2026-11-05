/**
 * Appendix D secure design pattern catalogue, with the OWASP ASVS 5.0
 * chapters that hold the corresponding verification requirements.
 */
export interface Pattern {
  id: string;
  name: string;
  outcome: string;
  asvs: string[];
}

export const PATTERNS: Pattern[] = [
  { id: 'policy-outside-model', name: 'Policy enforcement outside the model', outcome: 'A deterministic policy service decides whether an action is allowed using authenticated identity, resource, action, context and risk. The model may recommend but cannot grant authority.', asvs: ['V8 Authorization'] },
  { id: 'capability-tools', name: 'Capability-based tool access', outcome: 'Expose narrow task-specific tools; separate read/write; scope credentials and resources; allowlist operations and destinations; avoid general-purpose admin tools.', asvs: ['V8 Authorization', 'V4 API and Web Service'] },
  { id: 'approval-bound', name: 'Human approval bound to payload', outcome: 'Approval is bound to the exact action, target, parameters, amount and expiry. Any material change invalidates approval. Approval is recorded and independently enforced.', asvs: ['V2 Validation and Business Logic'] },
  { id: 'untrusted-isolation', name: 'Untrusted content isolation', outcome: 'User/retrieved/tool content is labeled and handled as data, not instructions. Provenance is preserved through summarization, memory and agent handoffs. Content is never promoted to trusted instructions.', asvs: ['V1 Encoding and Sanitization'] },
  { id: 'rag-authz', name: 'RAG authorization at retrieval', outcome: 'Enforce source ACLs and user entitlement at query time; isolate tenants; preserve source lineage; filter before content reaches the model.', asvs: ['V8 Authorization', 'V14 Data Protection'] },
  { id: 'structured-outputs', name: 'Constrained structured outputs', outcome: 'Use strict schemas, type/range validation, canonicalization, allowlisted enums and semantic validation. Reject unexpected fields and never execute raw model output.', asvs: ['V1 Encoding and Sanitization', 'V2 Validation and Business Logic'] },
  { id: 'sandboxed-execution', name: 'Sandboxed execution', outcome: 'Use ephemeral isolated runtimes, no ambient secrets, restricted egress, resource budgets and artifact scanning. Separate test from production.', asvs: ['V13 Configuration', 'V15 Secure Coding and Architecture'] },
  { id: 'identity-delegation', name: 'Identity propagation and delegation', outcome: 'Use distinct workload identities; pass authenticated user context explicitly; scope delegated tokens; prevent confused-deputy behavior; record delegation chains.', asvs: ['V6 Authentication', 'V9 Self-contained Tokens', 'V10 OAuth and OIDC'] },
  { id: 'data-minimization', name: 'Data minimization and privacy', outcome: 'Send only required fields; redact/tokenize sensitive data; set retention and deletion; protect logs and embeddings; govern provider processing.', asvs: ['V14 Data Protection'] },
  { id: 'bounded-autonomy', name: 'Bounded autonomy', outcome: 'Set maximum steps, depth, time, cost, concurrency, tool calls, records affected and transaction value. Provide a reliable stop and rollback path.', asvs: ['V2 Validation and Business Logic'] },
  { id: 'secure-model-lifecycle', name: 'Secure model lifecycle', outcome: 'Pin/govern versions; protect data and artifacts; record lineage; evaluate adversarial and task-specific behavior; gate promotion; monitor drift and rollback.', asvs: ['V15 Secure Coding and Architecture'] },
  { id: 'resilient-operations', name: 'Resilient operations', outcome: 'Use timeouts, circuit breakers, quotas, safe fallbacks, health checks, manual workarounds, incident runbooks and tested recovery.', asvs: ['V16 Security Logging and Error Handling'] },
  // Traditional patterns used alongside Appendix D
  { id: 'authn-session', name: 'Strong authentication and session management', outcome: 'Enterprise identity with MFA/step-up; server-derived identity and tenant; protected sessions and tokens; no client-supplied roles.', asvs: ['V6 Authentication', 'V7 Session Management'] },
  { id: 'secrets-management', name: 'Secrets management', outcome: 'Store secrets in a managed vault; short-lived, scoped credentials; automatic rotation; no secrets in code, prompts, logs or embeddings.', asvs: ['V13 Configuration', 'V11 Cryptography'] },
  { id: 'secure-transport', name: 'Secure transport and segmentation', outcome: 'Encrypt all flows in transit (TLS/mTLS); private endpoints; segmented networks; restricted egress allowlists.', asvs: ['V12 Secure Communication'] },
  { id: 'hardened-runtime', name: 'Hardened runtime and infrastructure', outcome: 'Hardened baselines, non-root ephemeral workloads, signed/scanned images, blocked metadata services, least-privilege workload identities, patching.', asvs: ['V13 Configuration'] },
  { id: 'supply-chain', name: 'Supply chain integrity', outcome: 'Pin and scan dependencies, models, tools and plugins; verify signatures and provenance; monitor vendor changes; maintain an inventory.', asvs: ['V15 Secure Coding and Architecture'] },
  { id: 'audit-monitoring', name: 'Tamper-resistant logging and monitoring', outcome: 'End-to-end correlated telemetry, protected logs, behavioral alerting, AI-specific playbooks, kill switch and credential revocation.', asvs: ['V16 Security Logging and Error Handling'] },
  { id: 'input-validation', name: 'Input validation and output encoding', outcome: 'Validate type, length, encoding and schema on every input; encode outputs for their context; parameterize queries.', asvs: ['V1 Encoding and Sanitization', 'V2 Validation and Business Logic', 'V5 File Handling'] },
];

const BY_ID = new Map(PATTERNS.map((p) => [p.id, p]));
export const getPattern = (id: string) => BY_ID.get(id);
