import type { Match, MatchPlayer, TeamSide } from '../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../analyzer/types.ts';
import { computeHighlights, type Highlight } from './compute/highlights.ts';
import { computeRoundFlow, type RoundFlowEntry } from './compute/round-flow.ts';
import { computeOpeningDuels, type OpeningDuelRow } from './compute/opening-duels.ts';
import { computeUtility, isUtilityDataEmpty, type UtilityRow } from './compute/utility.ts';
import { computeEconomy, type EconomyStats } from './compute/economy.ts';
import { computeDuelMatrix, type DuelMatrix } from './compute/duel-matrix.ts';
import { computeHeatmap, type HeatmapPoint } from './compute/heatmap.ts';
import { computeClutchMulti, isClutchMultiEmpty, type ClutchMultiRow } from './compute/clutches.ts';
import { computeEntryTrade, isEntryTradeEmpty, type EntryTradeRow } from './compute/entries.ts';
import { computeRecords, isRecordsEmpty, type MatchRecords } from './compute/records.ts';
import { computeAim, isAimEmpty, type AimPanel } from './compute/aim.ts';
import { computeBombPlays, isBombPlaysEmpty, type BombPlays } from './compute/bomb-plays.ts';
import { computeRoundDetails, type RoundDetail } from './compute/round-details.ts';
import { computeBodyAccuracy, isBodyAccuracyEmpty, type BodyAccuracyMap } from './compute/body-accuracy.ts';
import { computeEqTimeline, type EqTimelineEntry } from './compute/eq-timeline.ts';
import { computeFlashMatrix, isFlashMatrixEmpty, type FlashMatrix } from './compute/flash-matrix.ts';
import { computeDamagePerRound, type DamagePerRound } from './compute/damage-per-round.ts';
import { computeRoundInventory, type RoundInventoryMap } from './compute/round-inventory.ts';
import { computeOpeningsSpatial, type OpeningSpatialEntry } from './compute/openings-spatial.ts';
import { computePlayback, type PlaybackData } from './compute/playback.ts';
import { computeGrenadesAgg, type GrenadesAgg } from './compute/grenades-agg.ts';
import { computePlayerImpact, type PlayerImpactMap } from './compute/player-impact.ts';

export interface ScoreRow {
  name: string;
  steamId: string;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hsPct: number;
  rating: number;
  mvps: number;
  firstKills: number;
  kast: number;
}

export interface ScoreboardTeam {
  name: string;
  letter: 'A' | 'B';
  side: 'CT' | 'T' | 'MIXED';
  score: number;
  players: ScoreRow[];
}

export interface ScoreboardData {
  map: string;
  durationSec: number;
  date: Date | null;
  teamA: ScoreboardTeam;
  teamB: ScoreboardTeam;
  winner: 'A' | 'B' | 'draw';
  source: string | null;
  game: string | null;
  shareCode: string | null;
  serverName: string | null;
}

/**
 * Extended summary the renderer consumes. `scoreboard` is the legacy, still
 * self-contained payload; the rest are optional panels that the renderer is
 * free to skip when their data is empty.
 */
export interface MatchSummary {
  scoreboard: ScoreboardData;
  highlights: Highlight[];
  roundFlow: RoundFlowEntry[];
  openingDuels: OpeningDuelRow[];
  utility: UtilityRow[];
  utilityEmpty: boolean;
  economy: EconomyStats;
  duelMatrix: DuelMatrix;
  heatmap: HeatmapPoint[];
  hasPositions: boolean;
  clutchMulti: ClutchMultiRow[];
  clutchMultiEmpty: boolean;
  entryTrade: EntryTradeRow[];
  entryTradeEmpty: boolean;
  records: MatchRecords;
  recordsEmpty: boolean;
  aim: AimPanel;
  aimEmpty: boolean;
  bombPlays: BombPlays;
  bombPlaysEmpty: boolean;

  // New fields for the multi-page web UI.
  roundDetails: RoundDetail[];
  bodyAccuracy: BodyAccuracyMap;
  bodyAccuracyEmpty: boolean;
  eqTimeline: EqTimelineEntry[];
  flashMatrix: FlashMatrix;
  flashMatrixEmpty: boolean;
  damagePerRound: DamagePerRound;
  roundInventory: RoundInventoryMap;
  openingsSpatial: OpeningSpatialEntry[];
  playback: PlaybackData;
  playbackEmpty: boolean;
  grenadesAgg: GrenadesAgg;
  playerImpact: PlayerImpactMap;
}

export type {
  Highlight,
  RoundFlowEntry,
  OpeningDuelRow,
  UtilityRow,
  EconomyStats,
  DuelMatrix,
  HeatmapPoint,
  ClutchMultiRow,
  EntryTradeRow,
  MatchRecords,
  AimPanel,
  BombPlays,
  RoundDetail,
  BodyAccuracyMap,
  EqTimelineEntry,
  FlashMatrix,
  DamagePerRound,
  RoundInventoryMap,
  OpeningSpatialEntry,
  PlaybackData,
  GrenadesAgg,
  PlayerImpactMap,
};

/**
 * Pure function: Match → scoreboard rows split by team, sorted by rating.
 * No I/O, no mutation. Safe to call from anywhere.
 */
export function computeScoreboard(match: Match): ScoreboardData {
  const teamAPlayers = match.players
    .filter((p) => p.teamName === match.teamA.name)
    .map(toRow)
    .sort(byRatingDesc);

  const teamBPlayers = match.players
    .filter((p) => p.teamName === match.teamB.name)
    .map(toRow)
    .sort(byRatingDesc);

  const winner: 'A' | 'B' | 'draw' =
    match.teamA.score > match.teamB.score
      ? 'A'
      : match.teamB.score > match.teamA.score
        ? 'B'
        : 'draw';

  const date = match.date ? parseDate(match.date) : null;

  return {
    map: match.mapName,
    durationSec: match.duration,
    date,
    teamA: {
      name: match.teamA.name,
      letter: 'A',
      side: sideLabel(match.teamA.currentSide),
      score: match.teamA.score,
      players: teamAPlayers,
    },
    teamB: {
      name: match.teamB.name,
      letter: 'B',
      side: sideLabel(match.teamB.currentSide),
      score: match.teamB.score,
      players: teamBPlayers,
    },
    winner,
    source: match.source ?? null,
    game: match.game ?? null,
    shareCode: match.shareCode ?? null,
    serverName: match.serverName ?? null,
  };
}

/**
 * Compute the full match summary: scoreboard plus every derived panel.
 * Safe to call even when optional parser data is missing — each panel
 * degrades to an empty result that renderers can detect and skip.
 */
export function computeMatchSummary(match: Match): MatchSummary {
  const utility = computeUtility(match);
  const heatmap = computeHeatmap(match);
  const clutchMulti = computeClutchMulti(match);
  const entryTrade = computeEntryTrade(match);
  const records = computeRecords(match);
  const aim = computeAim(match);
  const bombPlays = computeBombPlays(match);

  const bodyAccuracy = computeBodyAccuracy(match);
  const flashMatrix = computeFlashMatrix(match);
  const playback = computePlayback(match);

  return {
    scoreboard: computeScoreboard(match),
    highlights: computeHighlights(match),
    roundFlow: computeRoundFlow(match),
    openingDuels: computeOpeningDuels(match),
    utility,
    utilityEmpty: isUtilityDataEmpty(utility),
    economy: computeEconomy(match),
    duelMatrix: computeDuelMatrix(match),
    heatmap,
    hasPositions: heatmap.length > 0,
    clutchMulti,
    clutchMultiEmpty: isClutchMultiEmpty(clutchMulti),
    entryTrade,
    entryTradeEmpty: isEntryTradeEmpty(entryTrade),
    records,
    recordsEmpty: isRecordsEmpty(records),
    aim,
    aimEmpty: isAimEmpty(aim),
    bombPlays,
    bombPlaysEmpty: isBombPlaysEmpty(bombPlays),

    roundDetails: computeRoundDetails(match),
    bodyAccuracy,
    bodyAccuracyEmpty: isBodyAccuracyEmpty(bodyAccuracy),
    eqTimeline: computeEqTimeline(match),
    flashMatrix,
    flashMatrixEmpty: isFlashMatrixEmpty(flashMatrix),
    damagePerRound: computeDamagePerRound(match),
    roundInventory: computeRoundInventory(match),
    openingsSpatial: computeOpeningsSpatial(match),
    playback,
    playbackEmpty: playback.rounds.every((r) => r.deaths.length === 0 && r.grenades.length === 0),
    grenadesAgg: computeGrenadesAgg(match),
    playerImpact: computePlayerImpact(match),
  };
}

function toRow(p: MatchPlayer): ScoreRow {
  const kills = p.killCount;
  const deaths = p.deathCount;
  const rating = p.hltvRating2 ?? p.hltvRating ?? estimateRating(p);

  return {
    name: p.name,
    steamId: p.steamId,
    kills,
    deaths,
    assists: p.assistCount,
    adr: round1(p.averageDamagePerRound),
    hsPct: round1(p.headshotPercentage),
    rating: round2(rating),
    mvps: p.mvpCount,
    firstKills: p.firstKillCount,
    kast: round1(p.kast ?? 0),
  };
}

function byRatingDesc(a: ScoreRow, b: ScoreRow): number {
  if (b.rating !== a.rating) return b.rating - a.rating;
  return b.kills - a.kills;
}

function sideLabel(side: TeamSide | undefined): 'CT' | 'T' | 'MIXED' {
  if (side === TEAM_SIDE_CT) return 'CT';
  if (side === TEAM_SIDE_T) return 'T';
  return 'MIXED';
}

/** HLTV 1.0-ish estimate as a last-resort fallback if parser skips ratings. */
function estimateRating(p: MatchPlayer): number {
  const rounds = Math.max(1, (p.killCount + p.deathCount) / 1.2);
  const killRating = (p.killCount / rounds) / 0.679;
  const survivalRating = ((rounds - p.deathCount) / rounds) / 0.317;
  const adrComponent = p.averageDamagePerRound / 100;
  return (killRating + 0.7 * survivalRating + adrComponent) / 2.7;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
