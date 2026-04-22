import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {
  type CMsgGCCStrike15_v2_MatchList,
  CMsgGCCStrike15_v2_MatchListSchema,
} from 'csgo-protobuf';
import { fromBinary } from '@bufbuild/protobuf';

const require = createRequire(import.meta.url);

export type BoilerExitCode =
  | 'Success'
  | 'Error'
  | 'InvalidArgs'
  | 'CommunicationFailure'
  | 'AlreadyConnected'
  | 'SteamRestartRequired'
  | 'SteamNotRunningOrLoggedIn'
  | 'UserNotLoggedIn'
  | 'NoMatchesFound'
  | 'WriteFileFailure'
  | 'Unknown';

const EXIT_CODES: Record<number, BoilerExitCode> = {
  0: 'Success',
  1: 'Error',
  2: 'InvalidArgs',
  3: 'CommunicationFailure',
  4: 'AlreadyConnected',
  5: 'SteamRestartRequired',
  6: 'SteamNotRunningOrLoggedIn',
  7: 'UserNotLoggedIn',
  8: 'NoMatchesFound',
  9: 'WriteFileFailure',
};

export class BoilerError extends Error {
  constructor(public readonly code: BoilerExitCode, message: string) {
    super(message);
    this.name = 'BoilerError';
  }
}

export interface BoilerResult {
  matchList: CMsgGCCStrike15_v2_MatchList;
  detectedSteamId: string | undefined;
}

/**
 * Resolve the path to the bundled boiler-writter executable for the current
 * platform. Relies on the file layout inside @akiver/boiler-writter: the
 * package ships prebuilt binaries under dist/bin/<platform>-<arch>/.
 */
export function resolveBoilerBinary(): string {
  const pkgJsonPath = require.resolve('@akiver/boiler-writter/package.json');
  const pkgRoot = path.dirname(pkgJsonPath);

  const platformDir = `${process.platform}-${process.arch}`;
  const binaryName = process.platform === 'win32' ? 'boiler-writter.exe' : 'boiler-writter';
  const candidate = path.join(pkgRoot, 'dist', 'bin', platformDir, binaryName);

  if (!existsSync(candidate)) {
    throw new Error(
      `boiler-writter binary not found at ${candidate}. ` +
        `Platform ${platformDir} may not be supported by @akiver/boiler-writter.`,
    );
  }

  return candidate;
}

/**
 * Run boiler-writter to fetch the signed-in Steam account's recent MM matches.
 *
 * Requires:
 *   - Steam Desktop running and logged in.
 *   - CS2 NOT running (only one GC connection per account; AlreadyConnected otherwise).
 *
 * Returns the decoded CMsgGCCStrike15_v2_MatchList and the SteamID boiler
 * emitted on its stdout (for sanity-checking against configured STEAM_ID64).
 */
export async function runBoiler(options: {
  workDir: string;
  args?: string[];
}): Promise<BoilerResult> {
  const { workDir, args = [] } = options;

  await mkdir(workDir, { recursive: true });
  const matchesInfoPath = path.join(workDir, 'matches.info');
  // Remove any stale file so we never decode a previous run's output on error.
  await rm(matchesInfoPath, { force: true });

  const binary = resolveBoilerBinary();
  const execArgs = [matchesInfoPath, ...args];

  let detectedSteamId: string | undefined;

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = execFile(binary, execArgs, { windowsHide: true }, () => {
      // Swallow execFile's error callback; we decide outcome from exit code.
    });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      const lines = chunk.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('STEAMID:')) {
          detectedSteamId = line.slice('STEAMID:'.length).trim();
        }
      }
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      resolve(code ?? -1);
    });
  });

  const named = EXIT_CODES[exitCode] ?? 'Unknown';

  if (named !== 'Success') {
    throw new BoilerError(named, describeBoilerError(named, exitCode));
  }

  if (!existsSync(matchesInfoPath)) {
    throw new BoilerError('WriteFileFailure', 'boiler reported success but no matches.info was written.');
  }

  const buffer = await readFile(matchesInfoPath);
  const matchList = fromBinary(CMsgGCCStrike15_v2_MatchListSchema, new Uint8Array(buffer));

  return { matchList, detectedSteamId };
}

function describeBoilerError(code: BoilerExitCode, rawCode: number): string {
  switch (code) {
    case 'AlreadyConnected':
      return 'CS2 is running — close the game and try again (only one Game Coordinator connection per account).';
    case 'SteamNotRunningOrLoggedIn':
      return 'Steam Desktop is not running or no account is logged in.';
    case 'UserNotLoggedIn':
      return 'No Steam account is currently connected.';
    case 'SteamRestartRequired':
      return 'Steam needs to be restarted before fetching matches.';
    case 'CommunicationFailure':
      return 'Error talking to Steam. Check that the account is not in-game on another device, then retry.';
    case 'NoMatchesFound':
      return 'Steam returned no recent matches for this account.';
    case 'InvalidArgs':
      return 'Internal: invalid arguments passed to boiler-writter.';
    case 'WriteFileFailure':
      return 'boiler-writter failed to write its matches.info output file.';
    case 'Unknown':
      return `boiler-writter exited with unknown code ${rawCode}.`;
    default:
      return `boiler-writter error: ${code}`;
  }
}

/** Returns a writable working dir for boiler temporary files. */
export function defaultBoilerWorkDir(dataDir: string): string {
  // Keep boiler's outputs separate from parser data so clearing one doesn't
  // disturb the other.
  return path.join(dataDir, 'boiler');
}

/** Best-effort per-OS temp dir if caller doesn't want files near dataDir. */
export function osTempBoilerDir(): string {
  return path.join(os.tmpdir(), 'cs2-discord-summary-boiler');
}
