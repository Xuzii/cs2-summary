import { spawn } from 'node:child_process';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface DeployOptions {
  /** Absolute path to the source JSON written by exportMatchJson. */
  sourceJsonPath: string;
  /** Match id (used as the filename inside matches/). */
  matchId: string;
  /**
   * Working copy of the gh-pages branch. A fresh clone checked out to the
   * `gh-pages` branch — the deploy script commits + pushes from this dir.
   * Created by scripts/setup-web-publish.mjs on first use.
   */
  publishDir: string;
}

export interface DeployResult {
  committed: boolean;
  pushed: boolean;
  message: string;
}

/**
 * Copy a per-match JSON into the gh-pages clone and git push it.
 *
 * Uses a pre-existing publish clone (`scripts/setup-web-publish.mjs` creates
 * it) rather than managing auth or doing raw API uploads, so the user's
 * existing git credentials do the talking. Idempotent: if the same matchId
 * JSON already exists with identical content, git sees no diff and we skip
 * the commit cleanly.
 */
export async function deployMatchToGhPages(opts: DeployOptions): Promise<DeployResult> {
  const { sourceJsonPath, matchId, publishDir } = opts;

  try {
    await stat(publishDir);
  } catch {
    throw new Error(
      `Publish dir not found at ${publishDir}. Run \`node scripts/setup-web-publish.mjs\` once before using --html.`,
    );
  }

  const matchesDir = path.join(publishDir, 'matches');
  await mkdir(matchesDir, { recursive: true });

  const dest = path.join(matchesDir, `${matchId}.json`);
  await copyFile(sourceJsonPath, dest);

  // Pull first so concurrent deploys or manual edits don't clobber each other.
  await run('git', ['pull', '--rebase', '--autostash'], publishDir);
  await run('git', ['add', path.posix.join('matches', `${matchId}.json`)], publishDir);
  // Also stage the matches index (upsertMatchIndex wrote it alongside the
  // match JSON). `git add` of a non-existent path is a no-op; suppress errors.
  await run('git', ['add', path.posix.join('matches', 'index.json')], publishDir).catch(() => undefined);

  const status = await runCapture('git', ['status', '--porcelain'], publishDir);
  if (status.trim().length === 0) {
    return { committed: false, pushed: false, message: 'No changes (JSON identical to remote).' };
  }

  await run('git', ['commit', '-m', `match ${matchId}`], publishDir);
  await run('git', ['push'], publishDir);
  return { committed: true, pushed: true, message: `Published matches/${matchId}.json to gh-pages.` };
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { execCmd, execArgs, useShell } = shellSafeCmd(cmd, args);
    const child = spawn(execCmd, execArgs, {
      cwd,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: useShell,
      windowsVerbatimArguments: useShell,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function runCapture(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { execCmd, execArgs, useShell } = shellSafeCmd(cmd, args);
    const child = spawn(execCmd, execArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: useShell,
      windowsVerbatimArguments: useShell,
    });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (buf: Buffer) => chunks.push(buf));
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'));
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

/**
 * Build a spawn invocation that survives Windows' two landmines: Node's
 * BatBadBut refusal to spawn .cmd without `shell: true`, and cmd.exe
 * splitting args on spaces when shell IS used. Quotes args + flags
 * windowsVerbatimArguments so the shell sees our quotes literally.
 */
function shellSafeCmd(
  cmd: string,
  args: string[],
): { execCmd: string; execArgs: string[]; useShell: boolean } {
  if (process.platform !== 'win32') {
    return { execCmd: cmd, execArgs: args, useShell: false };
  }
  const quote = (a: string) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return {
    execCmd: cmd === 'npm' ? 'npm.cmd' : cmd,
    execArgs: args.map(quote),
    useShell: true,
  };
}
