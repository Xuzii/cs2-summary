import type { Match, Round, TeamSide } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export type EconomyBucket = 'pistol' | 'eco' | 'force' | 'semi' | 'full';

export interface EconomyBreakdown {
  pistolWon: number;
  ecoWon: number;
  forceWon: number;
  fullBuyWon: number;
}

export interface HalfSplit {
  firstHalf: { side: 'CT' | 'T' | null; score: number };
  secondHalf: { side: 'CT' | 'T' | null; score: number };
}

export interface EconomyStats {
  /** Is per-round money data present? If not, only the half split is trustworthy. */
  hasBuyData: boolean;
  teamA: { name: string; breakdown: EconomyBreakdown; half: HalfSplit };
  teamB: { name: string; breakdown: EconomyBreakdown; half: HalfSplit };
}

// Classification heuristic (CS2 MR12, starting money 800 for pistols).
// Derived from equipment value rather than start money when available,
// because start money is noisy (kills carry over cash).
const ECO_EQUIPMENT_CEIL = 2000;
const FORCE_EQUIPMENT_CEIL = 4500;
const SEMI_EQUIPMENT_CEIL = 7000;

export function computeEconomy(match: Match): EconomyStats {
  const rounds = match.rounds ?? [];
  const hasBuyData = rounds.some(
    (r) =>
      r.teamAStartMoney !== undefined ||
      r.teamBStartMoney !== undefined ||
      r.teamAEquipmentValue !== undefined ||
      r.teamBEquipmentValue !== undefined ||
      r.teamAEconomyType !== undefined ||
      r.teamBEconomyType !== undefined,
  );

  const emptyBreakdown = (): EconomyBreakdown => ({
    pistolWon: 0,
    ecoWon: 0,
    forceWon: 0,
    fullBuyWon: 0,
  });

  const teamA: EconomyStats['teamA'] = {
    name: match.teamA.name,
    breakdown: emptyBreakdown(),
    half: computeHalfSplit(match, 'A'),
  };
  const teamB: EconomyStats['teamB'] = {
    name: match.teamB.name,
    breakdown: emptyBreakdown(),
    half: computeHalfSplit(match, 'B'),
  };

  if (!hasBuyData) {
    return { hasBuyData: false, teamA, teamB };
  }

  const pistolRoundNumbers = new Set<number>();
  pistolRoundNumbers.add(1);
  const firstHalfLen =
    match.teamA.scoreFirstHalf !== undefined && match.teamB.scoreFirstHalf !== undefined
      ? match.teamA.scoreFirstHalf + match.teamB.scoreFirstHalf
      : Math.floor((match.maxRounds ?? rounds.length) / 2);
  if (firstHalfLen > 0) pistolRoundNumbers.add(firstHalfLen + 1);

  for (const r of rounds) {
    const winner = winnerLetter(r);
    if (!winner) continue;

    const breakdown = winner === 'A' ? teamA.breakdown : teamB.breakdown;
    const bucket = bucketForRound(r, pistolRoundNumbers);
    switch (bucket) {
      case 'pistol':
        breakdown.pistolWon += 1;
        break;
      case 'eco':
        breakdown.ecoWon += 1;
        break;
      case 'force':
      case 'semi':
        breakdown.forceWon += 1;
        break;
      case 'full':
        breakdown.fullBuyWon += 1;
        break;
    }
  }

  return { hasBuyData: true, teamA, teamB };
}

function bucketForRound(r: Round, pistolRounds: Set<number>): EconomyBucket {
  if (pistolRounds.has(r.number)) return 'pistol';
  const winner = winnerLetter(r);
  if (!winner) return 'full';

  // Prefer the parser's explicit classification when available — it knows
  // about force-buys via actual purchase patterns, not just equipment value.
  const explicitType = winner === 'A' ? r.teamAEconomyType : r.teamBEconomyType;
  if (explicitType) {
    const normalized = explicitType.toLowerCase();
    if (normalized.includes('pistol')) return 'pistol';
    if (normalized.includes('eco')) return 'eco';
    if (normalized.includes('force')) return 'force';
    if (normalized.includes('semi')) return 'semi';
    if (normalized.includes('full')) return 'full';
  }

  const eq = winner === 'A' ? r.teamAEquipmentValue : r.teamBEquipmentValue;
  if (eq === undefined) return 'full';
  if (eq <= ECO_EQUIPMENT_CEIL) return 'eco';
  if (eq <= FORCE_EQUIPMENT_CEIL) return 'force';
  if (eq <= SEMI_EQUIPMENT_CEIL) return 'semi';
  return 'full';
}

function winnerLetter(r: Round): 'A' | 'B' | null {
  if (r.winnerSide === undefined) return null;
  if (r.teamASide === r.winnerSide) return 'A';
  if (r.teamBSide === r.winnerSide) return 'B';
  return null;
}

function computeHalfSplit(match: Match, letter: 'A' | 'B'): HalfSplit {
  const team = letter === 'A' ? match.teamA : match.teamB;
  const first = team.scoreFirstHalf;
  const second = team.scoreSecondHalf;

  // Determine which side the team played each half. The team's `currentSide`
  // is the side for the second half (after any halftime swap). For a match
  // that hasn't swapped (e.g. ended before halftime) this is still accurate.
  const secondHalfSide: TeamSide | undefined = team.currentSide;
  const firstHalfSide: TeamSide | undefined =
    secondHalfSide === TEAM_SIDE_CT
      ? TEAM_SIDE_T
      : secondHalfSide === TEAM_SIDE_T
        ? TEAM_SIDE_CT
        : undefined;

  return {
    firstHalf: { side: sideLabel(firstHalfSide), score: first ?? 0 },
    secondHalf: { side: sideLabel(secondHalfSide), score: second ?? 0 },
  };
}

function sideLabel(side: TeamSide | undefined): 'CT' | 'T' | null {
  if (side === TEAM_SIDE_CT) return 'CT';
  if (side === TEAM_SIDE_T) return 'T';
  return null;
}
