import type {
  MatchDocument,
  TemplateData,
  TemplatePlayer,
  Side,
} from '../types';

/**
 * ViewModel shape consumed by the ported JSX/TSX components (overview, players,
 * rounds, etc.). Mirrors the original `window.MOCK.MATCH` object used by the
 * standalone deck — with fields renamed where the MatchDocument uses different
 * names but aliased where they already match.
 */

export interface VMPlayer extends TemplatePlayer {
  steamId: string;
  note: string;
}

export interface VMTeam {
  name: string;
  code: 'A' | 'B';
  side: 'T' | 'CT';
  score: number;
  resultLabel: string;
  firstHalf: { side: 'T' | 'CT'; score: number };
  secondHalf: { side: 'T' | 'CT'; score: number };
  players: VMPlayer[];
}

export interface VMOpeningRow {
  name: string;
  note?: string;
  attempts: number;
  wins: number;
  lost: number;
  pct: number;
  tSide: string;
  ctSide: string;
}

export interface VMUtilityRow {
  name: string;
  note?: string;
  heDmg: number;
  heEfh: number;
  fa: number;
  ef: number;
  blindTime: number;
  smokes: number;
}

export interface VMEconomy {
  half: string;
  pistols: number;
  ecos: number;
  forces: number;
  fullBuys: number;
}

export interface VMClutchRow {
  name: string;
  note?: string;
  c1: string;
  c2: string;
  c3: string;
  c4: string;
  c5: string;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  ace: number;
}

export interface VMEntryRow {
  name: string;
  note?: string;
  fk: number;
  fd: number;
  traded: number;
  tradeFor: number;
  opened: number;
  dmgGiven: number;
  dmgTaken: number;
}

export interface VMAimRow {
  name: string;
  shots: number;
  hitPct: number;
  hsPct: number;
  hsAccPct: number;
  tapPct: number;
  sprayPct: number;
  movingPct: number;
  avgDist: number;
}

export interface VMBomb {
  plants: number;
  defuses: number;
  topPlanter: { name: string; n: number };
  topDefuser: { name: string; n: number };
  siteSplit: { A: number; B: number };
}

export interface ViewModel {
  id: string;
  date: string;
  mapName: string;
  mapPretty: string;
  durationLabel: string;
  serverName: string;
  shareCode: string;
  winner: 'A' | 'B';
  teamA: VMTeam;
  teamB: VMTeam;
  roundFlow: Array<{ n: number; winner: Side; halftime?: boolean }>;
  roundDetails: TemplateData['roundDetails'];
  playerRoundImpact: TemplateData['playerImpact'];
  highlights: TemplateData['highlights'];
  heatmap: Array<{ x: number; y: number; side: Side; round: number }>;
  duelMatrix: { players: Array<{ name: string; team: 'A' | 'B' }>; kills: number[][] };
  openingDuels: { teamA: VMOpeningRow[]; teamB: VMOpeningRow[] };
  utility: { teamA: VMUtilityRow[]; teamB: VMUtilityRow[] };
  economy: { teamA: VMEconomy; teamB: VMEconomy };
  clutches: { teamA: VMClutchRow[]; teamB: VMClutchRow[] };
  entryTrade: { teamA: VMEntryRow[]; teamB: VMEntryRow[] };
  aim: { teamA: VMAimRow[]; teamB: VMAimRow[] };
  weaponTops: TemplateData['weaponTops'];
  records: TemplateData['records'];
  bomb: VMBomb;
  playback: TemplateData['playback'];
  bodyAccuracy: TemplateData['bodyAccuracy'];
  flashMatrix: TemplateData['flashMatrix'];
  damagePerRound: TemplateData['damagePerRound'];
  roundInventory: TemplateData['roundInventory'];
  openingsSpatial: TemplateData['openingsSpatial'];
  eqTimeline: TemplateData['eqTimeline'];
  endReasonCounts: TemplateData['endReasonCounts'];
  grenadesAgg: TemplateData['grenadesAgg'];
}

function mkTeam(raw: TemplateData['teamA'], code: 'A' | 'B', winner: 'A' | 'B'): VMTeam {
  const isWinner = winner === code;
  const sideLabel = raw.side === 'T' ? 'TERRORIST' : 'COUNTER-TERRORIST';
  return {
    name: raw.name,
    code,
    side: raw.side,
    score: raw.score,
    resultLabel: `${isWinner ? 'WINNER' : 'DEFEAT'} · ${sideLabel}`,
    firstHalf: { side: raw.firstHalf.side, score: raw.firstHalf.score },
    secondHalf: { side: raw.secondHalf.side, score: raw.secondHalf.score },
    players: raw.players.map((p, i) => ({
      ...p,
      steamId: `player-${code}-${i}`,
      note: '',
    })),
  };
}

function mkOpenings(
  rows: TemplateData['openingDuels']['teamA'],
): VMOpeningRow[] {
  return rows.map((r) => ({
    name: r.name,
    attempts: r.att,
    wins: r.wins,
    lost: r.losses,
    pct: r.pct,
    tSide: r.t,
    ctSide: r.ct,
  }));
}

function mkUtility(rows: TemplateData['utility']['teamA']): VMUtilityRow[] {
  return rows.map((r) => ({
    name: r.name,
    heDmg: r.heDmg,
    heEfh: r.hePerRnd,
    fa: r.flashAssists,
    ef: r.enemiesFlashed,
    blindTime: r.blindTime,
    smokes: r.smokes,
  }));
}

function mkEconomy(e: TemplateData['economy']['teamA']): VMEconomy {
  return {
    half: e.half,
    pistols: e.pistols,
    ecos: e.ecos,
    forces: e.forces,
    fullBuys: e.fullBuys,
  };
}

function mkClutches(rows: NonNullable<TemplateData['clutchMulti']>['teamA']): VMClutchRow[] {
  const pair = (o: { won: number; att: number }): string => `${o.won}/${o.att}`;
  return rows.map((r) => ({
    name: r.name,
    c1: pair(r.v1),
    c2: pair(r.v2),
    c3: pair(r.v3),
    c4: pair(r.v4),
    c5: pair(r.v5),
    k1: 0,
    k2: r.twoK,
    k3: r.threeK,
    k4: r.fourK,
    ace: r.ace,
  }));
}

function mkEntries(rows: NonNullable<TemplateData['entryTrade']>['teamA']): VMEntryRow[] {
  return rows.map((r) => ({
    name: r.name,
    fk: r.firstKills,
    fd: r.firstDeaths,
    traded: r.tradeDeaths,
    tradeFor: r.tradeKills,
    opened: r.firstKills + r.firstDeaths,
    dmgGiven: Math.round(r.utilityDamage),
    dmgTaken: 0,
  }));
}

function mkAim(rows: NonNullable<TemplateData['aim']>['teamA']): VMAimRow[] {
  return rows.map((r) => ({
    name: r.name,
    shots: r.shots,
    hitPct: r.hitPct,
    hsPct: 0,
    hsAccPct: r.hsAcc,
    tapPct: r.tapAcc,
    sprayPct: r.sprayAcc,
    movingPct: r.movingPct,
    avgDist: r.avgDist,
  }));
}

function mkBomb(bp: TemplateData['bombPlays']): VMBomb {
  if (!bp) {
    return {
      plants: 0,
      defuses: 0,
      topPlanter: { name: '—', n: 0 },
      topDefuser: { name: '—', n: 0 },
      siteSplit: { A: 0, B: 0 },
    };
  }
  const splitA = bp.plantsTotal > 0 ? Math.round((bp.plantsA / bp.plantsTotal) * 100) : 0;
  return {
    plants: bp.plantsTotal,
    defuses: bp.defuses,
    topPlanter: bp.topPlanter
      ? { name: bp.topPlanter.name, n: bp.topPlanter.count }
      : { name: '—', n: 0 },
    topDefuser: bp.topDefuser
      ? { name: bp.topDefuser.name, n: bp.topDefuser.count }
      : { name: '—', n: 0 },
    siteSplit: { A: splitA, B: 100 - splitA },
  };
}

export function toViewModel(doc: MatchDocument): ViewModel {
  const m = doc.match;
  const duelMatrixPlayers = m.duelMatrix.players.map((p) => ({ name: p.name, team: p.team }));

  return {
    id: doc.id,
    date: m.date,
    mapName: m.mapName,
    mapPretty: m.mapPretty.toUpperCase(),
    durationLabel: m.durationLabel,
    serverName: m.serverName ?? 'UNKNOWN',
    shareCode: m.shareCode ?? '',
    winner: m.winner,
    teamA: mkTeam(m.teamA, 'A', m.winner),
    teamB: mkTeam(m.teamB, 'B', m.winner),
    roundFlow: m.roundFlow,
    roundDetails: m.roundDetails,
    playerRoundImpact: m.playerImpact,
    highlights: m.highlights,
    heatmap: m.heatmap
      ? m.heatmap.dots.map((d) => ({ x: d.x, y: d.y, side: d.side, round: 0 }))
      : [],
    duelMatrix: { players: duelMatrixPlayers, kills: m.duelMatrix.kills },
    openingDuels: {
      teamA: mkOpenings(m.openingDuels.teamA),
      teamB: mkOpenings(m.openingDuels.teamB),
    },
    utility: {
      teamA: mkUtility(m.utility.teamA),
      teamB: mkUtility(m.utility.teamB),
    },
    economy: {
      teamA: mkEconomy(m.economy.teamA),
      teamB: mkEconomy(m.economy.teamB),
    },
    clutches: {
      teamA: m.clutchMulti ? mkClutches(m.clutchMulti.teamA) : [],
      teamB: m.clutchMulti ? mkClutches(m.clutchMulti.teamB) : [],
    },
    entryTrade: {
      teamA: m.entryTrade ? mkEntries(m.entryTrade.teamA) : [],
      teamB: m.entryTrade ? mkEntries(m.entryTrade.teamB) : [],
    },
    aim: {
      teamA: m.aim ? mkAim(m.aim.teamA) : [],
      teamB: m.aim ? mkAim(m.aim.teamB) : [],
    },
    weaponTops: m.weaponTops,
    records: m.records,
    bomb: mkBomb(m.bombPlays),
    playback: m.playback,
    bodyAccuracy: m.bodyAccuracy,
    flashMatrix: m.flashMatrix,
    damagePerRound: m.damagePerRound,
    roundInventory: m.roundInventory,
    openingsSpatial: m.openingsSpatial,
    eqTimeline: m.eqTimeline,
    endReasonCounts: m.endReasonCounts,
    grenadesAgg: m.grenadesAgg,
  };
}
