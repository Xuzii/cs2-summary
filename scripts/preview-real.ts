import { writeFile, mkdir } from 'node:fs/promises';
import { parseDemoToJson } from '../src/analyzer/run-analyzer.ts';
import { loadMatchFromJsonFolder } from '../src/analyzer/load-match.ts';
import { computeMatchSummary } from '../src/scoreboard/compute.ts';
import { renderScoreboardPng, closeRenderer } from '../src/scoreboard/render-html.ts';

const demoPath = process.argv[2];
if (!demoPath) {
  console.error('Usage: npx tsx scripts/preview-real.ts <demo.dem>');
  process.exit(2);
}

const { outputFolder } = await parseDemoToJson({ demoPath, outputRoot: 'probe' });
const match = await loadMatchFromJsonFolder(outputFolder);
const summary = computeMatchSummary(match);
await mkdir('data', { recursive: true });
const { primary, deep } = await renderScoreboardPng(summary, { debugHtmlPath: 'data/preview-real.html' });
await writeFile('data/preview-real.png', primary);
await writeFile('data/preview-real-deep.png', deep);
console.log(`Wrote data/preview-real.png (${primary.length}B) + data/preview-real-deep.png (${deep.length}B) and data/preview-real.html`);
await closeRenderer();
