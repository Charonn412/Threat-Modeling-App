/**
 * Format-neutral report document. One builder produces blocks; the HTML
 * preview, PDF and Word renderers all consume the same blocks, so every
 * output says the same thing.
 */

export interface StyledCell {
  text: string;
  fill?: string; // background hex, e.g. '#c92a2a'
  color?: string; // text hex
  bold?: boolean;
}
export type Cell = string | StyledCell;

export type Block =
  | { t: 'title'; text: string; subtitle: string }
  | { t: 'h1'; text: string; id?: string }
  | { t: 'h2'; text: string }
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string; style?: 'muted' | 'callout' | 'narrative' }
  | { t: 'kv'; rows: [string, Cell][] }
  | { t: 'table'; head: string[]; rows: Cell[][]; widths?: number[]; small?: boolean }
  | { t: 'list'; items: string[] }
  | { t: 'diagram'; svg: string; width: number; height: number }
  | { t: 'pagebreak' };

export const cellText = (c: Cell): string => (typeof c === 'string' ? c : c.text);

/** Rating colors used in every output format (Low, Medium, High, Critical). */
export const RATING_FILL = ['#2f9e44', '#e8a317', '#e8590c', '#c92a2a'];
export const RATING_TEXT = ['#ffffff', '#1b1f24', '#ffffff', '#ffffff'];
