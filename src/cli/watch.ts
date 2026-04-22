import chokidar from 'chokidar';
import path from 'node:path';
import { loadConfig } from '../config.ts';
import { startFileLogger } from '../logger.ts';
import { resolveReplaysFolder } from '../latest/find-latest-demo.ts';
import { processDemo } from '../pipeline.ts';

async function main() {
  const htmlExport = process.argv.slice(2).some((a) => a === '--html');
  const config = loadConfig();
  const logPath = startFileLogger('watch', config.dataDir);
  console.log(`Logging to: ${logPath}`);
  const folder = await resolveReplaysFolder(config.demosFolderOverride);
  console.log(`Watching for new demos in: ${folder}`);
  if (htmlExport) console.log('Mode: interactive HTML publish (--html).');
  console.log('Press Ctrl+C to stop.');

  const processed = new Set<string>();
  let queue: Promise<void> = Promise.resolve();

  const watcher = chokidar.watch(folder, {
    persistent: true,
    ignoreInitial: true, // only process files added after watcher starts
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: 5000,
      pollInterval: 500,
    },
  });

  watcher.on('add', (filePath) => {
    if (!filePath.toLowerCase().endsWith('.dem')) return;
    const resolved = path.resolve(filePath);
    if (processed.has(resolved)) return;
    processed.add(resolved);

    console.log(`\nNew demo detected: ${resolved}`);
    queue = queue.then(async () => {
      try {
        await processDemo(resolved, config, { htmlExport });
        console.log('Done. Watching for next demo...\n');
      } catch (err) {
        console.error(`Failed to process ${resolved}:`, err instanceof Error ? err.message : err);
      }
    });
  });

  watcher.on('error', (err) => {
    console.error('Watcher error:', err);
  });

  await new Promise(() => {
    // Run forever until SIGINT.
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
