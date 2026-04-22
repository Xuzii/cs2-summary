import 'dotenv/config';
import path from 'node:path';

export interface AppConfig {
  discordWebhookUrl: string;
  demosFolderOverride: string | undefined;
  dataDir: string;
  includePositions: boolean;
  steamId64: string | undefined;
  pollIntervalMs: number;
  demoDownloadFolder: string | undefined;
  /**
   * Ordered, de-duped list of SteamID64s to render per-player performance
   * cards for. Starts with `steamId64` when set, followed by the comma-
   * separated IDs in `TRACKED_PLAYERS`.
   */
  trackedPlayerIds: string[];
}

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000;

export function loadConfig(): AppConfig {
  const webhook = process.env['DISCORD_WEBHOOK_URL']?.trim();
  if (!webhook) {
    throw new Error('DISCORD_WEBHOOK_URL is not set. Copy .env.example to .env and fill it in.');
  }
  if (!/^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\//.test(webhook)) {
    throw new Error('DISCORD_WEBHOOK_URL does not look like a Discord webhook URL.');
  }

  const dataDir = process.env['DATA_DIR']?.trim() || path.resolve(process.cwd(), 'data');
  const demosFolderOverride = process.env['DEMOS_FOLDER']?.trim() || undefined;
  const includePositions = process.env['INCLUDE_POSITIONS']?.toLowerCase() === 'true';

  const steamId64 = process.env['STEAM_ID64']?.trim() || undefined;
  if (steamId64 && !/^\d{17}$/.test(steamId64)) {
    throw new Error(`STEAM_ID64 must be a 17-digit SteamID64, got: ${steamId64}`);
  }

  const rawInterval = process.env['POLL_INTERVAL_MS']?.trim();
  let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  if (rawInterval) {
    const parsed = Number(rawInterval);
    if (!Number.isFinite(parsed) || parsed < 30_000) {
      throw new Error('POLL_INTERVAL_MS must be a number >= 30000 (30 seconds).');
    }
    pollIntervalMs = parsed;
  }

  const demoDownloadFolder = process.env['DEMO_DOWNLOAD_FOLDER']?.trim() || undefined;

  const tracked = (process.env['TRACKED_PLAYERS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const id of tracked) {
    if (!/^\d{17}$/.test(id)) {
      throw new Error(`TRACKED_PLAYERS contains a non-17-digit id: ${id}`);
    }
  }
  const seen = new Set<string>();
  const trackedPlayerIds: string[] = [];
  for (const id of [...(steamId64 ? [steamId64] : []), ...tracked]) {
    if (seen.has(id)) continue;
    seen.add(id);
    trackedPlayerIds.push(id);
  }

  return {
    discordWebhookUrl: webhook,
    demosFolderOverride,
    dataDir,
    includePositions,
    steamId64,
    pollIntervalMs,
    demoDownloadFolder,
    trackedPlayerIds,
  };
}
