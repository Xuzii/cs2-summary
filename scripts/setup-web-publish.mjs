#!/usr/bin/env node
/**
 * One-time setup for the static HTML export to GitHub Pages.
 *
 * The web/ tree is now a no-build static site (plain HTML + JSX transpiled
 * in-browser by @babel/standalone), so this script simply:
 *  1. Clones the target GitHub repo into ./publish (config via env / flags).
 *  2. Creates/initializes the `gh-pages` orphan branch.
 *  3. Copies web/index.html, web/src/**, web/static/** onto gh-pages.
 *  4. Pushes the first deploy.
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

// 1. Verify the static web tree exists.
console.log('[1/4] Verifying static web/ tree');
for (const required of ['index.html', 'src/app.jsx', 'src/adapter.js', 'src/radar.js', 'src/styles.css']) {
  if (!(await exists(path.join(WEB, required)))) {
    console.error(`Missing expected file: web/${required}. Aborting.`);
    process.exit(1);
  }
}

// 2. Prepare publish dir — clone if empty, else reuse.
console.log('\n[2/4] Preparing publish clone');
await mkdir(path.dirname(PUBLISH), { recursive: true });
const alreadyCloned = await exists(path.join(PUBLISH, '.git'));
if (!alreadyCloned) {
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
console.log('\n[3/4] Switching to gh-pages branch');
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
  await run('git', ['rm', '-rf', '--ignore-unmatch', '.'], PUBLISH);
}

// 4. Stage + push.
console.log('\n[4/4] Staging static site into gh-pages');
// Remove previously published static tree (keep matches/ so existing match
// JSONs survive a redeploy).
for (const victim of ['index.html', 'src', 'static', 'app', 'dist', '.nojekyll']) {
  const victimPath = path.join(PUBLISH, victim);
  if (await exists(victimPath)) {
    await rm(victimPath, { recursive: true, force: true });
  }
}

// Copy the static site bits.
await cp(path.join(WEB, 'index.html'), path.join(PUBLISH, 'index.html'));
await cp(path.join(WEB, 'src'), path.join(PUBLISH, 'src'), { recursive: true });
// public/static -> static (radars + fonts); public/matches is handled by the
// per-demo deploy step, but seed an empty directory for the first push.
const publicStatic = path.join(WEB, 'static');
if (await exists(publicStatic)) {
  await cp(publicStatic, path.join(PUBLISH, 'static'), { recursive: true });
}
await mkdir(path.join(PUBLISH, 'matches'), { recursive: true });

// Seed a matches/index.json if one already exists locally.
const localIndex = path.join(WEB, 'matches', 'index.json');
if (await exists(localIndex)) {
  await cp(localIndex, path.join(PUBLISH, 'matches', 'index.json'));
}

// Empty-file marker prevents Jekyll from eating our build output.
await writeFile(path.join(PUBLISH, '.nojekyll'), '', 'utf8');

console.log('\nCommitting + pushing initial deploy');
await run('git', ['add', '-A'], PUBLISH);
const status = await capture('git', ['status', '--porcelain'], PUBLISH);
if (status.trim().length === 0) {
  console.log('  (no changes to commit — gh-pages already up to date)');
} else {
  await run('git', ['commit', '-m', 'static site deploy'], PUBLISH);
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
