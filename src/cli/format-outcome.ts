import type { FetchOutcome } from '../remote/fetch-new-matches.ts';

export function formatOutcome(outcome: FetchOutcome): { message: string; exitCode: number } {
  switch (outcome.kind) {
    case 'ok': {
      const id = outcome.detectedSteamId ? ` (SteamID: ${outcome.detectedSteamId})` : '';
      return {
        message: `[fetch] Done${id}. Downloaded ${outcome.downloaded}, skipped ${outcome.skipped}.`,
        exitCode: 0,
      };
    }
    case 'cs2-running':
      return {
        message: '[fetch] CS2 is running — skipping this fetch. Close CS2 and try again.',
        exitCode: 0,
      };
    case 'no-matches':
      return { message: '[fetch] No recent matches returned by Steam.', exitCode: 0 };
    case 'steam-not-ready':
      return { message: `[fetch] Steam not ready: ${outcome.message}`, exitCode: 1 };
    case 'steam-id-mismatch':
      return {
        message:
          `[fetch] SteamID mismatch. Configured STEAM_ID64=${outcome.expected}, ` +
          `but Steam is signed in as ${outcome.detected}. No demos downloaded.`,
        exitCode: 1,
      };
  }
}
