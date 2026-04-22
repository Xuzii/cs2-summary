import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig } from './config.ts';
import { parseDemoToJson } from './analyzer/run-analyzer.ts';
import { loadMatchFromJsonFolder } from './analyzer/load-match.ts';
import { computeMatchSummary } from './scoreboard/compute.ts';
import { renderScoreboardPng, renderPlayerCardPng, closeRenderer } from './scoreboard/render-html.ts';
import {
  postScoreboardToDiscord,
  postPlayerCardToDiscord,
  postMatchLinkToDiscord,
} from './discord/post-webhook.ts';
import { computePlayerCard } from './scoreboard/compute/player-card.ts';
import { loadRadarAsset } from './scoreboard/load-radar.ts';
import { exportMatchJson } from './scoreboard/export-match-json.ts';
import { deployMatchToGhPages } from './web/deploy.ts';
import type { Match } from './analyzer/types.ts';
import type { MatchSummary, ScoreboardData } from './scoreboard/compute.ts';

export interface PipelineOptions {
  /** When true, also (or instead) publish an interactive HTML page per this config. */
  htmlExport?: boolean;
}

export interface PipelineResult {
  match: Match;
  scoreboard: ScoreboardData;
  summary: MatchSummary;
  /** PNG sizes, or 0 when the flag-on mode skipped the screenshot path. */
  primaryPngBytes: number;
  deepPngBytes: number;
  /** Public URL of the published interactive page, when htmlExport was enabled. */
  htmlUrl?: string;
}

/**
 * End-to-end pipeline: parse demo → compute match summary → render PNG →
 * post to Discord → clean temp files. Returns the in-memory artifacts
 * so callers or tests can inspect them before they disappear.
 */
export async function processDemo(
  demoPath: string,
  config: AppConfig,
  options: PipelineOptions = {},
): Promise<PipelineResult> {
  const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);
  log(`Parsing demo: ${demoPath}`);

  const htmlExport = options.htmlExport ?? process.env['HTML_EXPORT'] === '1';

  const { outputFolder } = await parseDemoToJson({
    demoPath,
    outputRoot: config.dataDir,
    includePositions: config.includePositions,
    onStderr: (line) => process.stderr.write(`[csda] ${line}`),
  });

  try {
    log(`Loading parsed match from ${outputFolder}`);
    const match = await loadMatchFromJsonFolder(outputFolder);

    log(`Computing match summary for ${match.teamA.name} vs ${match.teamB.name} on ${match.mapName}`);
    const summary = computeMatchSummary(match);

    // Player cards are shared between the PNG and HTML paths.
    const playerCards = config.trackedPlayerIds
      .map((steamId) => computePlayerCard(match, steamId))
      .filter((card): card is NonNullable<typeof card> => card !== null);

    if (htmlExport) {
      log('HTML export mode: serializing match JSON and deploying to gh-pages');
      const radar = (await loadRadarAsset(match.mapName).catch(() => null)) ?? null;

      const publishDir = process.env['HTML_PUBLISH_DIR']
        ? path.resolve(process.env['HTML_PUBLISH_DIR'])
        : path.resolve(process.cwd(), 'publish');
      const siteUrl = (process.env['HTML_SITE_URL'] || 'https://xuzii.github.io/cs2-summary').replace(/\/$/, '');

      // Write per-match JSON next to the checked-out gh-pages clone so the
      // deploy step is a plain `git push`. Reusing the same `matches/` dir
      // (writeDir === the publish dir) makes the export idempotent: a repeat
      // run produces the same bytes and `git status` reports no change.
      const writeDir = path.join(publishDir, 'matches');
      const exportResult = await exportMatchJson(summary, playerCards, radar, writeDir);
      log(`Wrote ${exportResult.jsonPath} (${exportResult.bytes}B)`);

      const deployResult = await deployMatchToGhPages({
        sourceJsonPath: exportResult.jsonPath,
        matchId: exportResult.id,
        publishDir,
      });
      log(deployResult.message);

      const matchUrl = `${siteUrl}/?m=${encodeURIComponent(exportResult.id)}`;
      log(`Posting Discord link: ${matchUrl}`);
      await postMatchLinkToDiscord({
        webhookUrl: config.discordWebhookUrl,
        scoreboard: summary.scoreboard,
        matchUrl,
      });

      log('Done. Cleaning up temp files.');
      return {
        match,
        scoreboard: summary.scoreboard,
        summary,
        primaryPngBytes: 0,
        deepPngBytes: 0,
        htmlUrl: matchUrl,
      };
    }

    log('Rendering PNGs');
    const { primary, deep } = await renderScoreboardPng(summary);

    log(`Posting to Discord (primary ${primary.byteLength}B, deep ${deep.byteLength}B)`);
    await postScoreboardToDiscord({
      webhookUrl: config.discordWebhookUrl,
      scoreboard: summary.scoreboard,
      primaryPng: primary,
      deepPng: deep,
      filenameBase: `scoreboard-${path.basename(demoPath, path.extname(demoPath))}`,
    });

    // Per-player performance cards for configured tracked SteamIDs. Silently
    // skips players who weren't in this match; skips the whole fan-out when
    // no tracked player played.
    if (playerCards.length > 0) {
      const radar = await loadRadarAsset(match.mapName).catch(() => null);
      log(`Rendering ${playerCards.length} player card${playerCards.length === 1 ? '' : 's'}`);
      for (let i = 0; i < playerCards.length; i++) {
        const card = playerCards[i]!;
        const png = await renderPlayerCardPng(card, radar ?? null);
        log(`Posting player card ${i + 1}/${playerCards.length}: ${card.player.name}`);
        await postPlayerCardToDiscord({
          webhookUrl: config.discordWebhookUrl,
          card,
          png,
          index: i + 1,
          total: playerCards.length,
          filenameBase: `player-${card.player.steamId}`,
        });
      }
    }

    log('Posted. Cleaning up temp files.');
    return {
      match,
      scoreboard: summary.scoreboard,
      summary,
      primaryPngBytes: primary.byteLength,
      deepPngBytes: deep.byteLength,
    };
  } finally {
    if (process.env.DEBUG_KEEP_OUTPUT) {
      console.log(`[debug] keeping parser output at ${outputFolder}`);
    } else {
      await rm(outputFolder, { recursive: true, force: true }).catch(() => {
        // Non-fatal: leave orphan data for the user to inspect.
      });
    }
    // Close the Puppeteer browser between runs so Chromium doesn't accumulate
    // memory across a long-running watcher. The 1-2s cold-start on the next
    // render is dwarfed by the ~60-180s parse. Set KEEP_RENDERER_WARM=1 to
    // opt back into the warm-browser behavior (fastest but leaks Chromium
    // memory across demos over a multi-hour watch session).
    if (!process.env.KEEP_RENDERER_WARM) {
      await closeRenderer().catch(() => {
        // Non-fatal: getBrowser() also hooks process-exit to close the
        // browser if this direct close failed.
      });
    }
  }
}
