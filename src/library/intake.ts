import type { Intake } from '../model/types';

/** Appendix A intake form definition (Stage 1 – initiate and classify). */

export interface Option {
  value: string;
  label: string;
}

export type IntakeField =
  | { key: keyof Intake; kind: 'text' | 'textarea'; label: string; help?: string }
  | { key: keyof Intake; kind: 'single' | 'multi'; label: string; help?: string; options: Option[] };

export interface IntakeSection {
  title: string;
  appendixRef: string;
  fields: IntakeField[];
}

const o = (value: string, label: string): Option => ({ value, label });
const YNU = [o('yes', 'Yes'), o('no', 'No'), o('unknown', 'Unknown')];

export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    title: 'Purpose & outcomes',
    appendixRef: 'A · Purpose and outcomes',
    fields: [
      { key: 'systemName', kind: 'text', label: 'System name' },
      { key: 'owner', kind: 'text', label: 'Business / product owner' },
      { key: 'purpose', kind: 'textarea', label: 'What problem does AI solve?' },
      { key: 'outputs', kind: 'textarea', label: 'What decision, recommendation, content or action does it produce?' },
      { key: 'failureImpact', kind: 'textarea', label: 'What happens if it is wrong, unavailable, manipulated or delayed?' },
      { key: 'prohibitedUses', kind: 'textarea', label: 'Prohibited uses' },
      {
        key: 'systemTypes', kind: 'multi', label: 'System type / pattern (Part I §2)',
        options: [o('traditional-ml', 'Traditional ML / predictive'), o('genai', 'Generative AI application'), o('rag', 'RAG / knowledge assistant'), o('agentic', 'Agentic system'), o('platform', 'AI platform / enablement service'), o('third-party', 'Third-party / embedded AI')],
      },
      {
        key: 'lifecycleStage', kind: 'single', label: 'Lifecycle stage',
        options: [o('concept', 'Concept'), o('design', 'Design'), o('build', 'Build'), o('procurement', 'Procurement'), o('change', 'Material change'), o('pre-production', 'Pre-production approval'), o('production', 'Production / reassessment')],
      },
    ],
  },
  {
    title: 'Users & actors',
    appendixRef: 'A · Users and actors',
    fields: [
      {
        key: 'userPopulation', kind: 'multi', label: 'Who uses it?',
        options: [o('employees', 'Employees'), o('customers', 'Customers'), o('partners', 'Partners'), o('public', 'General public'), o('admins', 'Administrators'), o('services', 'Services / other systems')],
      },
      {
        key: 'exposure', kind: 'single', label: 'Access / exposure',
        options: [o('internal', 'Internal only'), o('external-auth', 'External, authenticated'), o('public', 'Public / anonymous')],
      },
      { key: 'vulnerablePopulations', kind: 'single', label: 'Are minors or vulnerable populations involved?', options: YNU },
    ],
  },
  {
    title: 'Business criticality',
    appendixRef: 'A · Business criticality',
    fields: [
      {
        key: 'criticality', kind: 'single', label: 'Role of the AI',
        options: [o('advisory', 'Advisory'), o('decision-support', 'Decision-supporting'), o('action-taking', 'Action-taking')],
      },
      {
        key: 'regulatedImpact', kind: 'multi', label: 'Does it affect…',
        options: [o('money', 'Money / financial'), o('employment', 'Employment'), o('eligibility', 'Eligibility / access to services'), o('safety', 'Safety'), o('legal', 'Legal rights'), o('regulated-records', 'Regulated records'), o('critical-ops', 'Critical operations'), o('none', 'None of these')],
      },
    ],
  },
  {
    title: 'Data',
    appendixRef: 'A · Data',
    fields: [
      {
        key: 'dataSensitivity', kind: 'single', label: 'Highest data classification involved',
        options: [o('public', 'Public'), o('internal', 'Internal'), o('confidential', 'Confidential'), o('restricted', 'Restricted / highly confidential')],
      },
      {
        key: 'dataTypes', kind: 'multi', label: 'Data types entering, retrieved, generated, stored, logged or used for training',
        options: [o('personal', 'Personal data'), o('special-category', 'Special-category / sensitive personal'), o('regulated', 'Regulated (PCI, PHI, financial…)'), o('proprietary', 'Proprietary / IP'), o('secrets', 'Secrets / credentials'), o('customer', 'Customer data')],
      },
    ],
  },
  {
    title: 'Autonomy',
    appendixRef: 'A · Autonomy',
    fields: [
      {
        key: 'autonomy', kind: 'single', label: 'Can it act without human review?',
        options: [o('none', 'No actions — output only'), o('suggest', 'Proposes actions; a human executes'), o('bounded', 'Bounded autonomous actions'), o('broad', 'Broad autonomous / cross-system actions')],
      },
      {
        key: 'reversibility', kind: 'single', label: 'Are its actions reversible?',
        options: [o('reversible', 'Fully reversible'), o('partial', 'Partially'), o('irreversible', 'Some are irreversible')],
      },
    ],
  },
  {
    title: 'Deployment, dependencies & operations',
    appendixRef: 'A · Deployment / Dependencies / Operations',
    fields: [
      {
        key: 'deployment', kind: 'multi', label: 'Where is it hosted?',
        options: [o('saas', 'SaaS'), o('public-cloud', 'Public cloud'), o('private-cloud', 'Private cloud'), o('on-prem', 'On-prem'), o('endpoint', 'Endpoint / device'), o('hybrid', 'Hybrid')],
      },
      { key: 'regions', kind: 'text', label: 'Regions and environments' },
      { key: 'dependencies', kind: 'textarea', label: 'Models, providers, APIs, platforms, plugins, agents and enterprise systems involved' },
      { key: 'operations', kind: 'textarea', label: 'Who monitors, supports, changes and disables it? What is the incident path?' },
      { key: 'killSwitch', kind: 'single', label: 'Can it be rolled back, disabled or operated manually?', options: YNU },
    ],
  },
];
