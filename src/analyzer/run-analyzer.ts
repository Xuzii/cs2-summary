import { execFile, execFileSync } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function memSnapshot(): string {
  const m = process.memoryUsage();
  return `rss=${formatMB(m.rss)} heap=${formatMB(m.heapUsed)}/${formatMB(m.heapTotal)}`;
}

/**
 * Resolve the csda binary to spawn. We reach into the package's private
 * platform module so we can spawn the binary ourselves with a custom env
 * (library's `analyzeDemo` doesn't let us pass env, and we need
 * GOMEMLIMIT/GOGC to cap its memory use).
 *
 * Windows workaround: as of v1.9.4 the npm tarball omits csda.exe (mac and
 * linux binaries ship in dist/bin, but windows-x64/ is empty). We vendor
 * csda.exe under vendor/csda/ via scripts/fetch-csda.mjs (postinstall) and
 * prefer that path when it exists.
 */
function resolveCsdaBinary(): string {
  const override = process.env['CSDA_BINARY_PATH']?.trim();
  if (override && existsSync(override)) return override;

  if (process.platform === 'win32') {
    const vendored = path.resolve(projectRoot(), 'vendor', 'csda', 'csda.exe');
    if (existsSync(vendored)) return vendored;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const platformModule = require('@akiver/cs-demo-analyzer/dist/platform');
  return platformModule.getBinaryPath();
}

/**
 * Repo root — this file lives at <root>/src/analyzer/run-analyzer.ts.
 */
function projectRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function pickDefaultMemLimit(): string {
  // Soft-cap csda conservatively. For a 280MB CS2 demo, csda's live working
  // set (all parsed events held in memory before JSON write) can legitimately
  // need 1-2 GB; GOMEMLIMIT below the working set just causes thrashing.
  // Default: 30% of system RAM, clamped to 1-3 GiB. Override via env.
  const totalMiB = Math.floor(os.totalmem() / (1024 * 1024));
  const target = Math.floor(totalMiB * 0.3);
  const clamped = Math.max(1024, Math.min(3072, target));
  return `${clamped}MiB`;
}

function pickDefaultKillLimitMB(): number {
  // Hard kill threshold. GOMEMLIMIT is advisory; Go will blow past it for
  // legitimately-live allocations. This watchdog is a circuit breaker that
  // fires when csda goes off the rails. Default: 40% of system RAM,
  // clamped to 2-12 GiB. csda legitimately uses ~10-12 GiB on large CS2
  // demos (observed 11158 MiB on a 280 MB demo), so the ceiling has to
  // accommodate that. The min exists so sub-16 GiB machines don't set a
  // trivially-low cap; the max prevents runaway allocs on a workstation
  // with tons of RAM from locking the whole box before the limit fires.
  const totalMiB = Math.floor(os.totalmem() / (1024 * 1024));
  const target = Math.floor(totalMiB * 0.4);
  return Math.max(2048, Math.min(12288, target));
}

/**
 * Read a Windows child process's Working Set (real RSS) via PowerShell.
 *
 * History: previous implementation used `tasklist /FO CSV` and split on `,`.
 * That silently returned `undefined` on every call because tasklist's memory
 * column itself contains commas (e.g. `"2,048,576 K"`), so split(',').pop()
 * grabbed only `"576 K"` — then downstream parsing threw and a blanket catch
 * swallowed the error. Result: the "kill-on-runaway-memory" watchdog was
 * entirely non-functional. See `data/logs/fetch-2026-04-21T21-01-39Z.log`
 * where every heartbeat prints `csda rss=?` for 192s straight.
 *
 * PowerShell's `Get-Process -Id ... | ExpandProperty WorkingSet64` returns a
 * single integer (bytes) on one line. `-ErrorAction SilentlyContinue` makes
 * missing-PID a clean empty output rather than a stderr error, so we can
 * distinguish "process exited" from "lookup failed" without try/catch noise.
 * `wmic` would be simpler but it's removed on Win11.
 */
let watchdogBrokenWarned = false;
function warnWatchdogBroken(detail: string): void {
  if (watchdogBrokenWarned) return;
  watchdogBrokenWarned = true;
  console.error(
    `[watchdog] cannot read csda RSS (${detail}) — memory kill is DISABLED ` +
      `for this run. csda.exe can consume unbounded RAM. Fix before parsing ` +
      `large demos.`,
  );
}

function readProcessRssMB(pid: number): number | undefined {
  if (process.platform !== 'win32') {
    // Non-Windows watchdog left unimplemented — repo is Windows-targeted.
    return undefined;
  }
  let out: string;
  try {
    out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 5_000 },
    );
  } catch (err) {
    warnWatchdogBroken(`powershell spawn failed: ${(err as Error).message}`);
    return undefined;
  }
  const trimmed = out.trim();
  if (trimmed === '') {
    // Process already exited between our last tick and this one. Not an error.
    return undefined;
  }
  const bytes = Number(trimmed);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    warnWatchdogBroken(`unexpected powershell output: ${JSON.stringify(trimmed.slice(0, 80))}`);
    return undefined;
  }
  return bytes / (1024 * 1024);
}

export interface ParseOptions {
  demoPath: string;
  /**
   * Folder where the parser writes its output. A fresh subfolder per demo is
   * created to keep runs isolated. Returned path points to that subfolder.
   */
  outputRoot: string;
  /** Include player/grenade position events. Adds parse time + size. */
  includePositions?: boolean;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export interface ParseResult {
  /** Absolute path to the folder containing the parser output. */
  outputFolder: string;
  /** Basename (no extension) — useful for locating the JSON file. */
  demoBaseName: string;
}

/**
 * Run the cs-demo-analyzer binary on a demo, producing JSON output.
 *
 * The binary writes `<demoBasename>.json` inside outputFolder when given a
 * folder as the -output arg with -format json.
 *
 * Memory: csda.exe is a Go binary that loads the whole demo into memory.
 * For a 280MB+ demo this easily reaches 2-4 GB RSS and can starve the OS
 * (Steam may die, other apps swap). We pass GOMEMLIMIT + GOGC to force
 * the Go runtime to GC aggressively and stay under a soft cap. Override
 * with env CSDA_MEM_LIMIT (e.g. "1200MiB") or CSDA_GOGC (default "50").
 */
export async function parseDemoToJson(options: ParseOptions): Promise<ParseResult> {
  const { demoPath, outputRoot, includePositions = false, onStdout, onStderr } = options;

  if (!existsSync(demoPath)) {
    throw new Error(`Demo file not found: ${demoPath}`);
  }

  const demoBaseName = path.basename(demoPath, path.extname(demoPath));
  const outputFolder = path.join(outputRoot, demoBaseName);

  await rm(outputFolder, { recursive: true, force: true });
  await mkdir(outputFolder, { recursive: true });

  const log = (msg: string) => console.log(`[${new Date().toISOString()}] [parse] ${msg}`);

  const demoStat = await stat(demoPath).catch(() => undefined);
  const memLimit = process.env['CSDA_MEM_LIMIT']?.trim() || pickDefaultMemLimit();
  const gogc = process.env['CSDA_GOGC']?.trim() || '50';
  const killLimitMB = (() => {
    const raw = process.env['CSDA_KILL_LIMIT_MB']?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return pickDefaultKillLimitMB();
  })();
  // gctrace=1 makes the Go runtime log one line per GC cycle with live heap
  // size, letting us see whether GOMEMLIMIT is being respected. Opt-in via
  // CSDA_GCTRACE=1 so normal runs aren't spammy.
  const gcTrace = process.env['CSDA_GCTRACE']?.trim() === '1';
  const godebugParts: string[] = [];
  if (gcTrace) godebugParts.push('gctrace=1');
  const godebug = godebugParts.join(',');

  log(
    `csda.exe starting (demo=${formatMB(demoStat?.size ?? 0)}, positions=${includePositions}, ` +
      `GOMEMLIMIT=${memLimit}, GOGC=${gogc}, killLimit=${killLimitMB.toFixed(0)}MB` +
      `${godebug ? `, GODEBUG=${godebug}` : ''}). Heartbeat every 5s.`,
  );
  log(`Memory before parse: ${memSnapshot()}`);

  const binary = resolveCsdaBinary();
  const args = [
    `-demo-path=${demoPath}`,
    `-output=${outputFolder}`,
    `-format=json`,
    ...(includePositions ? [`-positions`] : []),
    `-minify`,
  ];

  const startedAt = Date.now();
  let sawStderr = false;
  let sawStdout = false;
  let peakCsdaRssMB = 0;
  let killedForMemory = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile(
        binary,
        args,
        {
          windowsHide: true,
          // Allow unlimited stdout/stderr — csda can produce a lot of warnings.
          maxBuffer: 1024 * 1024 * 64,
          env: {
            ...process.env,
            GOMEMLIMIT: memLimit,
            GOGC: gogc,
            ...(godebug ? { GODEBUG: godebug } : {}),
          },
        },
        () => {
          // Swallow the callback's error argument — we decide from exit code.
        },
      );

      // Combined heartbeat + watchdog. Every 5s: log progress (node RSS +
      // csda RSS) and kill csda if it exceeds killLimitMB. 5s is a balance
      // between promptness (a runaway alloc can add GBs/sec) and the cost
      // of repeatedly spawning tasklist.exe.
      const watchdog = setInterval(() => {
        const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
        const csdaRss = child.pid !== undefined ? readProcessRssMB(child.pid) : undefined;
        if (csdaRss !== undefined && csdaRss > peakCsdaRssMB) peakCsdaRssMB = csdaRss;
        const csdaStr =
          csdaRss !== undefined ? `csda rss=${csdaRss.toFixed(0)} MB` : 'csda rss=?';
        log(`...still parsing after ${secs}s (node ${memSnapshot()}, ${csdaStr})`);

        if (csdaRss !== undefined && csdaRss > killLimitMB) {
          killedForMemory = true;
          log(
            `csda.exe exceeded kill limit (${csdaRss.toFixed(0)} MB > ${killLimitMB.toFixed(0)} MB) — killing.`,
          );
          try {
            child.kill('SIGKILL');
          } catch {
            // Already dead or unkillable — the exit handler will fire.
          }
        }
      }, 5_000);
      watchdog.unref?.();

      child.on('exit', () => clearInterval(watchdog));

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        sawStdout = true;
        const line = chunk.trimEnd();
        if (line) log(`csda stdout: ${line}`);
        onStdout?.(chunk);
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        sawStderr = true;
        const line = chunk.trimEnd();
        if (line) log(`csda stderr: ${line}`);
        onStderr?.(chunk);
      });
      child.on('error', reject);
      child.on('exit', (code, signal) => {
        if (killedForMemory) {
          reject(
            new Error(
              `csda.exe killed after exceeding ${killLimitMB.toFixed(0)} MB ` +
                `(peak=${peakCsdaRssMB.toFixed(0)} MB). Demo is likely corrupt ` +
                `or triggers a pathological allocation in the parser. ` +
                `Override with CSDA_KILL_LIMIT_MB=<MB> to allow higher use.`,
            ),
          );
          return;
        }
        if (code === 0) resolve();
        else reject(new Error(`csda.exe exited with code ${code} (signal=${signal ?? 'none'})`));
      });
    });
  } finally {
    // Interval cleared inside the child 'exit' handler; this is a safety net
    // in case the promise rejected before the exit handler ran.
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(
    `csda.exe finished in ${elapsedSec}s (stdout=${sawStdout}, stderr=${sawStderr}, ` +
      `peak csda rss=${peakCsdaRssMB.toFixed(0)} MB).`,
  );
  log(`Memory after parse: ${memSnapshot()}`);

  return { outputFolder, demoBaseName };
}
