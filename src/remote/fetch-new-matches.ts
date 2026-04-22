import type { AppConfig } from '../config.ts';
import { resolveReplaysFolder } from '../latest/find-latest-demo.ts';
import { processDemo } from '../pipeline.ts';
import { BoilerError, defaultBoilerWorkDir, runBoiler } from './boiler.ts';
import { downloadMatchDemo, extractMatchMeta } from './download-demo.ts';
import { loadSeenMatches } from './seen-matches.ts';

const log = (msg: string) => console.log(`[${new Date().toISOString()}] [fetch] ${msg}`);

export type FetchOutcome =
  | { kind: 'ok'; downloaded: number; skipped: number; detectedSteamId: string | undefined }
  | { kind: 'cs2-running' }
  | { kind: 'steam-not-ready'; message: string }
  | { kind: 'steam-id-mismatch'; expected: string; detected: string }
  | { kind: 'no-matches' };

export interface FetchOptions {
  /** Only process up to this many of the most recent matches. Undefined = all. */
  limit?: number;
  /** Ignore the seen-matches store and re-post even matches already processed. */
  force?: boolean;
  /**
   * Skip this many of the most recent matches before taking `limit`. Useful
   * for sidestepping a specific recent demo (e.g. a corrupt file that crashes
   * the parser) without polluting the seen-matches store.
   */
  skip?: number;
  /**
   * When true, route every downloaded match through the pipeline's interactive
   * HTML export path (publishes JSON to gh-pages + posts a link to Discord)
   * instead of the default PNG path. `HTML_EXPORT=1` env var is honored as a
   * fallback, so `npm run poll` works without CLI flags.
   */
  htmlExport?: boolean;
}

/**
 * Fetch any new MM matches from Steam, download and process them, and return
 * a structured outcome so callers (one-shot CLI vs long-running poller) can
 * render status differently.
 */
export async function fetchNewMatches(config: AppConfig, options: FetchOptions = {}): Promise<FetchOutcome> {
  const downloadFolder = config.demoDownloadFolder ?? (await resolveReplaysFolder(config.demosFolderOverride));
  log(`Download folder: ${downloadFolder}`);

  const seen = await loadSeenMatches(config.dataDir);
  log(`Seen-matches store loaded (dataDir=${config.dataDir}).`);

  const workDir = defaultBoilerWorkDir(config.dataDir);

  let matchList;
  let detectedSteamId: string | undefined;
  try {
    log('Running boiler-writter to fetch recent matches from Steam GC...');
    const result = await runBoiler({ workDir });
    matchList = result.matchList;
    detectedSteamId = result.detectedSteamId;
    log(`Boiler returned ${(matchList.matches ?? []).length} match(es). SteamID=${detectedSteamId ?? 'unknown'}.`);
  } catch (err) {
    if (err instanceof BoilerError) {
      if (err.code === 'AlreadyConnected') {
        return { kind: 'cs2-running' };
      }
      if (err.code === 'NoMatchesFound') {
        return { kind: 'no-matches' };
      }
      if (
        err.code === 'SteamNotRunningOrLoggedIn' ||
        err.code === 'UserNotLoggedIn' ||
        err.code === 'SteamRestartRequired' ||
        err.code === 'CommunicationFailure'
      ) {
        return { kind: 'steam-not-ready', message: err.message };
      }
    }
    throw err;
  }

  if (config.steamId64 && detectedSteamId && detectedSteamId !== config.steamId64) {
    return { kind: 'steam-id-mismatch', expected: config.steamId64, detected: detectedSteamId };
  }

  const allMatches = matchList.matches ?? [];
  if (allMatches.length === 0) {
    return { kind: 'no-matches' };
  }

  // Boiler returns matches in the order Steam's GC supplies them (most recent
  // first). `skip` drops the N newest, then `limit` caps how many of the rest
  // to process.
  const skip = options.skip ?? 0;
  const end = options.limit !== undefined ? skip + options.limit : undefined;
  const matches = allMatches.slice(skip, end);
  if (skip > 0 || options.limit !== undefined) {
    log(
      `Selected ${matches.length} of ${allMatches.length} matches ` +
        `(skip=${skip}${options.limit !== undefined ? `, limit=${options.limit}` : ''}).`,
    );
  }

  let downloaded = 0;
  let skipped = 0;

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const prefix = `[${i + 1}/${matches.length}]`;

    const meta = extractMatchMeta(match);
    if (!meta) {
      log(`${prefix} No demo metadata — skipping.`);
      skipped += 1;
      continue;
    }
    const reservationIdStr = meta.reservationId.toString();
    if (!options.force && seen.isSeen(reservationIdStr)) {
      log(`${prefix} ${reservationIdStr} already seen — skipping.`);
      skipped += 1;
      continue;
    }

    log(`${prefix} Downloading match ${reservationIdStr}...`);
    let dl;
    try {
      dl = await downloadMatchDemo({ matchInfo: match, outputFolder: downloadFolder });
    } catch (err) {
      log(`${prefix} Download failed for ${reservationIdStr}: ${err instanceof Error ? err.message : err}`);
      // Do NOT mark seen — next run retries.
      skipped += 1;
      continue;
    }
    if (!dl) {
      log(`${prefix} Skipped ${reservationIdStr} (demo link missing or expired).`);
      await seen.markSeen(reservationIdStr);
      skipped += 1;
      continue;
    }

    log(`${prefix} Processing demo ${dl.demoPath}...`);
    try {
      await processDemo(dl.demoPath, config, { htmlExport: options.htmlExport });
      downloaded += 1;
      log(`${prefix} Done with ${reservationIdStr}.`);
    } catch (err) {
      log(`${prefix} Pipeline failed for ${reservationIdStr}: ${err instanceof Error ? err.message : err}`);
      // Do NOT mark seen — next run will retry parsing the downloaded demo.
      skipped += 1;
      continue;
    }

    await seen.markSeen(reservationIdStr);
  }

  log(`Fetch complete: downloaded=${downloaded}, skipped=${skipped}.`);
  return { kind: 'ok', downloaded, skipped, detectedSteamId };
}
