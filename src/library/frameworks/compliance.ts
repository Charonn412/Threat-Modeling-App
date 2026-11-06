import nist from './nist.json';
import type { Catalog, CatalogItem } from './owasp';

/**
 * Compliance catalogs. NIST AI RMF, CSF 2.0 and SP 800-53 are generated from
 * official NIST data by scripts/extract_compliance.py. AI 600-1 categories are
 * transcribed from the NIST publication; EU AI Act titles and ISO/IEC 42001
 * Annex A titles are transcribed from secondary sources (see each catalog's
 * `source`) and are editable in Libraries.
 */

const items = (pairs: [string, string][]): CatalogItem[] => pairs.map(([id, name]) => ({ id, name }));

export const NIST_AI_RMF: Catalog = {
  id: 'nist-ai-rmf',
  name: 'NIST AI Risk Management Framework',
  short: 'AI RMF',
  version: nist.ai_rmf.version,
  kind: 'compliance',
  source: 'https://airc.nist.gov/docs/playbook.json',
  items: nist.ai_rmf.items,
};

/** NIST AI 600-1 (July 2024) §2 risk categories, numbered as in the publication. */
export const NIST_AI_600_1: Catalog = {
  id: 'nist-ai-600-1',
  name: 'NIST AI 600-1 Generative AI Profile',
  short: 'AI 600-1',
  version: '2024',
  kind: 'compliance',
  source: 'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf',
  items: items([
    ['1', 'CBRN Information or Capabilities'],
    ['2', 'Confabulation'],
    ['3', 'Dangerous, Violent, or Hateful Content'],
    ['4', 'Data Privacy'],
    ['5', 'Environmental Impacts'],
    ['6', 'Harmful Bias or Homogenization'],
    ['7', 'Human-AI Configuration'],
    ['8', 'Information Integrity'],
    ['9', 'Information Security'],
    ['10', 'Intellectual Property'],
    ['11', 'Obscene, Degrading, and/or Abusive Content'],
    ['12', 'Value Chain and Component Integration'],
  ]),
};

/** ISO/IEC 42001:2023 Annex A reference controls (titles only; the standard's text is copyrighted). */
export const ISO_42001: Catalog = {
  id: 'iso-42001',
  name: 'ISO/IEC 42001 Annex A',
  short: 'ISO 42001',
  version: '2023',
  kind: 'compliance',
  source: 'https://www.iso.org/standard/42001',
  items: items([
    ['A.2.2', 'AI policy'],
    ['A.2.3', 'Alignment with other organizational policies'],
    ['A.2.4', 'Review of the AI policy'],
    ['A.3.2', 'AI roles and responsibilities'],
    ['A.3.3', 'Reporting of concerns'],
    ['A.4.2', 'Resource documentation'],
    ['A.4.3', 'Data resources'],
    ['A.4.4', 'Tooling resources'],
    ['A.4.5', 'System and computing resources'],
    ['A.4.6', 'Human resources'],
    ['A.5.2', 'AI system impact assessment process'],
    ['A.5.3', 'Documentation of AI system impact assessments'],
    ['A.5.4', 'Assessing AI system impact on individuals or groups of individuals'],
    ['A.5.5', 'Assessing societal impacts of AI systems'],
    ['A.6.1.2', 'Objectives for responsible development of AI system'],
    ['A.6.1.3', 'Processes for responsible AI system design and development'],
    ['A.6.2.2', 'AI system requirements and specification'],
    ['A.6.2.3', 'Documentation of AI system design and development'],
    ['A.6.2.4', 'AI system verification and validation'],
    ['A.6.2.5', 'AI system deployment'],
    ['A.6.2.6', 'AI system operation and monitoring'],
    ['A.6.2.7', 'AI system technical documentation'],
    ['A.6.2.8', 'AI system recording of event logs'],
    ['A.7.2', 'Data for development and enhancement of AI system'],
    ['A.7.3', 'Acquisition of data'],
    ['A.7.4', 'Quality of data for AI systems'],
    ['A.7.5', 'Data provenance'],
    ['A.7.6', 'Data preparation'],
    ['A.8.2', 'System documentation and information for users'],
    ['A.8.3', 'External reporting'],
    ['A.8.4', 'Communication of incidents'],
    ['A.8.5', 'Information for interested parties'],
    ['A.9.2', 'Processes for responsible use of AI systems'],
    ['A.9.3', 'Objectives for responsible use of AI system'],
    ['A.9.4', 'Intended use of the AI system'],
    ['A.10.2', 'Allocating responsibilities'],
    ['A.10.3', 'Suppliers'],
    ['A.10.4', 'Customers'],
  ]),
};

/** Regulation (EU) 2024/1689 – articles most relevant to AI system security and risk. */
export const EU_AI_ACT: Catalog = {
  id: 'eu-ai-act',
  name: 'EU AI Act (Regulation (EU) 2024/1689)',
  short: 'EU AI Act',
  version: '2024/1689',
  kind: 'compliance',
  source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689',
  items: items([
    ['Art. 4', 'AI Literacy'],
    ['Art. 5', 'Prohibited AI Practices'],
    ['Art. 6', 'Classification Rules for High-risk AI Systems'],
    ['Art. 9', 'Risk Management System'],
    ['Art. 10', 'Data and Data Governance'],
    ['Art. 11', 'Technical Documentation'],
    ['Art. 12', 'Record-Keeping'],
    ['Art. 13', 'Transparency and Provision of Information to Deployers'],
    ['Art. 14', 'Human Oversight'],
    ['Art. 15', 'Accuracy, Robustness and Cybersecurity'],
    ['Art. 17', 'Quality Management System'],
    ['Art. 26', 'Obligations of Deployers of High-Risk AI Systems'],
    ['Art. 27', 'Fundamental Rights Impact Assessment for High-risk AI Systems'],
    ['Art. 50', 'Transparency Obligations for Providers and Deployers of Certain AI Systems'],
    ['Art. 53', 'Obligations for Providers of General-Purpose AI Models'],
    ['Art. 55', 'Obligations for Providers of General-Purpose AI Models with Systemic Risk'],
    ['Art. 72', 'Post-market Monitoring by Providers and Post-market Monitoring Plan for High-risk AI Systems'],
    ['Art. 73', 'Reporting of Serious Incidents'],
  ]),
};

export const NIST_CSF: Catalog = {
  id: 'nist-csf',
  name: 'NIST Cybersecurity Framework',
  short: 'CSF',
  version: nist.csf.version,
  kind: 'compliance',
  source: 'https://csrc.nist.gov/projects/cprt',
  items: nist.csf.items,
};

export const NIST_800_53: Catalog = {
  id: 'nist-800-53',
  name: 'NIST SP 800-53',
  short: '800-53',
  version: nist.sp800_53.version,
  kind: 'compliance',
  source: 'https://github.com/usnistgov/oscal-content',
  items: nist.sp800_53.items,
};

export const COMPLIANCE_CATALOGS: Catalog[] = [NIST_AI_RMF, NIST_AI_600_1, ISO_42001, EU_AI_ACT, NIST_CSF, NIST_800_53];
