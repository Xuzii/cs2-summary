import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
// unbzip2-stream has no bundled types.
// @ts-expect-error: no type declarations available.
import bunzip from 'unbzip2-stream';
import type { CDataGCCStrike15_v2_MatchInfo } from 'csgo-protobuf';

const log = (msg: string) => console.log(`[${new Date().toISOString()}] [download] ${msg}`);

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Pass-through stream that counts bytes and calls onProgress at most once
 * every `intervalMs` wall-clock ms (and once at end-of-stream).
 */
function byteCounter(intervalMs: number, onProgress: (bytes: number) => void): Transform {
  let total = 0;
  let lastLogAt = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      const now = Date.now();
      if (now - lastLogAt >= intervalMs) {
        lastLogAt = now;
        onProgress(total);
      }
      cb(null, chunk);
    },
    flush(cb) {
      onProgress(total);
      cb();
    },
  });
}

export interface DownloadResult {
  demoPath: string;
  reservationId: string;
  demoUrl: string;
}

/**
 * Extract the fields we care about from a match-info protobuf. Mirrors the
 * helpers in cs-demo-manager's valve-match module.
 */
export function extractMatchMeta(matchInfo: CDataGCCStrike15_v2_MatchInfo) {
  const roundstatsall = matchInfo.roundstatsall ?? [];
  // roundstatsLegacy is the CSGO legacy field; CS2 MM uses the tail of roundstatsall.
  const legacy = (matchInfo as unknown as { roundstatsLegacy?: { reservationid?: bigint; map?: string } })
    .roundstatsLegacy;
  const lastRound = legacy ?? roundstatsall[roundstatsall.length - 1];

  if (!lastRound) {
    return undefined;
  }

  const demoUrl = lastRound.map;
  const reservationId = lastRound.reservationid;
  if (demoUrl === undefined || reservationId === undefined) {
    return undefined;
  }

  const watchInfo = matchInfo.watchablematchinfo;
  const tvPort = watchInfo?.tvPort ?? 0;
  const serverIp = watchInfo?.serverIp ?? 0;

  return { demoUrl, reservationId, tvPort, serverIp };
}

/** Mirrors cs-demo-manager's buildMatchName convention. */
export function buildDemoFileName(reservationId: bigint, tvPort: number, serverIp: number): string {
  return `match730_${reservationId.toString().padStart(21, '0')}_${tvPort
    .toString()
    .padStart(10, '0')}_${serverIp}`;
}

/**
 * HEAD-check a demo URL: Valve's .dem.bz2 download links expire after about a
 * month; a missing file returns 404.
 */
async function isDemoLinkAvailable(demoUrl: string): Promise<boolean> {
  try {
    const res = await fetch(demoUrl, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

export interface DownloadOptions {
  matchInfo: CDataGCCStrike15_v2_MatchInfo;
  outputFolder: string;
}

/**
 * Download the .dem.bz2 for a match, decompressing to <outputFolder>/<name>.dem.
 *
 * Returns undefined when the demo URL is missing, expired, or we cannot read
 * the reservation id — callers treat these as "skip, move on".
 */
export async function downloadMatchDemo(options: DownloadOptions): Promise<DownloadResult | undefined> {
  const { matchInfo, outputFolder } = options;

  const meta = extractMatchMeta(matchInfo);
  if (!meta) {
    log('No demo metadata in match-info (missing demo URL or reservation id).');
    return undefined;
  }

  const { demoUrl, reservationId, tvPort, serverIp } = meta;
  log(`Reservation ${reservationId.toString()} (tvPort=${tvPort}, serverIp=${serverIp}).`);

  await mkdir(outputFolder, { recursive: true });
  const baseName = buildDemoFileName(reservationId, tvPort, serverIp);
  const demoPath = path.join(outputFolder, `${baseName}.dem`);

  if (existsSync(demoPath)) {
    log(`Already on disk: ${demoPath} — skipping download.`);
    return { demoPath, reservationId: reservationId.toString(), demoUrl };
  }

  log(`HEAD-checking demo URL...`);
  if (!(await isDemoLinkAvailable(demoUrl))) {
    log(`Demo URL not available (404/expired) for reservation ${reservationId.toString()}.`);
    return undefined;
  }

  log(`Fetching ${demoUrl}`);
  const response = await fetch(demoUrl);
  if (!response.ok || !response.body) {
    log(`Fetch failed: status=${response.status} ${response.statusText}`);
    return undefined;
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  log(`Download started → ${demoPath} (compressed size: ${totalBytes ? formatMB(totalBytes) : 'unknown'}).`);

  const startedAt = Date.now();
  const compressedCounter = byteCounter(2000, (bytes) => {
    const pct = totalBytes ? ` (${((bytes / totalBytes) * 100).toFixed(1)}%)` : '';
    const secs = (Date.now() - startedAt) / 1000;
    const rate = secs > 0 ? formatMB(bytes / secs) + '/s' : '';
    log(`  compressed: ${formatMB(bytes)}${pct} @ ${rate}`);
  });
  const decompressedCounter = byteCounter(2000, (bytes) => {
    log(`  decompressed: ${formatMB(bytes)}`);
  });

  const out = createWriteStream(demoPath);
  try {
    // response.body is a web ReadableStream; wrap for node pipeline + pipe
    // through bunzip2 to produce the raw .dem bytes.
    await pipeline(
      Readable.fromWeb(response.body as never),
      compressedCounter,
      bunzip(),
      decompressedCounter,
      out,
    );
  } catch (err) {
    log(`Streaming failed: ${err instanceof Error ? err.message : String(err)} — removing partial file.`);
    await unlink(demoPath).catch(() => {});
    throw err;
  }

  // Sanity: if the decompressed file is suspiciously small, treat as failure.
  const st = await stat(demoPath);
  if (st.size < 1024) {
    log(`Decompressed file suspiciously small (${st.size}B) — removing and skipping.`);
    await unlink(demoPath).catch(() => {});
    return undefined;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`Download complete: ${demoPath} (${formatMB(st.size)} decompressed, ${elapsed}s).`);

  return { demoPath, reservationId: reservationId.toString(), demoUrl };
}
