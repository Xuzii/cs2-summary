// Mirrors src/scoreboard/to-variation-b.ts TemplateData + compute outputs.
// Kept as a duplicate (rather than a shared package) to keep the web app's
// tsconfig boundary simple. Drift risk is mitigated because both sides are
// edited by the same hand — but if these ever diverge, the pipeline exporter
// will emit fields the renderer silently ignores.

export type Side = 'CT' | 'T';

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
  /**
   * In the web build this field is set by the exporter to the bare map name
   * (e.g. "de_mirage"), NOT a file:// URL. The React hero resolves it to
   * `/static/radars/<mapName>.png` at render time. Null when no radar exists.
   */
  heroMapImage: string | null;
  mvpFooterName: string | null;
  halfA: { first: string; second: string };
  halfB: { first: string; second: string };
  clutchMulti: { teamA: ClutchMultiRow[]; teamB: ClutchMultiRow[] } | null;
  entryTrade: { teamA: EntryTradeRow[]; teamB: EntryTradeRow[] } | null;
  records: MatchRecords | null;
  aim: AimPanelData | null;
  bombPlays: BombPlays | null;
  source: string | null;
  shareCode: string | null;
  serverName: string | null;

  // New fields consumed by the multi-page web UI.
  roundDetails: RoundDetail[];
  bodyAccuracy: BodyAccuracyMap | null;
  eqTimeline: EqTimelineEntry[];
  flashMatrix: FlashMatrix | null;
  damagePerRound: Record<string, number[]>;
  roundInventory: Record<number, Record<string, RoundInventoryEntry>>;
  openingsSpatial: OpeningSpatialEntry[];
  playback: PlaybackData | null;
  grenadesAgg: GrenadesAgg;
  playerImpact: Record<string, PlayerImpactRound[]>;
  weaponTops: WeaponTop[];
  endReasonCounts: Record<string, number>;
}

export interface WeaponTop {
  name: string;
  kills: number;
  hs: number;
}

export interface RoundDetailKill {
  t: number;
  killer: string;
  killerSide: Side;
  victim: string;
  victimSide: Side;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  firstKill: boolean;
}

export interface RoundDetail {
  n: number;
  winner: Side;
  halftime?: boolean;
  endReason: string;
  duration: number;
  kills: RoundDetailKill[];
  bomb: { planted: boolean; site?: 'A' | 'B'; defused?: boolean };
  econA: string;
  econB: string;
  eqA: number;
  eqB: number;
  topDamage: Array<{ name: string; dmg: number }>;
  bombPlantT?: number;
  bombDefuseT?: number;
  damageDealt: Record<string, number>;
}

export interface BodyHitGroup {
  head: number;
  chest: number;
  stomach: number;
  legs: number;
  arms: number;
  shots: number;
  hits: number;
}

export type BodyAccuracyMap = Record<string, BodyHitGroup>;

export interface EqTimelineEntry {
  n: number;
  eqA: number;
  eqB: number;
  winner: Side;
}

export type FlashMatrix = Record<string, Record<string, number>>;

export interface RoundInventoryEntry {
  hp: number;
  armor: number;
  helmet: boolean;
  primary: string | null;
  secondary: string;
  nades: string[];
  money: number;
}

export interface OpeningSpatialEntry {
  n: number;
  x: number;
  y: number;
  winnerSide: Side;
  killer: string;
  victim: string;
  weapon: string;
}

export interface PlaybackPoint {
  t: number;
  x: number;
  y: number;
  z?: number;
  /** Only populated when the backend had per-tick position data. */
  health?: number;
  isAlive?: boolean;
  hasBomb?: boolean;
  yaw?: number;
}

export interface PlaybackTrack {
  name: string;
  side: Side;
  team: 'A' | 'B';
  points: PlaybackPoint[];
}

export interface PlaybackGrenadeTrajectory {
  id: string;
  projectileId: string;
  type: string;
  thrower: string;
  throwerSide: Side;
  tStart: number;
  tEnd: number;
  points: Array<{ t: number; x: number; y: number; z?: number }>;
}

export interface PlaybackEffect {
  kind: 'smoke' | 'molotov' | 'flash';
  projectileId: string;
  at: { x: number; y: number };
  tStart: number;
  tEnd: number;
}

export interface PlaybackDeath {
  t: number;
  killer: string;
  killerSide: Side;
  victim: string;
  victimSide: Side;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  firstKill: boolean;
  killerPos: { x: number; y: number };
  victimPos: { x: number; y: number };
}

export interface PlaybackGrenade {
  id: string;
  t: number;
  thrower: string;
  throwerSide: Side;
  type: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface PlaybackFlash {
  grenadeId: string;
  thrower: string;
  throwerSide: Side;
  victim: string;
  victimSide: Side;
  duration: number;
  teamFlash: boolean;
}

export interface PlaybackEvent {
  t: number;
  kind: 'freeze-start' | 'round-start' | 'kill' | 'plant' | 'defuse' | 'end';
  label: string;
  killer?: string;
  victim?: string;
  weapon?: string;
  hs?: boolean;
  killerSide?: Side;
  victimSide?: Side;
}

export interface PlaybackRound {
  n: number;
  winner: Side;
  halftime?: boolean;
  endReason: string;
  duration: number;
  bomb: { planted: boolean; site?: 'A' | 'B'; defused?: boolean };
  bombPlantT: number | null;
  bombDefuseT: number | null;
  tracks: PlaybackTrack[];
  deaths: PlaybackDeath[];
  grenades: PlaybackGrenade[];
  /** Per-tick (8Hz) flight arcs, one per projectile. Absent on legacy data. */
  trajectories?: PlaybackGrenadeTrajectory[];
  /** Timed overlay effects (smoke cloud, molotov fire, flash burst). */
  effects?: PlaybackEffect[];
  flashes: PlaybackFlash[];
  events: PlaybackEvent[];
  eqA: number;
  eqB: number;
  econA: string;
  econB: string;
  damageDealt: Record<string, number>;
}

export interface PlaybackData {
  tickrate: number;
  /** Effective sample rate of tracks/trajectories, in Hz. Defaults to 8. */
  sampleHz?: number;
  rounds: PlaybackRound[];
}

export interface GrenadesAgg {
  total: number;
  byType: { smoke: number; flash: number; he: number; molotov: number; decoy: number };
  topThrowers: Array<{ name: string; count: number }>;
}

export interface PlayerImpactRound {
  n: number;
  dmg: number;
  kills: number;
  firstKill: boolean;
  multiKill: boolean;
  clutchWon: boolean;
  won: boolean;
}

export interface MatchIndexEntry {
  id: string;
  date: string | null;
  mapName: string;
  mapPretty: string;
  teamA: { name: string; score: number };
  teamB: { name: string; score: number };
  winner: 'A' | 'B' | 'draw';
  durationLabel: string;
  durationSec: number;
  mvp: string | null;
  source: string | null;
  shareCode: string | null;
}

export interface TeamBlock {
  name: string;
  side: Side;
  score: number;
  firstHalf: { side: Side; score: number };
  secondHalf: { side: Side; score: number };
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
  winner: Side;
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
  side: Side;
}

export interface TemplateHeatmap {
  /**
   * In the web build this is the bare map name (e.g. "de_mirage"), resolved
   * to `/static/radars/<mapName>.png` at render time.
   */
  radarFileUrl: string;
  prettyMap: string;
  size: number;
  dots: TemplateHeatmapDot[];
  totalKills: number;
}

export interface ClutchMultiRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  v1: { won: number; att: number };
  v2: { won: number; att: number };
  v3: { won: number; att: number };
  v4: { won: number; att: number };
  v5: { won: number; att: number };
  twoK: number;
  threeK: number;
  fourK: number;
  ace: number;
}

export interface EntryTradeRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  firstKills: number;
  firstDeaths: number;
  tradeKills: number;
  tradeDeaths: number;
  utilityDamage: number;
  utilPerRound: number;
}

export interface WeaponCount {
  weapon: string;
  kills: number;
}

export interface KillRecord {
  player: string;
  weapon: string;
  distance: number;
  roundNumber: number | null;
}

export interface RoundLenRecord {
  roundNumber: number;
  durationSec: number;
  winnerSide: Side | null;
}

export interface BestRoundRecord {
  player: string;
  teamLetter: 'A' | 'B';
  kills: number;
  roundNumber: number;
}

export interface NoveltyCounts {
  wallbangs: number;
  noScopes: number;
  throughSmoke: number;
  collaterals: number;
  blindKills: number;
}

export interface MatchRecords {
  topWeapons: WeaponCount[];
  fastestRound: RoundLenRecord | null;
  slowestRound: RoundLenRecord | null;
  longestKill: KillRecord | null;
  bestRound: BestRoundRecord | null;
  novelty: NoveltyCounts;
}

export interface AimRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  shots: number;
  hitPct: number;
  hsAcc: number;
  sprayAcc: number;
  tapAcc: number;
  movingPct: number;
  avgDist: number;
  flashKills: number;
  blindKills: number;
}

export interface AimPanelData {
  teamA: AimRow[];
  teamB: AimRow[];
  bestTap: { name: string; acc: number } | null;
  bestSpray: { name: string; acc: number } | null;
  topShooter: { name: string; shots: number } | null;
}

export interface BombPlays {
  plantsA: number;
  plantsB: number;
  plantsTotal: number;
  defuses: number;
  topPlanter: { name: string; count: number } | null;
  topDefuser: { name: string; count: number } | null;
}

/** Shape of a per-player card, matching src/scoreboard/compute/player-card.ts. */
export interface PlayerCardData {
  player: {
    name: string;
    steamId: string;
    teamName: string;
    teamLetter: 'A' | 'B';
    finalSide: 'CT' | 'T' | 'MIXED';
  };
  match: {
    mapName: string;
    mapPretty: string;
    scoreA: number;
    scoreB: number;
    teamAName: string;
    teamBName: string;
    result: 'WON' | 'LOST' | 'DRAW';
    date: string;
    durationLabel: string;
  };
  headline: {
    kills: number;
    deaths: number;
    assists: number;
    adr: number;
    rating: number;
    hsPct: number;
    kast: number;
    mvps: number;
  };
  openings: {
    wins: number;
    losses: number;
    winPct: number;
    entryFrags: number;
    firstDeaths: number;
  };
  clutches: {
    v1: { won: number; att: number };
    v2: { won: number; att: number };
    v3: { won: number; att: number };
    v4: { won: number; att: number };
    v5: { won: number; att: number };
  };
  multiKills: {
    k1: number;
    k2: number;
    k3: number;
    k4: number;
    ace: number;
  };
  rounds: Array<{
    n: number;
    damage: number;
    won: boolean;
    hadKill: boolean;
    isClutch: boolean;
    isFirstKill: boolean;
    isMultiKill: boolean;
    side: Side | null;
  }>;
  weapons: Array<{
    name: string;
    kills: number;
    hitPct: number;
    hsPct: number;
  }>;
  aim: {
    hitPct: number;
    hsAcc: number;
    sprayAcc: number;
    tapAcc: number;
    movingPct: number;
    avgDist: number;
  };
  utility: {
    heDmg: number;
    flashAssists: number;
    enemiesFlashed: number;
    blindTime: number;
    smokes: number;
  };
  specials: {
    wallbangs: number;
    noscopes: number;
    throughSmoke: number;
    blindKills: number;
    flashKills: number;
  };
  duelsVsEnemies: Array<{
    enemyName: string;
    kills: number;
    deaths: number;
  }>;
  deaths: {
    nemesisName: string | null;
    nemesisDeaths: number;
    nemesisWeapon: string | null;
    firstDeaths: number;
    tradedDeaths: number;
    totalDeaths: number;
    blindedDeaths: number;
  };
  /** Bare map name when a radar is available; null otherwise. */
  heroMapImage: string | null;
}

/** On-disk shape for each match JSON under /matches/<id>.json. */
export interface MatchDocument {
  /** Stable match id used in the URL and as the file name. */
  id: string;
  /** Schema version, so older exports keep rendering if fields move. */
  version: 1;
  /** Core match payload (same shape as the PNG renderer consumes). */
  match: TemplateData;
  /** Per-player cards for tracked players (empty when none matched). */
  players: PlayerCardData[];
}
