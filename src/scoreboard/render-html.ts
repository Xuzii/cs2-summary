import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-core';
import type { MatchSummary, ScoreboardData } from './compute.ts';
import { loadRadarAsset, type RadarAsset } from './load-radar.ts';
import { toTemplateData } from './to-variation-b.ts';
import type { PlayerCardData } from './compute/player-card.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const TEMPLATE_PATH = path.join(HERE, 'template.html');
const FONTS = {
  anton: pathToFileURL(path.join(REPO_ROOT, 'assets', 'fonts', 'Anton-Regular.ttf')).href,
  monoReg: pathToFileURL(path.join(REPO_ROOT, 'assets', 'fonts', 'JetBrainsMono-Regular.ttf')).href,
  monoBold: pathToFileURL(path.join(REPO_ROOT, 'assets', 'fonts', 'JetBrainsMono-Bold.ttf')).href,
};

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => Boolean(p));

let browserPromise: Promise<Browser> | null = null;
let templateCache: string | null = null;

async function getTemplate(): Promise<string> {
  if (templateCache) return templateCache;
  const raw = await readFile(TEMPLATE_PATH, 'utf8');
  templateCache = raw
    .replace('__FONT_ANTON__', FONTS.anton)
    .replace('__FONT_MONO_REG__', FONTS.monoReg)
    .replace('__FONT_MONO_BOLD__', FONTS.monoBold);
  return templateCache;
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;
  const executablePath = await findChrome();
  if (!executablePath) {
    throw new Error(
      'No Chrome/Chromium binary found. Set PUPPETEER_EXECUTABLE_PATH to point at a local install.',
    );
  }
  browserPromise = puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const browser = await browserPromise;
  // Auto-close on graceful exit so the CLI tools don't leak a Chromium process.
  const shutdown = () => browser.close().catch(() => {});
  process.once('exit', shutdown);
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return browser;
}

async function findChrome(): Promise<string | undefined> {
  const { stat } = await import('node:fs/promises');
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

export interface RenderOptions {
  /** Write the fully-assembled HTML to this path for eyeballing in a browser. */
  debugHtmlPath?: string;
}

export interface RenderResult {
  /** Overview PNG: hero, scoreboards, highlights, round flow, H2H, heatmap. */
  primary: Buffer;
  /** Detailed-stats PNG: opening duels, utility, economy, clutches, entries, records, aim, bombs. */
  deep: Buffer;
}

/**
 * Shape injected into the template as `window.PLAYER`. The template's client
 * script ignores `heroMapImage` when absent, so we only populate it when the
 * caller has already resolved a radar asset.
 */
type PlayerRenderPayload = PlayerCardData & { heroMapImage: string | null };

/**
 * Render the two-page match summary PNGs by feeding `MatchSummary` into the
 * HTML template and screenshotting the `#card-primary` and `#card-deep`
 * elements in headless Chrome.
 *
 * The browser instance is lazily created and shared across calls (long-running
 * watchers avoid paying the 1-2s cold-start on every demo). Call `closeRenderer`
 * before process exit if you want to be explicit; otherwise the exit handler
 * takes care of it.
 */
export async function renderScoreboardPng(
  summary: MatchSummary,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const trace = (msg: string) => {
    if (process.env.RENDER_TRACE) console.log(`[render-html] ${msg}`);
  };
  trace('loadRadarAsset');
  const radar = await loadRadarAsset(summary.scoreboard.map);
  trace(`radar: ${radar ? radar.filePath : 'none'}`);
  const data = toTemplateData(summary, radar);
  const template = await getTemplate();
  trace('template assembled');

  const payload = `<script>window.MATCH = ${safeJson(data)};</script>`;
  const html = template.replace('</head>', `${payload}</head>`);

  if (options.debugHtmlPath) {
    await writeFile(options.debugHtmlPath, html, 'utf8');
    trace(`wrote debug html to ${options.debugHtmlPath}`);
  }

  trace('launching browser');
  const browser = await getBrowser();
  // Chrome blocks file:// resources when the document origin is `data:`/`about:blank`
  // (set via page.setContent). Write HTML to a temp file so the page origin is
  // file://, which can load sibling file:// assets (fonts, radar image).
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cs2-scoreboard-'));
  const tmpHtml = path.join(tmpDir, 'card.html');
  await writeFile(tmpHtml, html, 'utf8');
  trace(`tmp html: ${tmpHtml}`);

  trace('browser ready, opening page');
  const page: Page = await browser.newPage();
  page.on('console', (msg) => trace(`[page.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => trace(`[page.error] ${(err as Error).message}`));
  try {
    trace('setViewport');
    await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
    trace('goto');
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'domcontentloaded' });
    trace('fonts.ready');
    await page.evaluateHandle('document.fonts.ready');
    trace('waitForFunction __CARD_READY__');
    await page.waitForFunction('window.__CARD_READY__ === true', { timeout: 10_000 });
    // Wait for radar + any other images in the card to decode so the screenshot
    // isn't taken mid-load (shows broken-image icons).
    await page.evaluate(`(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );
    })()`);
    trace('images ready, capturing');
    const primary = await shoot(page, '#card-primary');
    const deep = await shoot(page, '#card-deep');
    trace(`primary ${primary.length}B, deep ${deep.length}B`);
    return { primary, deep };
  } finally {
    await page.close().catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function shoot(page: Page, selector: string): Promise<Buffer> {
  const handle = await page.$(selector);
  if (!handle) throw new Error(`Template did not render a ${selector} element.`);
  return (await handle.screenshot({ type: 'png', omitBackground: false })) as Buffer;
}

/**
 * Render one per-player performance card to PNG. Uses the same template as
 * the match summary but flips the client script into PLAYER-only mode by
 * injecting `window.PLAYER` instead of `window.MATCH`.
 *
 * Each call opens a fresh page on the shared browser; cheap enough for the
 * 5-player fan-out. Caller is responsible for resolving the radar asset (or
 * passing `null` to render without a map background).
 */
export async function renderPlayerCardPng(
  card: PlayerCardData,
  radar: RadarAsset | null,
  options: RenderOptions = {},
): Promise<Buffer> {
  const trace = (msg: string) => {
    if (process.env.RENDER_TRACE) console.log(`[render-html:player] ${msg}`);
  };
  const template = await getTemplate();
  const payloadData: PlayerRenderPayload = {
    ...card,
    heroMapImage: radar ? fileUrlFromPath(radar.filePath) : null,
  };
  const payload = `<script>window.PLAYER = ${safeJson(payloadData)};</script>`;
  const html = template.replace('</head>', `${payload}</head>`);

  if (options.debugHtmlPath) {
    await writeFile(options.debugHtmlPath, html, 'utf8');
    trace(`wrote debug html to ${options.debugHtmlPath}`);
  }

  const browser = await getBrowser();
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cs2-player-card-'));
  const tmpHtml = path.join(tmpDir, 'card.html');
  await writeFile(tmpHtml, html, 'utf8');

  const page: Page = await browser.newPage();
  page.on('console', (msg) => trace(`[page.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => trace(`[page.error] ${(err as Error).message}`));
  try {
    await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'domcontentloaded' });
    await page.evaluateHandle('document.fonts.ready');
    await page.waitForFunction('window.__CARD_READY__ === true', { timeout: 10_000 });
    await page.evaluate(`(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          });
        }),
      );
    })()`);
    return await shoot(page, '#card-player');
  } finally {
    await page.close().catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function fileUrlFromPath(absPath: string): string {
  const forward = absPath.replace(/\\/g, '/');
  return forward.startsWith('/') ? `file://${forward}` : `file:///${forward}`;
}

/** Thin re-export so legacy `ScoreboardData`-only callers keep compiling. */
export async function renderScoreboardOnlyPng(data: ScoreboardData): Promise<RenderResult> {
  const summary: MatchSummary = {
    scoreboard: data,
    highlights: [],
    roundFlow: [],
    openingDuels: [],
    utility: [],
    utilityEmpty: true,
    economy: {
      hasBuyData: false,
      teamA: {
        name: data.teamA.name,
        breakdown: { pistolWon: 0, ecoWon: 0, forceWon: 0, fullBuyWon: 0 },
        half: { firstHalf: { side: null, score: 0 }, secondHalf: { side: null, score: 0 } },
      },
      teamB: {
        name: data.teamB.name,
        breakdown: { pistolWon: 0, ecoWon: 0, forceWon: 0, fullBuyWon: 0 },
        half: { firstHalf: { side: null, score: 0 }, secondHalf: { side: null, score: 0 } },
      },
    },
    duelMatrix: { players: [], kills: [], isEmpty: true },
    heatmap: [],
    hasPositions: false,
    clutchMulti: [],
    clutchMultiEmpty: true,
    entryTrade: [],
    entryTradeEmpty: true,
    records: {
      topWeapons: [],
      fastestRound: null,
      slowestRound: null,
      longestKill: null,
      bestRound: null,
      novelty: { wallbangs: 0, noScopes: 0, throughSmoke: 0, collaterals: 0, blindKills: 0 },
    },
    recordsEmpty: true,
    aim: { rows: [], bestTap: null, bestSpray: null, topShooter: null },
    aimEmpty: true,
    bombPlays: {
      plantsA: 0,
      plantsB: 0,
      plantsTotal: 0,
      defuses: 0,
      topPlanter: null,
      topDefuser: null,
    },
    bombPlaysEmpty: true,
    roundDetails: [],
    bodyAccuracy: {},
    bodyAccuracyEmpty: true,
    eqTimeline: [],
    flashMatrix: {},
    flashMatrixEmpty: true,
    damagePerRound: {},
    roundInventory: {},
    openingsSpatial: [],
    playback: { tickrate: 64, rounds: [] },
    playbackEmpty: true,
    grenadesAgg: {
      total: 0,
      byType: { smoke: 0, flash: 0, he: 0, molotov: 0, decoy: 0 },
      topThrowers: [],
    },
    playerImpact: {},
  };
  return renderScoreboardPng(summary);
}

export async function closeRenderer(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close().catch(() => {});
}

/** JSON stringify with forward-slash escaping to avoid accidental `</script>`. */
function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
