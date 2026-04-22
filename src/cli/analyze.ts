import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.ts';
import { startFileLogger } from '../logger.ts';
import { processDemo } from '../pipeline.ts';

async function main() {
  // Parse positional demo path and any flags (`--html`) regardless of order.
  const args = process.argv.slice(2);
  const htmlExport = args.some((a) => a === '--html');
  const positional = args.find((a) => !a.startsWith('--'));

  if (!positional) {
    console.error('Usage: npm run analyze -- <path-to-demo.dem> [--html]');
    process.exit(2);
  }

  const demoPath = path.resolve(positional);
  if (!existsSync(demoPath)) {
    console.error(`Demo file not found: ${demoPath}`);
    process.exit(2);
  }
  if (!demoPath.toLowerCase().endsWith('.dem')) {
    console.error(`Not a .dem file: ${demoPath}`);
    process.exit(2);
  }

  const config = loadConfig();
  const logPath = startFileLogger('analyze', config.dataDir);
  console.log(`Logging to: ${logPath}`);
  await processDemo(demoPath, config, { htmlExport });
  console.log('Done.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
