/**
 * Description lexicon: phrases and product names → suggested components or
 * intake hints. Patterns are case-insensitive regular expressions matched on
 * word boundaries. Editable in-app in a later slice (spec §4).
 *
 * - `generic` entries ("SSO", "vector database", "tickets") only create a
 *   component when no specific product of the same type was found; otherwise
 *   their matches are folded into the specific one.
 * - `platform` entries (Bedrock, Azure OpenAI, Vertex) are hosting platforms:
 *   when a model family (Claude, GPT, Gemini…) is also named, the two merge
 *   into one model endpoint ("Claude via AWS Bedrock").
 */

export interface LexiconEntry {
  id: string;
  patterns: string[];
  /** Component type to suggest. */
  type?: string;
  /** Suggested component name ("$0" = the matched text). */
  name?: string;
  provider?: string;
  /** Intake system types implied by this phrase. */
  systemTypes?: string[];
  confidence: 'high' | 'medium' | 'low';
  generic?: boolean;
  platform?: boolean;
}

const e = (id: string, patterns: string[], type: string | undefined, extra: Partial<LexiconEntry> = {}): LexiconEntry => ({
  id,
  patterns,
  type,
  confidence: 'medium',
  ...extra,
});
const g = (id: string, patterns: string[], type: string, extra: Partial<LexiconEntry> = {}) => e(id, patterns, type, { generic: true, ...extra });

const GENAI = { systemTypes: ['genai'] };

export const BUILTIN_LEXICON: LexiconEntry[] = [
  // Models: hosting platforms
  e('bedrock', ['aws bedrock', 'amazon bedrock', 'bedrock'], 'model_endpoint', { name: 'AWS Bedrock model', provider: 'AWS Bedrock', confidence: 'high', platform: true, ...GENAI }),
  e('azure-openai', ['azure openai', 'azure ai foundry', 'azure ai studio'], 'model_endpoint', { name: 'Azure OpenAI model', provider: 'Azure OpenAI', confidence: 'high', platform: true, ...GENAI }),
  e('vertex', ['vertex ai', 'vertex'], 'model_endpoint', { name: 'Vertex AI model', provider: 'Google Vertex AI', confidence: 'high', platform: true, ...GENAI }),
  // Models: families
  e('openai', ['openai', 'gpt-?\\d[\\w.-]*', 'chatgpt'], 'model_endpoint', { name: 'OpenAI GPT model', provider: 'OpenAI', confidence: 'high', ...GENAI }),
  e('anthropic', ['anthropic', 'claude'], 'model_endpoint', { name: 'Claude model', provider: 'Anthropic', confidence: 'high', ...GENAI }),
  e('gemini', ['gemini'], 'model_endpoint', { name: 'Gemini model', provider: 'Google', confidence: 'high', ...GENAI }),
  e('selfhosted', ['llama', 'mistral', 'ollama', 'vllm', 'hugging ?face', 'self-hosted model', 'open[- ]weights?'], 'model_endpoint', { name: 'Self-hosted model', provider: 'Self-hosted', ...GENAI }),
  g('llm-generic', ['llms?', 'large language models?', 'foundation models?', 'genai', 'generative ai'], 'model_endpoint', { name: 'LLM', confidence: 'low', ...GENAI }),
  e('ml', ['classifier model', 'predictive model', 'scoring model', 'xgboost', 'scikit-learn', 'sklearn', 'machine learning model', 'ml model'], 'model_endpoint', { name: 'ML model', systemTypes: ['traditional-ml'] }),
  e('gateway', ['model gateway', 'ai gateway', 'llm gateway', 'litellm', 'model router', 'apim'], 'model_gateway', { confidence: 'high' }),

  // Prompting / guardrails
  e('prompt', ['system prompts?', 'prompt templates?', 'prompt engineering', 'context window'], 'prompt_assembly'),
  e('guardrail', ['guardrails?', 'content filter(?:ing|s)?', 'moderation', 'pii redaction', 'prompt shields?', 'llama guard'], 'guardrail', { confidence: 'high' }),

  // Retrieval
  e('rag', ['rag', 'retrieval[- ]augmented(?: generation)?', 'retriev(?:e|al|es|ing)', 'knowledge base', 'semantic search', 'grounded (?:on|in)'], 'rag_retriever', { systemTypes: ['rag'], confidence: 'high' }),
  e('vector', ['pinecone', 'weaviate', 'pgvector', 'chroma(?:db)?', 'qdrant', 'milvus', 'faiss', 'opensearch', 'elasticsearch', 'azure ai search', 'cognitive search'], 'vector_store', { name: '$0', confidence: 'high', systemTypes: ['rag'] }),
  g('vector-generic', ['vector (?:db|database|store|index)', 'embeddings? (?:store|index)'], 'vector_store', { name: 'Vector store', systemTypes: ['rag'] }),
  e('ingest', ['ingest(?:ion|s|ed)?', 'index(?:ing|es|ed)? (?:documents|content)', 'chunk(?:ing|s)?', 'embeddings?', 'ocr'], 'ingestion_pipeline', { systemTypes: ['rag'] }),
  e('ksource', ['sharepoint', 'confluence', 'google drive', 'onedrive', 'notion', 'box\\.com'], 'knowledge_source', { name: '$0', confidence: 'high' }),
  g('ksource-generic', ['file shares?', 'intranet', 'wiki', 'policy documents', 'knowledge articles', 'internal documents'], 'knowledge_source', { name: 'Document repository' }),

  // Agents & memory
  e('agent', ['agents?', 'agentic', 'autonomous(?:ly)?', 'copilot'], 'agent', { systemTypes: ['agentic'] }),
  e('multiagent', ['multi[- ]agent', 'sub-?agents?', 'delegat(?:e|es|ion)', 'orchestrat(?:e|or|ion)', 'planner', 'langgraph', 'crewai', 'autogen'], 'orchestrator', { systemTypes: ['agentic'], confidence: 'high' }),
  e('memory', ['memory', 'remembers?', 'conversation history', 'chat history', 'long[- ]term state', 'user profiles?'], 'memory_store'),

  // Tools & capabilities
  e('mcp', ['mcp(?: servers?)?', 'model context protocol', 'plugins?'], 'mcp_server', { confidence: 'high', systemTypes: ['agentic'] }),
  e('email', ['e-?mails?', 'outlook', 'gmail', 'send messages?'], 'tool_connector', { name: 'Email tool', confidence: 'high' }),
  e('chatops', ['slack', 'microsoft teams', 'ms teams'], 'tool_connector', { name: '$0 connector' }),
  e('crm', ['salesforce', 'hubspot', 'dynamics 365'], 'tool_connector', { name: '$0 tool', confidence: 'high' }),
  g('crm-generic', ['crm'], 'tool_connector', { name: 'CRM tool' }),
  e('ticketing', ['jira', 'servicenow', 'zendesk'], 'tool_connector', { name: '$0 tool', confidence: 'high' }),
  g('ticketing-generic', ['tickets?', 'ticketing'], 'tool_connector', { name: 'Ticketing tool' }),
  e('code', ['code interpreter', 'execut(?:e|es|ing) (?:python|code|scripts?|sql)', 'runs? (?:python|code|scripts?|sql)', 'python sandbox', 'jupyter', 'notebooks?', 'shell commands?', 'generates? sql'], 'code_sandbox', { confidence: 'high' }),
  e('browser', ['web search', 'brows(?:e|es|ing)', 'browser', 'playwright', 'puppeteer', 'scrap(?:e|es|ing)', 'internet access'], 'browser_automation', { confidence: 'high' }),
  e('erp', ['sap', 'workday', 'oracle erp', 'netsuite'], 'enterprise_api', { name: '$0', confidence: 'high' }),
  g('erp-generic', ['system of record', 'internal apis?', 'erp'], 'enterprise_api', { name: 'Enterprise system' }),
  g('vendor', ['third[- ]party', 'vendor', 'saas'], 'third_party_service', { confidence: 'low', systemTypes: ['third-party'] }),

  // Entry points
  e('chatui', ['chat ?bot', 'chat interface', 'chat ui', 'assistant', 'conversational', 'users? chat'], 'chat_ui'),
  e('webui', ['web app(?:lication)?', 'portal', 'website', 'mobile app', 'dashboard'], 'web_ui'),
  e('api', ['rest api', 'graphql', 'sdk', 'public api', 'api endpoint', 'exposes an api'], 'public_api'),
  e('upload', ['upload(?:s|ed|ing)?', 'attachments?', 'pdfs?', 'audio', 'documents? (?:from|provided by) users'], 'file_upload'),
  e('event', ['webhooks?', 'kafka', 'event[- ]driven', 'message queue', 'sqs', 'pub/?sub', 'batch jobs?', 'scheduled jobs?', 'cron'], 'event_webhook'),

  // Data stores
  e('db', ['postgres(?:ql)?', 'mysql', 'sql server', 'dynamodb', 'mongodb', 'cosmos ?db', 'snowflake', 'bigquery'], 'database', { name: '$0', confidence: 'high' }),
  g('db-generic', ['databases?'], 'database', { name: 'Database' }),
  e('cache', ['redis', 'memcached'], 'cache', { name: '$0', confidence: 'high' }),
  g('cache-generic', ['cache[sd]?', 'caching'], 'cache', { name: 'Cache' }),
  e('blob', ['s3', 'blob storage', 'gcs', 'data lake'], 'object_storage', { name: '$0' }),
  g('blob-generic', ['object storage', 'file storage'], 'object_storage', { name: 'Object storage' }),
  e('training', ['fine[- ]tun(?:e|ed|es|ing)', 'train(?:s|ed|ing)? (?:a |the |our )?models?', 'retrain(?:s|ed|ing)?', 'rlhf', 'lora'], 'training_pipeline', { confidence: 'high' }),
  e('registry', ['model registry', 'mlflow', 'sagemaker', 'model artifacts?'], 'model_registry'),

  // Identity / control plane / ops
  e('idp', ['okta', 'entra(?: id)?', 'azure ad', 'active directory', 'auth0', 'cognito', 'ping ?identity'], 'identity_provider', { name: '$0', confidence: 'high' }),
  g('idp-generic', ['sso', 'single sign-on', 'oauth', 'oidc', 'saml'], 'identity_provider', { name: 'SSO identity provider', confidence: 'high' }),
  e('secrets', ['hashicorp vault', 'vault', 'secrets? manager', 'key vault', 'kms'], 'secrets_manager', { name: '$0' }),
  g('secrets-generic', ['api keys?', 'secrets'], 'secrets_manager', { name: 'Secrets manager', confidence: 'low' }),
  e('monitor', ['datadog', 'splunk', 'cloudwatch', 'sentinel', 'langsmith', 'elastic siem'], 'monitoring', { name: '$0', confidence: 'high' }),
  g('monitor-generic', ['siem', 'logging', 'logs', 'observability', 'telemetry', 'monitoring'], 'monitoring', { name: 'Logging & monitoring' }),
  e('host', ['kubernetes', 'k8s', 'eks', 'aks', 'gke', 'aws lambda', 'lambda', 'ecs', 'cloud run', 'app service'], 'runtime_host', { name: '$0' }),
  g('host-generic', ['serverless', 'containers?', 'docker', 'virtual machines?'], 'runtime_host', { name: 'Runtime host' }),
  e('cicd', ['ci/?cd', 'github actions', 'gitlab', 'jenkins', 'deployment pipeline', 'azure devops'], 'cicd', { name: '$0' }),
  e('admin', ['admin (?:console|portal|panel)', 'administrators? can', 'configuration console'], 'admin_console'),

  // Approvals & effects
  e('approval', ['human[- ]in[- ]the[- ]loop', 'approv(?:e|al|als|es|ed)', 'human review', 'sign[- ]off', 'confirm(?:s|ation)? before'], 'approval_gate', { confidence: 'high' }),
  e('payment', ['payments?', 'refunds?', 'stripe', 'wire transfers?', 'invoices?', 'purchase orders?'], 'downstream_action', { name: 'Financial transaction', confidence: 'high' }),
  e('records', ['updates? (?:to )?(?:\\w+ )?records', 'creates? (?:\\w+ )?(?:records|accounts)', 'modif(?:y|ies) (?:records|data)', 'writes? to'], 'downstream_action', { name: 'Record change' }),
  e('access', ['grants? access', 'provision(?:s|ing)? (?:users|accounts|access)', 'resets? passwords?'], 'downstream_action', { name: 'Access change', confidence: 'high' }),
];

// Live binding: replaced when library edits are applied (see registry.ts).
export let LEXICON: LexiconEntry[] = BUILTIN_LEXICON;
export function _setLexicon(next: LexiconEntry[]) {
  LEXICON = next;
}
