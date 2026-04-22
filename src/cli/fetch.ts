import { loadConfig } from '../config.ts';
import { startFileLogger } from '../logger.ts';
import { fetchNewMatches, type FetchOptions } from '../remote/fetch-new-matches.ts';
import { formatOutcome } from './format-outcome.ts';

function parseArgs(argv: string[]): FetchOptions {
  const options: FetchOptions = {};
  const parsePositiveInt = (label: string, v: string | undefined): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`${label} requires a positive integer, got: ${v}`);
    }
    return n;
  };
  const parseNonNegativeInt = (label: string, v: string | undefined): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`${label} requires a non-negative integer, got: ${v}`);
    }
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit') {
      options.limit = parsePositiveInt('--limit', argv[++i]);
    } else if (arg?.startsWith('--limit=')) {
      options.limit = parsePositiveInt('--limit', arg.slice('--limit='.length));
    } else if (arg === '--skip') {
      options.skip = parseNonNegativeInt('--skip', argv[++i]);
    } else if (arg?.startsWith('--skip=')) {
      options.skip = parseNonNegativeInt('--skip', arg.slice('--skip='.length));
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--html') {
      options.htmlExport = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run fetch -- [--limit N] [--skip N] [--force] [--html]');
      console.log('  --limit N  Only process the N most recent matches (after --skip).');
      console.log('  --skip N   Skip the N most recent matches before applying --limit.');
      console.log('  --force    Re-process matches even if already seen.');
      console.log('  --html     Publish each match as an interactive page + post a link');
      console.log('             (instead of the default PNG attachments).');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main() {
  const config = loadConfig();
  const options = parseArgs(process.argv.slice(2));
  const logPath = startFileLogger('fetch', config.dataDir);
  console.log(`Logging to: ${logPath}`);
  const outcome = await fetchNewMatches(config, options);
  const { message, exitCode } = formatOutcome(outcome);
  if (exitCode === 0) {
    console.log(message);
  } else {
    console.error(message);
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
