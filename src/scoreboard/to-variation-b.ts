import type { MatchSummary, ScoreRow } from './compute.ts';
import type { Highlight } from './compute/highlights.ts';
import type { OpeningDuelRow } from './compute/opening-duels.ts';
import type { UtilityRow } from './compute/utility.ts';
import type { HeatmapPoint } from './compute/heatmap.ts';
import type { ClutchMultiRow } from './compute/clutches.ts';
import type { EntryTradeRow } from './compute/entries.ts';
import type { MatchRecords } from './compute/records.ts';
import type { AimPanel } from './compute/aim.ts';
import type { BombPlays } from './compute/bomb-plays.ts';
import type { RoundDetail } from './compute/round-details.ts';
import type { BodyAccuracyMap } from './compute/body-accuracy.ts';
import type { EqTimelineEntry } from './compute/eq-timeline.ts';
import type { FlashMatrix } from './compute/flash-matrix.ts';
import type { DamagePerRound } from './compute/damage-per-round.ts';
import type { RoundInventoryMap } from './compute/round-inventory.ts';
import type { OpeningSpatialEntry } from './compute/openings-spatial.ts';
import type { PlaybackData } from './compute/playback.ts';
import type { GrenadesAgg } from './compute/grenades-agg.ts';
import type { PlayerImpactMap } from './compute/player-impact.ts';
import type { RadarAsset } from './load-radar.ts';
import { worldToRadar, getMapCalibration } from './maps.ts';

/**
 * Data shape consumed by the HTML template. Keeps the template free of any
 * conditional branching over the parser's quirks — every field here is
 * either present or contains a safe zero/fallback value.
 */
export interface TemplateData {
  date: string;
  durationLabel: string;
  mapName: string;
  mapPretty: string;
  winner: 'A' | 'B';
  winnerName: string;
  winnerLabel: string;
  teamA: TeamBlock;
  teamB: TeamBlock;
  highlights: TemplateHighlight[];
  roundFlow: TemplateRound[];
  openingDuels: { teamA: TemplateDuelRow[]; teamB: TemplateDuelRow[] };
  utility: { teamA: TemplateUtilityRow[]; teamB: TemplateUtilityRow[] };
  economy: { teamA: TemplateEconomy; teamB: TemplateEconomy };
  duelMatrix: { players: TemplateMatrixPlayer[]; kills: number[][] };
  heatmap: TemplateHeatmap | null;
  heroMapImage: string | null;
  mvpFooterName: string | null;
  halfA: { first: string; second: string };
  halfB: { first: string; second: string };
  clutchMulti: { teamA: ClutchMultiRow[]; teamB: ClutchMultiRow[] } | null;
  entryTrade: { teamA: EntryTradeRow[]; teamB: EntryTradeRow[] } | null;
  records: MatchRecords | null;
  aim: { teamA: AimPanel['rows']; teamB: AimPanel['rows']; bestTap: AimPanel['bestTap']; bestSpray: AimPanel['bestSpray']; topShooter: AimPanel['topShooter'] } | null;
  bombPlays: BombPlays | null;
  source: string | null;
  shareCode: string | null;
  serverName: string | null;

  // New fields consumed by the multi-page web UI.
  roundDetails: RoundDetail[];
  bodyAccuracy: BodyAccuracyMap | null;
  eqTimeline: EqTimelineEntry[];
  flashMatrix: FlashMatrix | null;
  damagePerRound: DamagePerRound;
  roundInventory: RoundInventoryMap;
  openingsSpatial: OpeningSpatialEntry[];
  playback: PlaybackData | null;
  grenadesAgg: GrenadesAgg;
  playerImpact: PlayerImpactMap;
  weaponTops: TemplateWeaponTop[];
  endReasonCounts: Record<string, number>;
}

export interface TemplateWeaponTop {
  name: string;
  kills: number;
  hs: number;
}

export interface TeamBlock {
  name: string;
  side: 'CT' | 'T';
  score: number;
  firstHalf: { side: 'CT' | 'T'; score: number };
  secondHalf: { side: 'CT' | 'T'; score: number };
  players: TemplatePlayer[];
}

export interface TemplatePlayer {
  name: string;
  mvpFlag: boolean;
  k: number;
  d: number;
  a: number;
  adr: number;
  hs: number;
  kast: number;
  mvp: number;
  fk: number;
  rating: number;
}

export interface TemplateHighlight {
  label: string;
  player: string;
  detail: string;
}

export interface TemplateRound {
  n: number;
  winner: 'CT' | 'T';
  halftime?: boolean;
}

export interface TemplateDuelRow {
  name: string;
  att: number;
  wins: number;
  losses: number;
  pct: number;
  ct: string;
  t: string;
}

export interface TemplateUtilityRow {
  name: string;
  heDmg: number;
  hePerRnd: number;
  flashes: number;
  enemiesFlashed: number;
  blindTime: number;
  flashAssists: number;
  smokes: number;
}

export interface TemplateEconomy {
  half: string;
  pistols: number;
  ecos: number;
  forces: number;
  fullBuys: number;
}

export interface TemplateMatrixPlayer {
  name: string;
  team: 'A' | 'B';
}

export interface TemplateHeatmapDot {
  x: number;
  y: number;
  side: 'CT' | 'T';
}

export interface TemplateHeatmap {
  radarFileUrl: string;
  prettyMap: string;
  size: number;
  dots: TemplateHeatmapDot[];
  totalKills: number;
}

const HEATMAP_SIZE = 600;

export function toTemplateData(
  summary: MatchSummary,
  radar?: RadarAsset | null,
): TemplateData {
  const sb = summary.scoreboard;
  const mapPretty = prettyMap(sb.map);
  const winner: 'A' | 'B' = sb.winner === 'B' ? 'B' : 'A';
  const winnerTeam = winner === 'A' ? sb.teamA : sb.teamB;

  const mvpHighlight = summary.highlights.find((h) => h.label.toLowerCase() === 'mvp');
  const mvpName = mvpHighlight?.player ?? topRated(sb.teamA.players.concat(sb.teamB.players))?.name ?? null;

  const halfA = summary.economy.teamA.half;
  const halfB = summary.economy.teamB.half;

  const teamA: TeamBlock = {
    name: sb.teamA.name,
    side: teamSide(sb.teamA.side),
    score: sb.teamA.score,
    firstHalf: {
      side: halfA.firstHalf.side ?? teamSide(sb.teamA.side),
      score: halfA.firstHalf.score,
    },
    secondHalf: {
      side: halfA.secondHalf.side ?? teamSide(sb.teamA.side),
      score: halfA.secondHalf.score,
    },
    players: sb.teamA.players.map((p) => toPlayer(p, mvpName)),
  };

  const teamB: TeamBlock = {
    name: sb.teamB.name,
    side: teamSide(sb.teamB.side),
    score: sb.teamB.score,
    firstHalf: {
      side: halfB.firstHalf.side ?? teamSide(sb.teamB.side),
      score: halfB.firstHalf.score,
    },
    secondHalf: {
      side: halfB.secondHalf.side ?? teamSide(sb.teamB.side),
      score: halfB.secondHalf.score,
    },
    players: sb.teamB.players.map((p) => toPlayer(p, mvpName)),
  };

  return {
    date: formatDate(sb.date),
    durationLabel: formatDuration(sb.durationSec),
    mapName: sb.map,
    mapPretty,
    winner,
    winnerName: winnerTeam.name,
    winnerLabel: `${winnerTeam.name} wins · ${mapPretty}`,
    teamA,
    teamB,
    highlights: mapHighlights(summary.highlights),
    roundFlow: mapRoundFlow(summary),
    openingDuels: {
      teamA: summary.openingDuels.filter((r) => r.teamLetter === 'A').map(toDuelRow),
      teamB: summary.openingDuels.filter((r) => r.teamLetter === 'B').map(toDuelRow),
    },
    utility: {
      teamA: summary.utility.filter((r) => r.teamLetter === 'A').map(toUtilityRow),
      teamB: summary.utility.filter((r) => r.teamLetter === 'B').map(toUtilityRow),
    },
    economy: {
      teamA: formatEconomy(summary.economy.teamA),
      teamB: formatEconomy(summary.economy.teamB),
    },
    duelMatrix: {
      players: summary.duelMatrix.players.map((p) => ({ name: p.name, team: p.teamLetter })),
      kills: summary.duelMatrix.kills,
    },
    heatmap: buildHeatmap(summary.heatmap, sb.map, radar),
    heroMapImage: radar ? fileUrl(radar.filePath) : null,
    mvpFooterName: mvpName,
    halfA: {
      first: `${halfA.firstHalf.side ?? ''} ${halfA.firstHalf.score}`.trim(),
      second: `${halfA.secondHalf.side ?? ''} ${halfA.secondHalf.score}`.trim(),
    },
    halfB: {
      first: `${halfB.firstHalf.side ?? ''} ${halfB.firstHalf.score}`.trim(),
      second: `${halfB.secondHalf.side ?? ''} ${halfB.secondHalf.score}`.trim(),
    },
    clutchMulti: summary.clutchMultiEmpty
      ? null
      : {
          teamA: summary.clutchMulti.filter((r) => r.teamLetter === 'A'),
          teamB: summary.clutchMulti.filter((r) => r.teamLetter === 'B'),
        },
    entryTrade: summary.entryTradeEmpty
      ? null
      : {
          teamA: summary.entryTrade.filter((r) => r.teamLetter === 'A'),
          teamB: summary.entryTrade.filter((r) => r.teamLetter === 'B'),
        },
    records: summary.recordsEmpty ? null : summary.records,
    aim: summary.aimEmpty
      ? null
      : {
          teamA: summary.aim.rows.filter((r) => r.teamLetter === 'A'),
          teamB: summary.aim.rows.filter((r) => r.teamLetter === 'B'),
          bestTap: summary.aim.bestTap,
          bestSpray: summary.aim.bestSpray,
          topShooter: summary.aim.topShooter,
        },
    bombPlays: summary.bombPlaysEmpty ? null : summary.bombPlays,
    source: sb.source ?? null,
    shareCode: sb.shareCode ?? null,
    serverName: sb.serverName ?? null,

    roundDetails: summary.roundDetails,
    bodyAccuracy: summary.bodyAccuracyEmpty ? null : summary.bodyAccuracy,
    eqTimeline: summary.eqTimeline,
    flashMatrix: summary.flashMatrixEmpty ? null : summary.flashMatrix,
    damagePerRound: summary.damagePerRound,
    roundInventory: summary.roundInventory,
    openingsSpatial: summary.openingsSpatial,
    playback: summary.playbackEmpty ? null : summary.playback,
    grenadesAgg: summary.grenadesAgg,
    playerImpact: summary.playerImpact,
    weaponTops: computeWeaponTops(summary),
    endReasonCounts: computeEndReasonCounts(summary),
  };
}

function computeWeaponTops(summary: MatchSummary): TemplateWeaponTop[] {
  // Aggregate weapon kills across both teams from the round-details kill list.
  const agg = new Map<string, { kills: number; hs: number }>();
  for (const r of summary.roundDetails) {
    for (const k of r.kills) {
      const name = (k.weapon || '').replace(/^weapon_/, '').toUpperCase();
      if (!name) continue;
      const prev = agg.get(name) ?? { kills: 0, hs: 0 };
      prev.kills += 1;
      if (k.headshot) prev.hs += 1;
      agg.set(name, prev);
    }
  }
  return [...agg.entries()]
    .map(([name, v]) => ({
      name,
      kills: v.kills,
      hs: v.kills > 0 ? Math.round((v.hs / v.kills) * 100) : 0,
    }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);
}

function computeEndReasonCounts(summary: MatchSummary): Record<string, number> {
  const out: Record<string, number> = { 'Eliminated': 0, 'Bomb detonated': 0, 'Bomb defused': 0, 'Time ran out': 0 };
  for (const r of summary.roundDetails) {
    out[r.endReason] = (out[r.endReason] ?? 0) + 1;
  }
  return out;
}

function teamSide(side: 'CT' | 'T' | 'MIXED'): 'CT' | 'T' {
  // Scoreboard "side" is whichever side the team finished on; MIXED only
  // happens for aborted/incomplete matches. Default to CT so the template
  // still renders colored chips in that edge case.
  return side === 'T' ? 'T' : 'CT';
}

function toPlayer(p: ScoreRow, mvpName: string | null): TemplatePlayer {
  return {
    name: p.name,
    mvpFlag: mvpName !== null && p.name === mvpName,
    k: p.kills,
    d: p.deaths,
    a: p.assists,
    adr: p.adr,
    hs: p.hsPct,
    kast: p.kast,
    mvp: p.mvps,
    fk: p.firstKills,
    rating: p.rating,
  };
}

function topRated(rows: ScoreRow[]): ScoreRow | undefined {
  return [...rows].sort((a, b) => b.rating - a.rating || b.kills - a.kills)[0];
}

function mapHighlights(src: Highlight[]): TemplateHighlight[] {
  return src.map((h) => ({
    label: h.label.toUpperCase(),
    player: h.player,
    detail: h.detail,
  }));
}

function mapRoundFlow(summary: MatchSummary): TemplateRound[] {
  return summary.roundFlow
    .filter((r) => r.winnerSide !== null)
    .map((r) => ({
      n: r.number,
      winner: r.winnerSide as 'CT' | 'T',
      ...(r.isHalftime ? { halftime: true } : {}),
    }));
}

function toDuelRow(r: OpeningDuelRow): TemplateDuelRow {
  return {
    name: r.name,
    att: r.attempts,
    wins: r.wins,
    losses: r.losses,
    pct: Math.round(r.successPct * 10) / 10,
    ct: `${r.ctWins}/${r.ctAttempts}`,
    t: `${r.tWins}/${r.tAttempts}`,
  };
}

function toUtilityRow(r: UtilityRow): TemplateUtilityRow {
  return {
    name: r.name,
    heDmg: r.heDamage,
    hePerRnd: r.heDamagePerRound,
    flashes: r.flashThrown,
    enemiesFlashed: r.enemiesFlashed,
    blindTime: r.blindTime,
    flashAssists: r.flashAssists,
    smokes: r.smokes,
  };
}

function formatEconomy(t: MatchSummary['economy']['teamA']): TemplateEconomy {
  const first = t.half.firstHalf;
  const second = t.half.secondHalf;
  const half = `${first.side ?? ''} ${first.score} → ${second.side ?? ''} ${second.score}`;
  return {
    half,
    pistols: t.breakdown.pistolWon,
    ecos: t.breakdown.ecoWon,
    forces: t.breakdown.forceWon,
    fullBuys: t.breakdown.fullBuyWon,
  };
}

function buildHeatmap(
  points: HeatmapPoint[],
  mapName: string,
  radar: RadarAsset | undefined | null,
): TemplateHeatmap | null {
  if (!radar) return null;
  const cal = getMapCalibration(mapName);
  if (!cal) return null;

  const dots: TemplateHeatmapDot[] = [];
  for (const p of points) {
    const { x, y } = worldToRadar(cal, p.worldX, p.worldY, radar.radarSize, HEATMAP_SIZE);
    if (x < 0 || x > HEATMAP_SIZE || y < 0 || y > HEATMAP_SIZE) continue;
    dots.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, side: p.killerSide });
  }

  return {
    radarFileUrl: fileUrl(radar.filePath),
    prettyMap: prettyMap(mapName),
    size: HEATMAP_SIZE,
    dots,
    totalKills: dots.length,
  };
}

function prettyMap(mapName: string): string {
  return mapName.replace(/^de_/, '').replace(/^cs_/, '').replace(/^ar_/, '');
}

function formatDate(d: Date | null): string {
  if (!d) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fileUrl(absPath: string): string {
  // `file:///C:/...` on Windows, `file:///home/...` on *nix.
  const forward = absPath.replace(/\\/g, '/');
  return forward.startsWith('/') ? `file://${forward}` : `file:///${forward}`;
}
