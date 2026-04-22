/**
 * Map calibration + world→radar coordinate transforms.
 *
 * Values ported from cs-demo-manager's `src/node/database/maps/default-maps.ts`.
 * `radarSize` is NOT baked into the table: cs-demo-manager passes the actual
 * radar PNG's `naturalWidth` into the scale formula at render time, so swapping
 * in a higher-resolution radar (e.g. CS2's post-2025-05-09 2048 images) keeps
 * the transform correct without any recalibration. We do the same.
 */

export interface MapCalibration {
  /** World X at radar (0, 0). */
  posX: number;
  /** World Y at radar (0, 0). Note: Y is inverted when scaling. */
  posY: number;
  /** World-units-per-radar-pixel at the radar's native resolution. */
  scale: number;
  /**
   * Optional Z threshold for multi-level maps (e.g. de_nuke). Above = upper
   * radar, below = lower radar. We only carry the upper layer for now.
   */
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

/**
 * Translate a CS2 world coordinate to a pixel position on a radar image.
 *
 * `radarSize` must be the actual native width of the radar PNG being rendered
 * (query `image.naturalWidth`). `imageSize` is the display target (e.g. the
 * 600px square we paint onto). Ported from cs-demo-manager's
 * get-scaled-coordinate-{x,y}.
 */
export function worldToRadar(
  cal: MapCalibration,
  worldX: number,
  worldY: number,
  radarSize: number,
  imageSize: number,
): { x: number; y: number } {
  const xForDefaultRadarWidth = (worldX - cal.posX) / cal.scale;
  const scaledX = (xForDefaultRadarWidth * imageSize) / radarSize;

  // Y is inverted: larger world-Y renders higher on the radar image.
  const yForDefaultRadarHeight = (cal.posY - worldY) / cal.scale;
  const scaledY = (yForDefaultRadarHeight * imageSize) / radarSize;

  return { x: scaledX, y: scaledY };
}

export function getMapCalibration(mapName: string): MapCalibration | undefined {
  return MAP_CALIBRATION[mapName];
}
