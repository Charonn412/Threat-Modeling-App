import atlasData from './atlas.json';
import attackData from './attack.json';
import { OWASP_CATALOGS, STRIDE_CATALOG, type Catalog, type CatalogItem } from './owasp';

export type { Catalog, CatalogItem } from './owasp';

/**
 * MITRE ATLAS and ATT&CK catalogs are generated from MITRE's official data by
 * scripts/extract_frameworks.py; OWASP and STRIDE are maintained in owasp.ts.
 */
const ATLAS: Catalog = {
  id: 'atlas',
  name: 'MITRE ATLAS',
  short: 'ATLAS',
  version: atlasData.version,
  kind: 'ai',
  source: 'https://github.com/mitre-atlas/atlas-data',
  items: atlasData.items as CatalogItem[],
};

const ATTACK: Catalog = {
  id: 'attack',
  name: 'MITRE ATT&CK Enterprise',
  short: 'ATT&CK',
  version: attackData.version,
  kind: 'traditional',
  source: 'https://github.com/mitre-attack/attack-stix-data',
  items: attackData.items as CatalogItem[],
};

export const BUILTIN_CATALOGS: Catalog[] = [
  OWASP_CATALOGS[0], // LLM
  OWASP_CATALOGS[1], // Agentic
  OWASP_CATALOGS[2], // ML
  ATLAS,
  STRIDE_CATALOG,
  ATTACK,
  ...OWASP_CATALOGS.slice(3), // Top 10, API, NHI, CI/CD, K8s
];

// Live binding: replaced when library edits are applied (see registry.ts).
export let CATALOGS: Catalog[] = BUILTIN_CATALOGS;
let BY_ID = new Map(CATALOGS.map((c) => [c.id, c]));
let ITEM_INDEX = new Map(CATALOGS.map((c) => [c.id, new Map(c.items.map((i) => [i.id, i]))]));

export function _setCatalogs(next: Catalog[]) {
  CATALOGS = next;
  BY_ID = new Map(next.map((c) => [c.id, c]));
  ITEM_INDEX = new Map(next.map((c) => [c.id, new Map(c.items.map((i) => [i.id, i]))]));
}

export const getCatalog = (id: string) => BY_ID.get(id);

export function lookup(fw: string, id: string): CatalogItem | undefined {
  return ITEM_INDEX.get(fw)?.get(id);
}

export function catalogVersions(): Record<string, string> {
  return Object.fromEntries(CATALOGS.map((c) => [c.name, c.version]));
}

/** Search across all catalogs for the tag picker. */
export function searchCatalogs(query: string, limit = 40): { catalog: Catalog; item: CatalogItem }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: { catalog: Catalog; item: CatalogItem }[] = [];
  for (const c of CATALOGS) {
    for (const item of c.items) {
      if (item.id.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || c.short.toLowerCase() === q) {
        out.push({ catalog: c, item });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
