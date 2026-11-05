/**
 * OWASP lists (AI and traditional) and STRIDE, maintained as editable data.
 * Versions are the latest confirmed editions at build time; see spec §4a.
 */

export interface CatalogItem {
  id: string;
  name: string;
  tactics?: string[];
}

export interface Catalog {
  id: string;
  name: string;
  short: string;
  version: string;
  kind: 'ai' | 'traditional';
  source: string;
  items: CatalogItem[];
}

const items = (pairs: [string, string][]): CatalogItem[] => pairs.map(([id, name]) => ({ id, name }));

export const OWASP_CATALOGS: Catalog[] = [
  {
    id: 'owasp-llm',
    name: 'OWASP Top 10 for LLM Applications',
    short: 'OWASP LLM',
    version: '2025',
    kind: 'ai',
    source: 'https://genai.owasp.org/llm-top-10/',
    items: items([
      ['LLM01', 'Prompt Injection'],
      ['LLM02', 'Sensitive Information Disclosure'],
      ['LLM03', 'Supply Chain'],
      ['LLM04', 'Data and Model Poisoning'],
      ['LLM05', 'Improper Output Handling'],
      ['LLM06', 'Excessive Agency'],
      ['LLM07', 'System Prompt Leakage'],
      ['LLM08', 'Vector and Embedding Weaknesses'],
      ['LLM09', 'Misinformation'],
      ['LLM10', 'Unbounded Consumption'],
    ]),
  },
  {
    id: 'owasp-agentic',
    name: 'OWASP Top 10 for Agentic Applications',
    short: 'OWASP Agentic',
    version: '2026',
    kind: 'ai',
    source: 'https://genai.owasp.org/',
    items: items([
      ['ASI01', 'Agent Goal Hijack'],
      ['ASI02', 'Tool Misuse & Exploitation'],
      ['ASI03', 'Identity & Privilege Abuse'],
      ['ASI04', 'Agentic Supply Chain Vulnerabilities'],
      ['ASI05', 'Unexpected Code Execution'],
      ['ASI06', 'Memory & Context Poisoning'],
      ['ASI07', 'Insecure Inter-Agent Communication'],
      ['ASI08', 'Cascading Failures'],
      ['ASI09', 'Human-Agent Trust Exploitation'],
      ['ASI10', 'Rogue Agents'],
    ]),
  },
  {
    id: 'owasp-ml',
    name: 'OWASP Machine Learning Security Top 10',
    short: 'OWASP ML',
    version: '2023',
    kind: 'ai',
    source: 'https://owasp.org/www-project-machine-learning-security-top-10/',
    items: items([
      ['ML01', 'Input Manipulation Attack'],
      ['ML02', 'Data Poisoning Attack'],
      ['ML03', 'Model Inversion Attack'],
      ['ML04', 'Membership Inference Attack'],
      ['ML05', 'Model Theft'],
      ['ML06', 'AI Supply Chain Attacks'],
      ['ML07', 'Transfer Learning Attack'],
      ['ML08', 'Model Skewing'],
      ['ML09', 'Output Integrity Attack'],
      ['ML10', 'Model Poisoning'],
    ]),
  },
  {
    id: 'owasp-top10',
    name: 'OWASP Top 10 (web applications)',
    short: 'OWASP Top 10',
    version: '2025',
    kind: 'traditional',
    source: 'https://owasp.org/Top10/2025/',
    items: items([
      ['A01', 'Broken Access Control'],
      ['A02', 'Security Misconfiguration'],
      ['A03', 'Software Supply Chain Failures'],
      ['A04', 'Cryptographic Failures'],
      ['A05', 'Injection'],
      ['A06', 'Insecure Design'],
      ['A07', 'Authentication Failures'],
      ['A08', 'Software or Data Integrity Failures'],
      ['A09', 'Security Logging and Alerting Failures'],
      ['A10', 'Mishandling of Exceptional Conditions'],
    ]),
  },
  {
    id: 'owasp-api',
    name: 'OWASP API Security Top 10',
    short: 'OWASP API',
    version: '2023',
    kind: 'traditional',
    source: 'https://owasp.org/API-Security/editions/2023/en/0x11-t10/',
    items: items([
      ['API1', 'Broken Object Level Authorization'],
      ['API2', 'Broken Authentication'],
      ['API3', 'Broken Object Property Level Authorization'],
      ['API4', 'Unrestricted Resource Consumption'],
      ['API5', 'Broken Function Level Authorization'],
      ['API6', 'Unrestricted Access to Sensitive Business Flows'],
      ['API7', 'Server Side Request Forgery'],
      ['API8', 'Security Misconfiguration'],
      ['API9', 'Improper Inventory Management'],
      ['API10', 'Unsafe Consumption of APIs'],
    ]),
  },
  {
    id: 'owasp-nhi',
    name: 'OWASP Non-Human Identities Top 10',
    short: 'OWASP NHI',
    version: '2025',
    kind: 'traditional',
    source: 'https://owasp.org/www-project-non-human-identities-top-10/',
    items: items([
      ['NHI1', 'Improper Offboarding'],
      ['NHI2', 'Secret Leakage'],
      ['NHI3', 'Vulnerable Third-Party NHI'],
      ['NHI4', 'Insecure Authentication'],
      ['NHI5', 'Overprivileged NHI'],
      ['NHI6', 'Insecure Cloud Deployment Configurations'],
      ['NHI7', 'Long-Lived Secrets'],
      ['NHI8', 'Environment Isolation'],
      ['NHI9', 'NHI Reuse'],
      ['NHI10', 'Human Use of NHI'],
    ]),
  },
  {
    id: 'owasp-cicd',
    name: 'OWASP Top 10 CI/CD Security Risks',
    short: 'OWASP CI/CD',
    version: '2022',
    kind: 'traditional',
    source: 'https://owasp.org/www-project-top-10-ci-cd-security-risks/',
    items: items([
      ['CICD-SEC-1', 'Insufficient Flow Control Mechanisms'],
      ['CICD-SEC-2', 'Inadequate Identity and Access Management'],
      ['CICD-SEC-3', 'Dependency Chain Abuse'],
      ['CICD-SEC-4', 'Poisoned Pipeline Execution'],
      ['CICD-SEC-5', 'Insufficient Pipeline-Based Access Controls'],
      ['CICD-SEC-6', 'Insufficient Credential Hygiene'],
      ['CICD-SEC-7', 'Insecure System Configuration'],
      ['CICD-SEC-8', 'Ungoverned Usage of 3rd Party Services'],
      ['CICD-SEC-9', 'Improper Artifact Integrity Validation'],
      ['CICD-SEC-10', 'Insufficient Logging and Visibility'],
    ]),
  },
  {
    id: 'owasp-k8s',
    name: 'OWASP Kubernetes Top 10',
    short: 'OWASP K8s',
    version: '2022',
    kind: 'traditional',
    source: 'https://owasp.org/www-project-kubernetes-top-ten/',
    items: items([
      ['K01', 'Insecure Workload Configurations'],
      ['K02', 'Supply Chain Vulnerabilities'],
      ['K03', 'Overly Permissive RBAC Configurations'],
      ['K04', 'Lack of Centralized Policy Enforcement'],
      ['K05', 'Inadequate Logging and Monitoring'],
      ['K06', 'Broken Authentication Mechanisms'],
      ['K07', 'Missing Network Segmentation Controls'],
      ['K08', 'Secrets Management Failures'],
      ['K09', 'Misconfigured Cluster Components'],
      ['K10', 'Outdated and Vulnerable Kubernetes Components'],
    ]),
  },
];

export const STRIDE_CATALOG: Catalog = {
  id: 'stride',
  name: 'STRIDE',
  short: 'STRIDE',
  version: 'n/a',
  kind: 'traditional',
  source: 'https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats',
  items: items([
    ['S', 'Spoofing'],
    ['T', 'Tampering'],
    ['R', 'Repudiation'],
    ['I', 'Information disclosure'],
    ['D', 'Denial of service'],
    ['E', 'Elevation of privilege'],
  ]),
};
