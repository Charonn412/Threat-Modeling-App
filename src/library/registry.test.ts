import { applyPack, editorItems, emptyPack, libraryHealth, mergeOverlay, parsePack, useLibrary, validateConds } from './registry';
import { COMPONENT_TYPES, getComponentType } from './catalog';
import { THREAT_RULES, BUILTIN_THREAT_RULES } from './threatRules';
import { CATALOGS, lookup } from './frameworks';
import { diffCatalog, parseAtlasYaml, parseAttackStix, parseMitreRelease } from './frameworks/importers';
import { TEMPLATES, instantiateTemplate, templateFromAssessment } from './templates';
import { generateCandidates } from '../logic/threats';
import { RuleBasedAnalyzer } from '../logic/describe';
import { newAssessment, newComponent } from '../model/factory';

afterEach(() => {
  applyPack(emptyPack());
  useLibrary.setState({ pack: emptyPack() });
});

describe('overlay merge', () => {
  const builtins = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  it('applies overrides, disables and custom items', () => {
    const out = mergeOverlay(builtins, { overrides: { b: { id: 'b', v: 20 } }, disabled: ['a'], custom: [{ id: 'c', v: 3 }] });
    expect(out).toEqual([
      { id: 'b', v: 20 },
      { id: 'c', v: 3 },
    ]);
  });
  it('ignores custom items that collide with built-in ids', () => {
    expect(mergeOverlay(builtins, { overrides: {}, disabled: [], custom: [{ id: 'a', v: 9 }] })).toEqual(builtins);
  });
});

describe('built-in library health', () => {
  it('has no broken references', () => {
    expect(libraryHealth()).toEqual([]);
  });
});

describe('library edits take effect app-wide', () => {
  it('custom component types and rules drive threat generation', () => {
    const s = useLibrary.getState();
    s.upsert('components', { id: 'vendor_llm_firewall', label: 'LLM firewall', category: 'ai', areas: ['B4'], plane: 'data', glyph: '🧱', description: 'Vendor prompt firewall' });
    s.upsert('rules', {
      ...BUILTIN_THREAT_RULES.find((r) => r.id === 'PI-PROMPT-LEAK')!,
      id: 'CUSTOM-FW-BYPASS',
      title: 'Firewall bypass at {name}',
      when: [{ kind: 'type', types: ['vendor_llm_firewall'] }],
      signals: [],
    });
    expect(getComponentType('vendor_llm_firewall').label).toBe('LLM firewall');
    const a = newAssessment();
    a.components.push(newComponent('vendor_llm_firewall'));
    const c = generateCandidates(a).find((x) => x.rule.id === 'CUSTOM-FW-BYPASS');
    expect(c?.vars.name).toBe('LLM firewall');
    expect(libraryHealth()).toEqual([]);
  });

  it('disabling and restoring a built-in rule', () => {
    const s = useLibrary.getState();
    s.disable('rules', 'PI-DIRECT');
    expect(THREAT_RULES.some((r) => r.id === 'PI-DIRECT')).toBe(false);
    expect(editorItems(useLibrary.getState().pack, 'rules').find((x) => x.item.id === 'PI-DIRECT')?.state).toBe('disabled');
    useLibrary.getState().restore('rules', 'PI-DIRECT');
    expect(THREAT_RULES.some((r) => r.id === 'PI-DIRECT')).toBe(true);
  });

  it('lexicon edits change description analysis', () => {
    useLibrary.getState().upsert('lexicon', { id: 'acme-gw', patterns: ['acme ?guard'], type: 'guardrail', name: 'AcmeGuard', confidence: 'high' });
    const s = new RuleBasedAnalyzer().analyze('Prompts pass through AcmeGuard first.');
    expect(s.find((x) => x.type === 'guardrail')?.name).toBe('AcmeGuard');
  });

  it('health check flags references broken by an edit', () => {
    const rule = BUILTIN_THREAT_RULES[0];
    useLibrary.getState().upsert('rules', { ...rule, tags: [...rule.tags, { fw: 'attack', id: 'T9999' }], patterns: [...rule.patterns, 'nope'] });
    const issues = libraryHealth().filter((i) => i.id === rule.id);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/T9999.*not in the current catalog/);
    expect(issues.map((i) => i.message).join(' ')).toMatch(/Unknown pattern "nope"/);
  });

  it('a replaced catalog is used for lookups and versions', () => {
    const base = CATALOGS.find((c) => c.id === 'owasp-llm')!;
    useLibrary.getState().setCatalog({ ...base, version: '2026', items: [...base.items, { id: 'LLM11', name: 'Test item' }] });
    expect(lookup('owasp-llm', 'LLM11')?.name).toBe('Test item');
    useLibrary.getState().resetCatalog('owasp-llm');
    expect(lookup('owasp-llm', 'LLM11')).toBeUndefined();
  });
});

describe('condition validation', () => {
  it('accepts valid and rejects malformed conditions', () => {
    expect(validateConds([{ kind: 'type', types: ['agent'] }, { kind: 'any', conds: [{ kind: 'has', types: ['x'] }] }])).toBeNull();
    expect(validateConds({})).toMatch(/array/);
    expect(validateConds([{ kind: 'nope' }])).toMatch(/unknown kind/);
    expect(validateConds([{ kind: 'connected', types: ['a'] }])).toMatch(/direction/);
    expect(validateConds([{ kind: 'all', conds: [{ kind: 'type' }] }])).toMatch(/types/);
  });
});

describe('pack import', () => {
  it('round-trips and fills missing collections', () => {
    useLibrary.getState().disable('patterns', 'bounded-autonomy');
    const json = JSON.stringify(useLibrary.getState().pack);
    const p = parsePack(json);
    expect(p.patterns.disabled).toEqual(['bounded-autonomy']);
    expect(parsePack(JSON.stringify({ kind: 'ai-threat-model-library', schemaVersion: 1 })).rules.custom).toEqual([]);
    expect(() => parsePack('{"kind":"other"}')).toThrow(/Not a library pack/);
  });
});

describe('MITRE importers', () => {
  const stix = {
    type: 'bundle',
    objects: [
      { type: 'x-mitre-collection', name: 'Enterprise ATT&CK', x_mitre_version: '21.0' },
      { type: 'x-mitre-tactic', name: 'Initial Access', x_mitre_shortname: 'initial-access', external_references: [{ source_name: 'mitre-attack', external_id: 'TA0001' }] },
      { type: 'attack-pattern', name: 'Exploit Public-Facing Application', external_references: [{ source_name: 'mitre-attack', external_id: 'T1190' }], kill_chain_phases: [{ phase_name: 'initial-access' }] },
      { type: 'attack-pattern', name: 'Valid Accounts', external_references: [{ source_name: 'mitre-attack', external_id: 'T1078' }] },
      { type: 'attack-pattern', name: 'Cloud Accounts', external_references: [{ source_name: 'mitre-attack', external_id: 'T1078.004' }] },
      { type: 'attack-pattern', name: 'Old', revoked: true, external_references: [{ source_name: 'mitre-attack', external_id: 'T0001' }] },
    ],
  };
  it('parses ATT&CK STIX', () => {
    const c = parseAttackStix(stix);
    expect(c.version).toBe('v21.0');
    expect(c.items.map((i) => i.id)).toEqual(['T1078', 'T1078.004', 'T1190']);
    expect(c.items.find((i) => i.id === 'T1078.004')!.name).toBe('Valid Accounts: Cloud Accounts');
    expect(c.items.find((i) => i.id === 'T1190')!.tactics).toEqual(['Initial Access']);
    expect(parseMitreRelease('enterprise-attack.json', JSON.stringify(stix)).id).toBe('attack');
  });

  const atlas = `format-version: 6
collection:
  version: '2027.01'
tactics:
  AML.TA0005:
    name: Execution
techniques:
  AML.T0051:
    name: LLM Prompt Injection
    object-type: technique
  AML.T0051.001:
    name: Indirect
    object-type: technique
  AML.T0999:
    name: Gone
    deprecated: true
relationships:
  AML.T0051:
    achieves:
      - target: AML.TA0005
`;
  it('parses ATLAS YAML and rejects pointer files', () => {
    const c = parseAtlasYaml(atlas);
    expect(c.version).toBe('2027.01');
    expect(c.items.map((i) => i.id)).toEqual(['AML.T0051', 'AML.T0051.001']);
    expect(c.items[1].name).toBe('LLM Prompt Injection: Indirect');
    expect(c.items[1].tactics).toEqual(['Execution']);
    expect(() => parseAtlasYaml('ATLAS-2026.10.yaml')).toThrow(/points to/);
    expect(parseMitreRelease('ATLAS-2027.01.yaml', atlas).id).toBe('atlas');
  });

  it('diffs catalogs', () => {
    const before = parseAttackStix(stix);
    const after = { ...before, items: [...before.items.filter((i) => i.id !== 'T1190'), { id: 'T1078', name: 'Valid Accounts (renamed)' }, { id: 'T1700', name: 'New' }].filter((i, idx, arr) => arr.findIndex((x) => x.id === i.id) === idx) };
    after.items = after.items.map((i) => (i.id === 'T1078' ? { ...i, name: 'Valid Accounts (renamed)' } : i));
    const d = diffCatalog(before, after);
    expect(d.removed.map((i) => i.id)).toEqual(['T1190']);
    expect(d.added.map((i) => i.id)).toEqual(['T1700']);
    expect(d.renamed[0]).toEqual({ id: 'T1078', from: 'Valid Accounts', to: 'Valid Accounts (renamed)' });
  });
});

describe('templates from assessments', () => {
  it('captures and re-instantiates an architecture', () => {
    const src = instantiateTemplate(TEMPLATES[1]);
    const t = templateFromAssessment(src, 'my-agent', 'My agent', 'Saved from an assessment');
    const copy = instantiateTemplate(t);
    expect(copy.components.map((c) => [c.type, c.name, c.position])).toEqual(src.components.map((c) => [c.type, c.name, c.position]));
    expect(copy.flows.map((f) => f.label)).toEqual(src.flows.map((f) => f.label));
    expect(copy.boundaries).toHaveLength(src.boundaries.length);
    expect(COMPONENT_TYPES.length).toBeGreaterThan(0);
  });
});
