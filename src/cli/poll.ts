import { loadConfig } from '../config.ts';
import { startFileLogger } from '../logger.ts';
import { fetchNewMatches } from '../remote/fetch-new-matches.ts';
import { formatOutcome } from './format-outcome.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce() {
  const config = loadConfig();
  try {
    const outcome = await fetchNewMatches(config);
    const { message } = formatOutcome(outcome);
    console.log(`[${new Date().toISOString()}] ${message}`);
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [poll] Unexpected error:`,
      err instanceof Error ? err.stack || err.message : err,
    );
  }
}

async function main() {
  const config = loadConfig();
  const logPath = startFileLogger('poll', config.dataDir);
  console.log(`[poll] Logging to: ${logPath}`);
  const minutes = Math.round(config.pollIntervalMs / 60000);
  console.log(
    `[poll] Starting — interval ${config.pollIntervalMs}ms (~${minutes} min). Press Ctrl+C to stop.`,
  );
  if (!config.steamId64) {
    console.log('[poll] Tip: set STEAM_ID64 in .env for a sanity check against the detected Steam account.');
  }

  let stopped = false;
  const onStop = () => {
    stopped = true;
  };
  process.on('SIGINT', onStop);
  process.on('SIGTERM', onStop);

  while (!stopped) {
    await runOnce();
    if (stopped) break;
    await sleep(config.pollIntervalMs);
  }

  console.log('[poll] Stopped.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
