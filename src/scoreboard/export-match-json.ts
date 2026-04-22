import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MatchSummary } from './compute.ts';
import type { PlayerCardData } from './compute/player-card.ts';
import type { RadarAsset } from './load-radar.ts';
import { toTemplateData, type TemplateData } from './to-variation-b.ts';
import { upsertMatchIndex } from '../web/index-writer.ts';

export interface MatchDocument {
  id: string;
  version: 1;
  match: TemplateData;
  players: PlayerCardData[];
}

export interface ExportResult {
  id: string;
  jsonPath: string;
  bytes: number;
}

/**
 * Serialize a computed match summary + per-player cards into the MatchDocument
 * shape consumed by the web/ React app, and write it to `outputDir/<id>.json`.
 *
 * Radar paths in TemplateData and per-player cards are intentionally
 * normalized from absolute `file://...de_mirage.png` URLs to bare map names
 * (e.g. "de_mirage"). The web app resolves those to `/static/radars/<name>.png`
 * at render time via Vite's `BASE_URL`.
 */
export async function exportMatchJson(
  summary: MatchSummary,
  playerCards: PlayerCardData[],
  radar: RadarAsset | null,
  outputDir: string,
): Promise<ExportResult> {
  const template = toTemplateData(summary, radar ?? undefined);
  const id = deriveMatchId(summary);

  // Rewrite radar paths: the web app resolves these via its `base` URL, so we
  // ship only the map name and let the client do the URL construction.
  const mapName = summary.scoreboard.map;
  const webMatch: TemplateData = {
    ...template,
    heroMapImage: radar ? mapName : null,
    heatmap: template.heatmap ? { ...template.heatmap, radarFileUrl: mapName } : null,
  };

  const webPlayers: PlayerCardData[] = playerCards.map((p) => ({
    ...p,
    heroMapImage: radar ? mapName : null,
  }));

  const doc: MatchDocument = {
    id,
    version: 1,
    match: webMatch,
    players: webPlayers,
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${id}.json`);
  const body = JSON.stringify(doc);
  await writeFile(jsonPath, body, 'utf8');

  // Upsert into the matches index so the Past Matches page can list this.
  await upsertMatchIndex(summary, id, outputDir);

  return { id, jsonPath, bytes: Buffer.byteLength(body) };
}

/**
 * Build a stable, human-readable id for this match. Deterministic from the
 * match date + map + per-team score + sorted steam IDs, so re-processing the
 * same demo overwrites the same JSON (idempotent publishes) instead of
 * duplicating.
 *
 * Shape: `<YYYY-MM-DD>-<mapName>-<6-char-hash>`
 */
export function deriveMatchId(summary: MatchSummary): string {
  const sb = summary.scoreboard;
  const yyyymmdd = sb.date ? formatDatePart(sb.date) : 'no-date';
  const map = sb.map || 'unknown';
  const ids = [...sb.teamA.players, ...sb.teamB.players]
    .map((p) => p.steamId)
    .sort()
    .join(',');
  const seed = `${yyyymmdd}|${map}|${sb.teamA.score}-${sb.teamB.score}|${ids}`;
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 6);
  return `${yyyymmdd}-${map}-${hash}`;
}

function formatDatePart(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
