import type { Assessment, Level, RiskMatrix } from '../model/types';

export const LEVELS: Exclude<Level, 0>[] = [1, 2, 3, 4];

export function rating(m: RiskMatrix, likelihood: Level, impact: Level): Level {
  if (!likelihood || !impact) return 0;
  return m.grid[likelihood - 1]?.[impact - 1] ?? 0;
}

export function ratingLabel(m: RiskMatrix, r: Level): string {
  return r ? m.ratingLabels[r - 1] : 'Not rated';
}

const clamp = (n: number): Exclude<Level, 0> => Math.max(1, Math.min(4, Math.round(n))) as Exclude<Level, 0>;
export { clamp as clampLevel };

export interface AutonomyReach {
  level: Exclude<Level, 0>;
  reasons: string[];
}

/**
 * Section 9 autonomy / reach modifier. Informs likelihood and impact
 * judgments; it is not applied as a mathematical multiplier.
 */
export function autonomyReach(a: Assessment): AutonomyReach {
  const count = (types: string[]) => a.components.filter((c) => types.includes(c.type)).length;
  const capabilities = count(['tool_connector', 'mcp_server', 'code_sandbox', 'browser_automation', 'enterprise_api', 'downstream_action']);
  const agents = count(['agent', 'orchestrator']);
  const memory = count(['memory_store']) > 0;
  const types = new Map(a.components.map((c) => [c.id, c.type]));
  const delegation = a.flows.some((f) => ['agent', 'orchestrator'].includes(types.get(f.source) ?? '') && ['agent', 'orchestrator'].includes(types.get(f.target) ?? ''));
  const reasons: string[] = [];
  if (a.intake.autonomy) reasons.push(`intake autonomy: ${a.intake.autonomy}`);
  reasons.push(`${capabilities} tool/capability/effect component${capabilities === 1 ? '' : 's'}`);
  if (agents) reasons.push(`${agents} agent${agents === 1 ? '' : 's'}`);
  if (memory) reasons.push('persistent memory');
  if (delegation) reasons.push('agent delegation');

  let level: Exclude<Level, 0>;
  if (a.intake.autonomy === 'broad') level = 4;
  else if (a.intake.autonomy === 'bounded' || agents > 0) level = capabilities >= 2 || memory || delegation ? 3 : 2;
  else if (capabilities === 0) level = 1;
  else level = 2;
  return { level, reasons };
}
