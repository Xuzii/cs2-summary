import { stat } from 'node:fs/promises';
import path from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

const RADAR_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'assets',
  'maps',
  'cs2',
  'radars',
);

export interface RadarAsset {
  /** Absolute filesystem path to the radar PNG. */
  filePath: string;
  /** Native width of the radar PNG (always square for CS2 radars). */
  radarSize: number;
}

/**
 * Try to locate a radar PNG for the given map and probe its native size.
 * Returns undefined if the PNG isn't bundled with the project — the caller
 * should fall back to skipping the heatmap panel.
 *
 * The `radarSize` is read from the PNG's natural width rather than hardcoded,
 * so dropping in a different-resolution radar (e.g. Valve's 2048 CS2 images)
 * requires no code changes.
 */
export async function loadRadarAsset(mapName: string): Promise<RadarAsset | undefined> {
  const filePath = path.join(RADAR_ROOT, `${mapName}.png`);
  try {
    await stat(filePath);
    const image = await loadImage(filePath);
    return { filePath, radarSize: image.width };
  } catch {
    return undefined;
  }
}
