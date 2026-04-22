import type { Kill, Match, TeamSide } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export interface OpeningDuelRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  attempts: number;
  wins: number;
  losses: number;
  successPct: number;
  ctAttempts: number;
  ctWins: number;
  tAttempts: number;
  tWins: number;
}

/**
 * Aggregate opening duels per player by scanning kills for each round's
 * earliest kill event. If the parser already flags `isFirstKill` on kills we
 * prefer those; otherwise we pick the earliest kill per round by tick.
 *
 * A player's CT/T attempts are tallied based on which side they were on at
 * the moment of the duel — useful for "strong T-side entry fragger" callouts.
 */
export function computeOpeningDuels(match: Match): OpeningDuelRow[] {
  const kills = match.kills ?? [];
  if (kills.length === 0) return [];

  const openingKills = pickOpeningKills(kills);

  const rowByPlayer = new Map<string, OpeningDuelRow>();
  for (const p of match.players) {
    const teamLetter: 'A' | 'B' = p.teamName === match.teamA.name ? 'A' : 'B';
    rowByPlayer.set(p.steamId, {
      name: p.name,
      steamId: p.steamId,
      teamLetter,
      attempts: 0,
      wins: 0,
      losses: 0,
      successPct: 0,
      ctAttempts: 0,
      ctWins: 0,
      tAttempts: 0,
      tWins: 0,
    });
  }

  for (const k of openingKills) {
    const killerRow = rowByPlayer.get(k.killerSteamId);
    if (killerRow) {
      killerRow.attempts += 1;
      killerRow.wins += 1;
      bumpSide(killerRow, k.killerSide, true);
    }
    const victimRow = rowByPlayer.get(k.victimSteamId);
    if (victimRow) {
      victimRow.attempts += 1;
      victimRow.losses += 1;
      bumpSide(victimRow, k.victimSide, false);
    }
  }

  for (const row of rowByPlayer.values()) {
    row.successPct = row.attempts > 0 ? (row.wins / row.attempts) * 100 : 0;
  }

  return [...rowByPlayer.values()].sort((a, b) => {
    if (a.teamLetter !== b.teamLetter) return a.teamLetter.localeCompare(b.teamLetter);
    return b.wins - a.wins || b.attempts - a.attempts;
  });
}

function pickOpeningKills(kills: Kill[]): Kill[] {
  const flagged = kills.filter((k) => k.isFirstKill);
  if (flagged.length > 0) return flagged;

  const perRound = new Map<number, Kill>();
  for (const k of kills) {
    const round = k.roundNumber;
    if (round === undefined) continue;
    const prev = perRound.get(round);
    if (!prev) {
      perRound.set(round, k);
      continue;
    }
    const prevTick = prev.tick ?? Number.POSITIVE_INFINITY;
    const thisTick = k.tick ?? Number.POSITIVE_INFINITY;
    if (thisTick < prevTick) perRound.set(round, k);
  }
  return [...perRound.values()];
}

function bumpSide(row: OpeningDuelRow, side: TeamSide, isWin: boolean) {
  if (side === TEAM_SIDE_CT) {
    row.ctAttempts += 1;
    if (isWin) row.ctWins += 1;
  } else if (side === TEAM_SIDE_T) {
    row.tAttempts += 1;
    if (isWin) row.tWins += 1;
  }
}
