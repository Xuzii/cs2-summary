/**
 * World → radar pixel transform. Ported from `src/scoreboard/maps.ts` (which
 * was itself ported from cs-demo-manager). Duplicated on the web side because
 * tsconfig boundaries prevent web/ from importing from src/.
 */

export interface MapCalibration {
  posX: number;
  posY: number;
  scale: number;
  thresholdZ?: number;
}

export const MAP_CALIBRATION: Record<string, MapCalibration> = {
  de_ancient: { posX: -2953, posY: 2164, scale: 5 },
  de_anubis: { posX: -2796, posY: 3328, scale: 5.22 },
  de_dust2: { posX: -2476, posY: 3239, scale: 4.4 },
  de_inferno: { posX: -2087, posY: 3870, scale: 4.9 },
  de_mirage: { posX: -3230, posY: 1713, scale: 5 },
  de_nuke: { posX: -3453, posY: 2887, scale: 7, thresholdZ: -495 },
  de_overpass: { posX: -4831, posY: 1781, scale: 5.2 },
  de_train: { posX: -2308, posY: 2078, scale: 4.082077 },
  de_vertigo: { posX: -3168, posY: 1762, scale: 4, thresholdZ: 11700 },
  de_cache: { posX: -2000, posY: 3250, scale: 5.5 },
};

export function getMapCalibration(mapName: string): MapCalibration | undefined {
  return MAP_CALIBRATION[mapName];
}

/**
 * Translate a CS2 world coordinate to a pixel position on a rendered radar.
 * `radarSize` is the natural width of the radar PNG; `imageSize` is the target
 * rendered square size (e.g. 600 for a 600×600 display box).
 */
export function worldToRadar(
  cal: MapCalibration,
  worldX: number,
  worldY: number,
  radarSize: number,
  imageSize: number,
): { x: number; y: number } {
  const xForDefault = (worldX - cal.posX) / cal.scale;
  const scaledX = (xForDefault * imageSize) / radarSize;
  const yForDefault = (cal.posY - worldY) / cal.scale;
  const scaledY = (yForDefault * imageSize) / radarSize;
  return { x: scaledX, y: scaledY };
}

/**
 * Convenience: given a map name, world coords, and the radar PNG's native
 * width, return a `{left, top}` percent object for absolute positioning
 * inside an `imageSize`×`imageSize` square container. Falls back to centered
 * placeholders (50/50) when the map is unknown.
 */
export function worldToPct(
  mapName: string,
  worldX: number,
  worldY: number,
  radarNaturalWidth: number,
  imageSize: number,
): { left: string; top: string } {
  const cal = getMapCalibration(mapName);
  if (!cal || !radarNaturalWidth) return { left: '50%', top: '50%' };
  const { x, y } = worldToRadar(cal, worldX, worldY, radarNaturalWidth, imageSize);
  return { left: `${(x / imageSize) * 100}%`, top: `${(y / imageSize) * 100}%` };
}
