import { load } from 'js-yaml';
import type { Catalog, CatalogItem } from './owasp';

/**
 * Browser-side importers for official MITRE releases, mirroring
 * scripts/extract_frameworks.py:
 *  - ATT&CK Enterprise STIX 2.1 bundle (enterprise-attack.json)
 *  - ATLAS YAML release (ATLAS-<version>.yaml from mitre-atlas/atlas-data)
 */

interface StixObject {
  type: string;
  name?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  x_mitre_shortname?: string;
  x_mitre_version?: string;
  modified?: string;
  external_references?: { source_name?: string; external_id?: string }[];
  kill_chain_phases?: { phase_name: string }[];
}

export function parseAttackStix(data: unknown): Catalog {
  const objs = (data as { objects?: StixObject[] })?.objects;
  if (!Array.isArray(objs)) throw new Error('Not a STIX bundle (no "objects" array).');
  const coll = objs.find((o) => o.type === 'x-mitre-collection');
  if (!coll) throw new Error('No x-mitre-collection object found; is this an ATT&CK release file?');
  if (coll.name && !/enterprise/i.test(coll.name)) throw new Error(`This is "${coll.name}". Import the Enterprise ATT&CK bundle.`);
  const live = (o: StixObject) => !o.revoked && !o.x_mitre_deprecated;
  const tactics = new Map<string, string>();
  for (const o of objs) if (o.type === 'x-mitre-tactic' && live(o) && o.x_mitre_shortname && o.name) tactics.set(o.x_mitre_shortname, o.name);
  const techs = new Map<string, { name: string; tactics: string[] }>();
  for (const o of objs) {
    if (o.type !== 'attack-pattern' || !live(o)) continue;
    const ext = o.external_references?.find((r) => r.source_name === 'mitre-attack')?.external_id;
    if (!ext || !o.name) continue;
    techs.set(ext, { name: o.name, tactics: (o.kill_chain_phases ?? []).map((p) => tactics.get(p.phase_name)).filter((x): x is string => !!x) });
  }
  if (!techs.size) throw new Error('No techniques found in the bundle.');
  const items: CatalogItem[] = [...techs.keys()].sort().map((id) => {
    const t = techs.get(id)!;
    const parent = id.includes('.') ? techs.get(id.split('.')[0]) : undefined;
    return { id, name: parent ? `${parent.name}: ${t.name}` : t.name, tactics: t.tactics };
  });
  return {
    id: 'attack',
    name: 'MITRE ATT&CK Enterprise',
    short: 'ATT&CK',
    version: `v${coll.x_mitre_version ?? '?'}`,
    kind: 'traditional',
    source: 'https://github.com/mitre-attack/attack-stix-data',
    items,
  };
}

interface AtlasYaml {
  collection?: { version?: string | number };
  tactics?: Record<string, { name: string }>;
  techniques?: Record<string, { name: string; deprecated?: boolean; 'object-type'?: string }>;
  relationships?: Record<string, { achieves?: { target: string }[] }>;
}

export function parseAtlasYaml(text: string): Catalog {
  let d: AtlasYaml;
  try {
    d = load(text, { json: true }) as AtlasYaml;
  } catch (e) {
    throw new Error(`Could not parse YAML: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof d === 'string') throw new Error(`This file only points to "${d}". Download that file and import it instead.`);
  if (!d || typeof d !== 'object' || !d.techniques || typeof d.techniques !== 'object' || Array.isArray(d.techniques)) {
    throw new Error('Not an ATLAS v6 release file (expected a "techniques" map). Use dist/v6/ATLAS-<version>.yaml.');
  }
  const tactics = new Map(Object.entries(d.tactics ?? {}).map(([id, t]) => [id, t.name]));
  const achieves = new Map<string, string[]>();
  for (const [src, rels] of Object.entries(d.relationships ?? {})) {
    for (const r of rels?.achieves ?? []) achieves.set(src, [...(achieves.get(src) ?? []), r.target]);
  }
  const items: CatalogItem[] = [];
  for (const id of Object.keys(d.techniques).sort()) {
    const t = d.techniques[id];
    if (t.deprecated || (t['object-type'] && t['object-type'] !== 'technique')) continue;
    const parentId = id.split('.').length === 3 ? id.split('.').slice(0, 2).join('.') : null;
    const tac = achieves.get(id) ?? (parentId ? achieves.get(parentId) : undefined) ?? [];
    const name = parentId && d.techniques[parentId] ? `${d.techniques[parentId].name}: ${t.name}` : t.name;
    items.push({ id, name, tactics: tac.map((x) => tactics.get(x)).filter((x): x is string => !!x) });
  }
  if (!items.length) throw new Error('No techniques found.');
  return {
    id: 'atlas',
    name: 'MITRE ATLAS',
    short: 'ATLAS',
    version: String(d.collection?.version ?? '?'),
    kind: 'ai',
    source: 'https://github.com/mitre-atlas/atlas-data',
    items,
  };
}

/** Detects the format from content and parses it. */
export function parseMitreRelease(fileName: string, text: string): Catalog {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('File looks like JSON but could not be parsed.');
    }
    return parseAttackStix(json);
  }
  if (/\.ya?ml$/i.test(fileName) || /^(#|---|id:|format-version:)/m.test(trimmed)) return parseAtlasYaml(text);
  throw new Error('Unrecognized file. Import an ATT&CK STIX .json or an ATLAS .yaml release.');
}

export interface CatalogDiff {
  added: CatalogItem[];
  removed: CatalogItem[];
  renamed: { id: string; from: string; to: string }[];
}

export function diffCatalog(before: Catalog, after: Catalog): CatalogDiff {
  const a = new Map(before.items.map((i) => [i.id, i]));
  const b = new Map(after.items.map((i) => [i.id, i]));
  return {
    added: after.items.filter((i) => !a.has(i.id)),
    removed: before.items.filter((i) => !b.has(i.id)),
    renamed: after.items.filter((i) => a.has(i.id) && a.get(i.id)!.name !== i.name).map((i) => ({ id: i.id, from: a.get(i.id)!.name, to: i.name })),
  };
}
