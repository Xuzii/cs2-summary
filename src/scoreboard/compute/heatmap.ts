import type { Match } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export interface HeatmapPoint {
  worldX: number;
  worldY: number;
  worldZ: number;
  killerSide: 'CT' | 'T';
}

/**
 * Kill-location points, in CS2 world coordinates. The renderer is responsible
 * for translating to radar pixel space via src/scoreboard/maps.ts calibration.
 *
 * Returns an empty array when the parser didn't emit positions (the demo was
 * analyzed without `analyzePositions: true`).
 */
export function computeHeatmap(match: Match): HeatmapPoint[] {
  const kills = match.kills ?? [];
  const out: HeatmapPoint[] = [];
  for (const k of kills) {
    const pos = k.killerPosition ?? k.victimPosition;
    if (!pos) continue;
    const side =
      k.killerSide === TEAM_SIDE_CT ? 'CT' : k.killerSide === TEAM_SIDE_T ? 'T' : null;
    if (!side) continue;
    out.push({ worldX: pos.x, worldY: pos.y, worldZ: pos.z, killerSide: side });
  }
  return out;
}
