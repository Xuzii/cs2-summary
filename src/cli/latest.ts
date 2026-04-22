import { loadConfig } from '../config.ts';
import { findLatestDemo, resolveReplaysFolder } from '../latest/find-latest-demo.ts';
import { processDemo } from '../pipeline.ts';

async function main() {
  const config = loadConfig();
  const folder = await resolveReplaysFolder(config.demosFolderOverride);
  console.log(`Replays folder: ${folder}`);

  const demoPath = await findLatestDemo(folder);
  console.log(`Latest demo: ${demoPath}`);

  await processDemo(demoPath, config);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
