import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MatchSummary } from '../scoreboard/compute.ts';

export interface MatchIndexEntry {
  id: string;
  date: string | null;
  mapName: string;
  mapPretty: string;
  teamA: { name: string; score: number };
  teamB: { name: string; score: number };
  winner: 'A' | 'B' | 'draw';
  durationLabel: string;
  durationSec: number;
  mvp: string | null;
  source: string | null;
  shareCode: string | null;
}

/**
 * Upsert a match into `<matchesDir>/index.json`.
 *
 * - Reads the existing index (empty array if missing)
 * - Replaces any entry with the same id, otherwise inserts
 * - Sorts by date desc (newest first), ties broken by id
 */
export async function upsertMatchIndex(
  summary: MatchSummary,
  matchId: string,
  matchesDir: string,
): Promise<MatchIndexEntry> {
  const sb = summary.scoreboard;
  const mvpHighlight = summary.highlights.find((h) => h.label.toLowerCase() === 'mvp');
  const mvp = mvpHighlight?.player ?? null;

  const entry: MatchIndexEntry = {
    id: matchId,
    date: sb.date ? sb.date.toISOString() : null,
    mapName: sb.map,
    mapPretty: prettyMap(sb.map),
    teamA: { name: sb.teamA.name, score: sb.teamA.score },
    teamB: { name: sb.teamB.name, score: sb.teamB.score },
    winner: sb.winner,
    durationLabel: formatDuration(sb.durationSec),
    durationSec: sb.durationSec,
    mvp,
    source: sb.source,
    shareCode: sb.shareCode,
  };

  await mkdir(matchesDir, { recursive: true });
  const indexPath = path.join(matchesDir, 'index.json');
  let existing: MatchIndexEntry[] = [];
  try {
    const buf = await readFile(indexPath, 'utf8');
    const parsed = JSON.parse(buf);
    if (Array.isArray(parsed)) existing = parsed as MatchIndexEntry[];
  } catch {
    // fine — first write
  }

  const filtered = existing.filter((e) => e.id !== matchId);
  filtered.push(entry);
  filtered.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.id.localeCompare(b.id);
  });

  await writeFile(indexPath, JSON.stringify(filtered, null, 0), 'utf8');
  return entry;
}

function prettyMap(mapName: string): string {
  return mapName.replace(/^de_/, '').replace(/^cs_/, '').replace(/^ar_/, '');
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
