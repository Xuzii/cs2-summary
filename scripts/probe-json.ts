import { parseDemoToJson } from '../src/analyzer/run-analyzer.ts';

const demoPath = process.argv[2];
if (!demoPath) {
  console.error('Usage: npx tsx scripts/probe-json.ts <demo.dem>');
  process.exit(2);
}

const out = await parseDemoToJson({
  demoPath,
  outputRoot: 'probe',
});
console.log('Parser output folder:', out.outputFolder);
