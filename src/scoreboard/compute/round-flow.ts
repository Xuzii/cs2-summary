import type { Match, Round } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export type RoundEndReason =
  | 'bomb_exploded'
  | 'bomb_defused'
  | 'ct_eliminated'
  | 't_eliminated'
  | 'time_ran_out'
  | 'surrender'
  | 'unknown';

export interface RoundFlowEntry {
  number: number;
  winner: 'A' | 'B' | null;
  /** Side that won this round (from winnerSide). */
  winnerSide: 'CT' | 'T' | null;
  endReason: RoundEndReason;
  /** Running score after the round. */
  scoreA: number;
  scoreB: number;
  /** True on the last round of the first half, so UI can draw a divider. */
  isHalftime: boolean;
}

/**
 * Map a round's endReason string (which varies by parser version / casing)
 * to a stable canonical value the renderer can switch on.
 */
function canonicalEndReason(raw: string | undefined): RoundEndReason {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase();
  if (s.includes('bomb') && (s.includes('explod') || s.includes('detonat'))) return 'bomb_exploded';
  if (s.includes('defus')) return 'bomb_defused';
  if (s.includes('ct') && (s.includes('kill') || s.includes('elim'))) return 'ct_eliminated';
  if ((s.includes('t_') || s.includes('terror') || /\bt\b/.test(s)) && (s.includes('kill') || s.includes('elim')))
    return 't_eliminated';
  if (s.includes('target_saved') || s.includes('time') || s.includes('out')) return 'time_ran_out';
  if (s.includes('surrender')) return 'surrender';
  return 'unknown';
}

export function computeRoundFlow(match: Match): RoundFlowEntry[] {
  const rounds = match.rounds ?? [];
  if (rounds.length === 0) return [];

  // Identify halftime as the round after which team sides swap. If the parser
  // doesn't emit scoreFirstHalf, fall back to round count / 2.
  const firstHalfRounds =
    match.teamA.scoreFirstHalf !== undefined && match.teamB.scoreFirstHalf !== undefined
      ? match.teamA.scoreFirstHalf + match.teamB.scoreFirstHalf
      : Math.floor((match.maxRounds ?? rounds.length) / 2);

  let scoreA = 0;
  let scoreB = 0;
  return rounds.map((r, idx) => {
    const winner = winnerOf(r);
    if (winner === 'A') scoreA += 1;
    else if (winner === 'B') scoreB += 1;

    return {
      number: r.number || idx + 1,
      winner,
      winnerSide:
        r.winnerSide === TEAM_SIDE_CT ? 'CT' : r.winnerSide === TEAM_SIDE_T ? 'T' : null,
      endReason: canonicalEndReason(r.endReason),
      scoreA,
      scoreB,
      isHalftime: idx + 1 === firstHalfRounds,
    };
  });
}

function winnerOf(r: Round): 'A' | 'B' | null {
  // Prefer the direct team-score delta if present; otherwise fall back to
  // winnerTeamName match against team names (not available here, skipped).
  if (r.teamAScore !== undefined && r.teamBScore !== undefined) {
    // These fields are running scores at round end in cs-demo-manager's schema.
    // Without previous round we can't diff here; use winnerSide as the source.
  }
  if (r.winnerSide === TEAM_SIDE_CT || r.winnerSide === TEAM_SIDE_T) {
    // Caller must map side → letter via team side context. We do it here using
    // teamASide / teamBSide on the round if available.
    if (r.teamASide === r.winnerSide) return 'A';
    if (r.teamBSide === r.winnerSide) return 'B';
  }
  return null;
}
