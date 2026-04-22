#!/usr/bin/env node
/**
 * One-time setup for the interactive HTML export to GitHub Pages.
 *
 * What it does:
 *  1. Builds the React app (`npm run build` inside web/).
 *  2. Clones the target GitHub repo into ./publish (config via env / flags).
 *  3. Creates/initializes the `gh-pages` orphan branch.
 *  4. Copies the built dist/ over and pushes the first deploy.
 *  5. Leaves ./publish as a working clone of the gh-pages branch so the
 *     pipeline's `src/web/deploy.ts` can just `git add matches/<id>.json && git push`.
 *
 * Env overrides:
 *   HTML_REPO_URL    Git URL to push to. Default: https://github.com/Xuzii/cs2-summary.git
 *   HTML_PUBLISH_DIR Working clone dir. Default: ./publish
 *
 * Prerequisites (user-side, can't automate):
 *   - The GitHub repo already exists. If not, create it at:
 *       https://github.com/new  (name: cs2-summary, empty, no README)
 *   - Your local git is authenticated to push there (HTTPS creds or SSH key).
 *   - GitHub Pages is (or will be) set to deploy from the `gh-pages` branch,
 *     folder `/ (root)`:
 *       https://github.com/Xuzii/cs2-summary/settings/pages
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WEB = path.join(ROOT, 'web');

const REPO = process.env.HTML_REPO_URL || 'https://github.com/Xuzii/cs2-summary.git';
const PUBLISH = path.resolve(process.env.HTML_PUBLISH_DIR || path.join(ROOT, 'publish'));

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`  $ ${cmd} ${args.join(' ')}${cwd ? '   [' + cwd + ']' : ''}`);
    const { execCmd, execArgs, useShell } = shellSafeCmd(cmd, args);
    const child = spawn(execCmd, execArgs, { cwd, stdio: 'inherit', shell: useShell, windowsVerbatimArguments: useShell });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

/**
 * Build a spawn invocation that survives Windows' two landmines:
 *  1. Node 20+ refuses to spawn `.cmd`/`.bat` files without `shell: true`
 *     (BatBadBut mitigation, CVE-2024-27980).
 *  2. `shell: true` on Windows runs through cmd.exe, which splits args on
 *     spaces unless each arg is manually quoted.
 * We handle both by shell-quoting args and setting windowsVerbatimArguments so
 * the shell sees our quotes literally rather than stripping them.
 */
function shellSafeCmd(cmd, args) {
  if (process.platform !== 'win32') {
    return { execCmd: cmd, execArgs: args, useShell: false };
  }
  const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return {
    execCmd: cmd === 'npm' ? 'npm.cmd' : cmd,
    execArgs: args.map(quote),
    useShell: true,
  };
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

console.log(`Setup target:\n  repo        = ${REPO}\n  publish dir = ${PUBLISH}\n`);

// 1. Build the web app.
console.log('[1/5] Installing + building web/');
if (!(await exists(path.join(WEB, 'node_modules')))) {
  await run('npm', ['install'], WEB);
}
await run('npm', ['run', 'build'], WEB);
const DIST = path.join(WEB, 'dist');
if (!(await exists(DIST))) {
  console.error(`Build output not found at ${DIST}. Aborting.`);
  process.exit(1);
}

// 2. Prepare publish dir — clone if empty, else reuse.
console.log('\n[2/5] Preparing publish clone');
await mkdir(path.dirname(PUBLISH), { recursive: true });
const alreadyCloned = await exists(path.join(PUBLISH, '.git'));
if (!alreadyCloned) {
  // If the dir exists but isn't a git repo, bail out rather than clobber.
  if (await exists(PUBLISH)) {
    const entries = await readdir(PUBLISH);
    if (entries.length > 0) {
      console.error(`Publish dir ${PUBLISH} exists and is not empty but is not a git clone. Aborting.`);
      process.exit(1);
    }
  }
  await run('git', ['clone', REPO, PUBLISH]);
} else {
  console.log(`  (reusing existing clone at ${PUBLISH})`);
  await run('git', ['fetch', 'origin'], PUBLISH);
}

// 3. Check out gh-pages (create orphan branch if missing).
console.log('\n[3/5] Switching to gh-pages branch');
const branches = await capture('git', ['branch', '-a'], PUBLISH);
const hasLocal = /\bgh-pages\b/.test(branches.split('\n').filter((l) => !l.includes('remotes/')).join('\n'));
const hasRemote = /remotes\/origin\/gh-pages/.test(branches);
if (hasLocal) {
  await run('git', ['checkout', 'gh-pages'], PUBLISH);
  if (hasRemote) await run('git', ['pull', '--rebase', '--autostash'], PUBLISH);
} else if (hasRemote) {
  await run('git', ['checkout', '-t', 'origin/gh-pages'], PUBLISH);
} else {
  await run('git', ['checkout', '--orphan', 'gh-pages'], PUBLISH);
  // Clear the index so stale main-branch files don't carry over.
  await run('git', ['rm', '-rf', '--ignore-unmatch', '.'], PUBLISH);
}

// 4. Copy built site in + preserve any existing matches/.
console.log('\n[4/5] Staging built site into gh-pages');
// Remove build-managed dirs (index.html, app/, static/) but keep matches/.
for (const victim of ['index.html', 'app', 'static', '.nojekyll']) {
  const victimPath = path.join(PUBLISH, victim);
  if (await exists(victimPath)) {
    await rm(victimPath, { recursive: true, force: true });
  }
}
// Copy each top-level entry of dist/ into PUBLISH.
for (const entry of await readdir(DIST)) {
  await cp(path.join(DIST, entry), path.join(PUBLISH, entry), { recursive: true });
}
// Ensure matches/ exists so the first pipeline run doesn't have to create it.
await mkdir(path.join(PUBLISH, 'matches'), { recursive: true });
// Empty-file marker prevents Jekyll from eating our build output.
await writeFile(path.join(PUBLISH, '.nojekyll'), '', 'utf8');

// 5. Commit + push.
console.log('\n[5/5] Committing + pushing initial deploy');
await run('git', ['add', '-A'], PUBLISH);
const status = await capture('git', ['status', '--porcelain'], PUBLISH);
if (status.trim().length === 0) {
  console.log('  (no changes to commit — gh-pages already up to date)');
} else {
  await run('git', ['commit', '-m', 'initial gh-pages build'], PUBLISH);
}
await run('git', ['push', '-u', 'origin', 'gh-pages'], PUBLISH);

console.log('\nDone.');
console.log(`\nNext steps:`);
console.log(`  1. On GitHub, make sure Pages is set to deploy from the \`gh-pages\` branch.`);
console.log(`     https://github.com/Xuzii/cs2-summary/settings/pages`);
console.log(`  2. Run a demo with --html to publish your first match:`);
console.log(`     npm run analyze -- "<path\\to\\demo.dem>" --html`);

function capture(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const { execCmd, execArgs, useShell } = shellSafeCmd(cmd, args);
    const child = spawn(execCmd, execArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: useShell,
      windowsVerbatimArguments: useShell,
    });
    const chunks = [];
    child.stdout.on('data', (b) => chunks.push(b));
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(new Error(`${cmd} exited ${code}`))));
  });
}
