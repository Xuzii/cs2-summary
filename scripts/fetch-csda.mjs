#!/usr/bin/env node
// Download the Windows csda.exe binary from the @akiver/cs-demo-analyzer
// GitHub release matching the locally installed version. Upstream's npm
// tarball ships mac/linux binaries but not the Windows one (verified on
// v1.9.4), so we vendor it under vendor/csda/ ourselves.
//
// Runs automatically via `npm install` (postinstall) and manually via
// `npm run csda:update` (pass --force to bypass the cached-version check).

import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const force = process.argv.includes('--force');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const vendorDir = resolve(projectRoot, 'vendor', 'csda');
const exePath = resolve(vendorDir, 'csda.exe');
const versionMarker = resolve(vendorDir, '.version');

function log(msg) {
  console.log(`[fetch-csda] ${msg}`);
}

async function main() {
  if (process.platform !== 'win32') {
    // Mac/Linux use the npm-bundled binary. Nothing to do.
    return;
  }

  const installedVersion = await readInstalledCsdaVersion();
  if (!installedVersion) {
    log('@akiver/cs-demo-analyzer not installed yet — skipping (will retry on next install).');
    return;
  }

  if (!force && (await isCacheValid(installedVersion))) {
    log(`csda.exe v${installedVersion} already vendored — nothing to do.`);
    return;
  }

  await mkdir(vendorDir, { recursive: true });

  const zipUrl = `https://github.com/akiver/cs-demo-analyzer/releases/download/v${installedVersion}/windows-x64.zip`;
  const zipPath = resolve(vendorDir, `_windows-x64-${installedVersion}.zip`);
  const extractDir = resolve(vendorDir, `_extract-${installedVersion}`);

  log(`Downloading ${zipUrl}`);
  await downloadToFile(zipUrl, zipPath);
  const zipStat = await stat(zipPath);
  log(`Downloaded ${(zipStat.size / (1024 * 1024)).toFixed(1)} MB → ${zipPath}`);

  log(`Extracting with PowerShell Expand-Archive → ${extractDir}`);
  await rm(extractDir, { recursive: true, force: true });
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`,
    ],
    { stdio: 'inherit', windowsHide: true },
  );

  const extractedExe = await findExeIn(extractDir);
  if (!extractedExe) {
    throw new Error(`csda.exe not found in extracted archive at ${extractDir}`);
  }
  log(`Moving ${extractedExe} → ${exePath}`);
  await rm(exePath, { force: true });
  await rename(extractedExe, exePath);

  // Strip the Mark-of-the-Web zone identifier that Windows attaches to any
  // file downloaded from the internet. Without this, SmartScreen / Application
  // Control blocks execution with "Malicious binary reputation" on first run
  // (unsigned Go binary + no file reputation). Unblock-File is a no-op if the
  // ADS is absent, so it's safe to run unconditionally.
  log('Clearing Mark-of-the-Web via Unblock-File');
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `Unblock-File -LiteralPath "${exePath}"`],
    { stdio: 'inherit', windowsHide: true },
  );

  await writeFile(versionMarker, installedVersion);
  await rm(zipPath, { force: true });
  await rm(extractDir, { recursive: true, force: true });

  // Post-check: Windows Defender's generic PUA heuristic flags csda.exe
  // (unsigned Go binary, ThreatID 2147735505) and quarantines it — sometimes
  // before we get here, sometimes seconds later. If the file is gone by now,
  // tell the user exactly what to do rather than failing later with ENOENT
  // when the pipeline tries to spawn it.
  let finalStat;
  try {
    finalStat = await stat(exePath);
  } catch {
    throw new Error(
      `csda.exe disappeared immediately after extraction — Windows Defender ` +
        `almost certainly quarantined it (ThreatID 2147735505, a known false ` +
        `positive for unsigned Go binaries).\n\n` +
        `To fix permanently, add a Defender exclusion for the vendor dir ` +
        `(run in an ADMIN PowerShell):\n\n` +
        `  Add-MpPreference -ExclusionPath "${vendorDir}"\n\n` +
        `Then re-run: npm run csda:update`,
    );
  }
  log(`Done. csda.exe v${installedVersion} (${(finalStat.size / (1024 * 1024)).toFixed(1)} MB) at ${exePath}`);
}

async function readInstalledCsdaVersion() {
  const pkgPath = resolve(projectRoot, 'node_modules', '@akiver', 'cs-demo-analyzer', 'package.json');
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

async function isCacheValid(installedVersion) {
  try {
    const marker = (await readFile(versionMarker, 'utf8')).trim();
    if (marker !== installedVersion) return false;
    const s = await stat(exePath);
    // Guard against zero-byte / partial-download artifacts.
    return s.size > 1024 * 1024;
  } catch {
    return false;
  }
}

async function downloadToFile(url, destPath) {
  // Node 20+ fetch follows redirects by default, which is required since
  // GitHub release asset URLs 302 to objects-origin S3.
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error(`GET ${url} returned no body`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

async function findExeIn(dir) {
  // Walk the extraction directory looking for csda.exe. The zip layout from
  // the upstream release has historically been flat (just csda.exe at the
  // root) but we don't want to depend on that.
  const { readdir } = await import('node:fs/promises');
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(full);
        if (found) return found;
      } else if (entry.name.toLowerCase() === 'csda.exe') {
        return full;
      }
    }
    return undefined;
  }
  return walk(dir);
}

main().catch((err) => {
  console.error(`[fetch-csda] failed: ${err.message}`);
  process.exit(1);
});
