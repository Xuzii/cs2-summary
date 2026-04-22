import type { Side } from '../types';

export const sideClass = (s: Side | null | undefined): 'ct' | 't' =>
  s === 'CT' ? 'ct' : 't';

/** Shorten a gamer tag for tight matrix columns: drops clan tags, .exe/.com
 *  suffixes, non-word tails, uppercases, and truncates to `maxLen`. */
export function abbrevName(name: string, maxLen: number): string {
  let s = String(name || '');
  s = s.replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, '');
  s = s.replace(/\.(exe|com|net|io|gg|tv)$/i, '');
  s = s.replace(/[_\-\s]+/g, ' ').trim();
  const first = s.split(/\s+/)[0] || s;
  const core = first.replace(/\d+$/, '') || first;
  const up = core.toUpperCase();
  return up.length > maxLen ? up.slice(0, maxLen) : up;
}

/** Resolve a map name (e.g. "de_mirage") to the Vite-served radar URL. */
export function radarUrl(mapName: string | null | undefined): string | null {
  if (!mapName) return null;
  return `${import.meta.env.BASE_URL}static/radars/${mapName}.png`;
}
