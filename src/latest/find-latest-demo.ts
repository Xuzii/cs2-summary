import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

const CS_APP_ID = '730';
const WINDOWS_CS_SUBPATH = path.join('steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo', 'replays');
const WINDOWS_CS_OLD_SUBPATH = path.join('steamapps', 'common', 'Counter-Strike Global Offensive', 'csgo', 'replays');

/**
 * Resolve the CS2 replays folder path.
 *
 * Resolution order:
 *   1. Explicit override (argument or DEMOS_FOLDER env).
 *   2. Steam install path from Windows registry (HKCU Software\Valve\Steam)
 *      + scan libraryfolders.vdf for the library holding app 730.
 *   3. Common fallback paths.
 */
export async function resolveReplaysFolder(override?: string): Promise<string> {
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`DEMOS_FOLDER override does not exist: ${override}`);
    }
    return override;
  }

  const steamPath = await findSteamFolder();
  if (steamPath) {
    const libraries = await readSteamLibrariesWithCs(steamPath);
    for (const lib of libraries) {
      for (const sub of [WINDOWS_CS_SUBPATH, WINDOWS_CS_OLD_SUBPATH]) {
        const candidate = path.join(lib, sub);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  const fallbacks = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    path.join(os.homedir(), '.steam', 'steam'),
  ];
  for (const base of fallbacks) {
    for (const sub of [WINDOWS_CS_SUBPATH, WINDOWS_CS_OLD_SUBPATH]) {
      const candidate = path.join(base, sub);
      if (existsSync(candidate)) return candidate;
    }
  }

  throw new Error(
    'Could not locate the CS2 replays folder. Set DEMOS_FOLDER in your .env to the absolute path ' +
      'of your replays folder (typically under "steamapps/common/Counter-Strike Global Offensive/game/csgo/replays").'
  );
}

/**
 * Find the newest .dem file in the given folder (by mtime).
 */
export async function findLatestDemo(folder: string): Promise<string> {
  const entries = await readdir(folder);
  const demos = entries.filter((e) => e.toLowerCase().endsWith('.dem'));
  if (demos.length === 0) {
    throw new Error(`No .dem files found in ${folder}`);
  }

  let newest: { path: string; mtime: number } | null = null;
  for (const name of demos) {
    const full = path.join(folder, name);
    const st = await stat(full);
    if (!newest || st.mtimeMs > newest.mtime) {
      newest = { path: full, mtime: st.mtimeMs };
    }
  }
  return newest!.path;
}

async function findSteamFolder(): Promise<string | undefined> {
  if (process.platform === 'win32') {
    return readSteamPathFromRegistry();
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Steam');
  }
  const candidates = [
    path.join(os.homedir(), '.steam', 'steam'),
    path.join(os.homedir(), 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
    path.join(os.homedir(), '.local', 'share', 'Steam'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return undefined;
}

async function readSteamPathFromRegistry(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
    const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+?)\r?\n/i);
    if (!match) return undefined;
    const raw = match[1]!.trim();
    return normalizeWindowsPath(raw);
  } catch {
    return undefined;
  }
}

function normalizeWindowsPath(p: string): string {
  const withBackslashes = p.replace(/\//g, '\\');
  return withBackslashes.charAt(0).toUpperCase() + withBackslashes.slice(1);
}

/**
 * Parse libraryfolders.vdf and return the directories of libraries that
 * have Counter-Strike (app 730) installed.
 */
async function readSteamLibrariesWithCs(steamFolderPath: string): Promise<string[]> {
  const vdfPath = path.join(steamFolderPath, 'steamapps', 'libraryfolders.vdf');
  if (!existsSync(vdfPath)) return [steamFolderPath];

  const text = await readFile(vdfPath, 'utf8');
  const libraries: { libPath: string; hasCs: boolean }[] = [];

  const entryPattern = /"\d+"\s*\{([\s\S]*?)\n\s*\}\s*(?="\d+"|\n\})/g;
  for (const m of text.matchAll(entryPattern)) {
    const block = m[1] ?? '';
    const pathMatch = block.match(/"path"\s+"([^"]+)"/);
    if (!pathMatch) continue;
    const libPath = pathMatch[1]!.replace(/\\\\/g, '\\');
    const appsBlockMatch = block.match(/"apps"\s*\{([\s\S]*?)\}/);
    const apps = appsBlockMatch ? appsBlockMatch[1]! : '';
    const hasCs = new RegExp(`"${CS_APP_ID}"`).test(apps);
    libraries.push({ libPath, hasCs });
  }

  const withCs = libraries.filter((l) => l.hasCs).map((l) => l.libPath);
  if (withCs.length) return withCs;

  // Fall back to every library if the apps listing didn't parse — existsSync
  // checks in the caller will filter out non-matches.
  return libraries.length ? libraries.map((l) => l.libPath) : [steamFolderPath];
}
