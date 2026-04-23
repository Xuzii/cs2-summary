/**
 * Typed shape of the JSON produced by @akiver/cs-demo-analyzer.
 *
 * Field names track cs-demo-manager's Match type (which hydrates the same
 * parser output from Postgres). If the JSON export uses different casing or
 * a nested wrapper, load-match.ts normalizes it before the rest of the app
 * sees a Match.
 *
 * Scoreboard-required fields are strict. Everything else is optional so the
 * types survive minor parser schema drift.
 */

export type TeamSide = 2 | 3; // 2 = T, 3 = CT (TeamNumber enum)

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Team {
  name: string;
  letter: 'A' | 'B';
  score: number;
  currentSide: TeamSide;
  scoreFirstHalf?: number;
  scoreSecondHalf?: number;
}

export interface MatchPlayer {
  steamId: string;
  name: string;
  teamName: string;

  killCount: number;
  deathCount: number;
  assistCount: number;
  averageDamagePerRound: number;
  headshotPercentage: number;
  mvpCount: number;
  firstKillCount: number;

  hltvRating?: number;
  hltvRating2?: number;
  kast?: number;
  score?: number;
  headshotCount?: number;
  firstDeathCount?: number;
  killDeathRatio?: number;
  damageHealth?: number;
  damageArmor?: number;
  utilityDamage?: number;
  averageUtilityDamagePerRound?: number;
  tradeKillCount?: number;
  tradeDeathCount?: number;
  oneKillCount?: number;
  twoKillCount?: number;
  threeKillCount?: number;
  fourKillCount?: number;
  fiveKillCount?: number;
  collateralKillCount?: number;
  wallbangKillCount?: number;
  noScopeKillCount?: number;
  bombPlantedCount?: number;
  bombDefusedCount?: number;
  hostageRescuedCount?: number;

  // Clutch aggregates (per-player). Parser variants observed:
  //   - oneVsOneCount / oneVsOneWonCount (1v1 only)
  //   - clutchCount / clutchWonCount (all 1vN)
  oneVsOneCount?: number;
  oneVsOneWonCount?: number;
  clutchCount?: number;
  clutchWonCount?: number;

  // Utility aggregates.
  enemiesFlashedCount?: number;
  /** Total seconds of blindness inflicted on enemies across the match. */
  blindTimeInflicted?: number;
  flashAssistCount?: number;
  smokeThrownCount?: number;
  heThrownCount?: number;
  molotovThrownCount?: number;
  decoyThrownCount?: number;
  flashThrownCount?: number;
}

export interface Round {
  number: number;
  startTick?: number;
  /** Tick at which freeze time ends and the round actually begins. */
  freezeTimeEndTick?: number;
  endTick?: number;
  /** Last tick of the post-round capture window (csda emits position frames through here). */
  endOfficiallyTick?: number;
  teamAScore?: number;
  teamBScore?: number;
  teamASide?: TeamSide;
  teamBSide?: TeamSide;
  duration?: number;
  endReason?: string;
  winnerTeamName?: string;
  winnerSide?: TeamSide;

  // Economy — present when parser emits team buy info per round.
  teamAStartMoney?: number;
  teamBStartMoney?: number;
  teamAEquipmentValue?: number;
  teamBEquipmentValue?: number;
  /** "pistol" | "eco" | "semi" | "force-buy" | "full" (per team, csda-classified). */
  teamAEconomyType?: string;
  teamBEconomyType?: string;

  /** 'A' or 'B' when the bomb was planted this round; undefined otherwise. */
  bombSite?: 'A' | 'B';
}

export interface Kill {
  killerSteamId: string;
  killerName: string;
  killerSide: TeamSide;
  victimSteamId: string;
  victimName: string;
  victimSide: TeamSide;
  assisterSteamId?: string;
  assisterName?: string;
  weaponName?: string;
  isHeadshot?: boolean;
  isTradeKill?: boolean;
  isTradeDeath?: boolean;
  isWallbang?: boolean;
  isNoScope?: boolean;
  isThroughSmoke?: boolean;
  isKillerBlinded?: boolean;
  isVictimBlinded?: boolean;
  isAssistedFlash?: boolean;
  /** Opening kill of the round (first kill event). Used for entry-frag stats. */
  isFirstKill?: boolean;
  killerPosition?: Position;
  victimPosition?: Position;
  tick?: number;
  roundNumber?: number;
}

export interface Shot {
  playerSteamId: string;
  playerSide?: TeamSide;
  weaponName?: string;
  tick?: number;
  roundNumber?: number;
  /** Shooter velocity at the time of the shot. */
  velocityX?: number;
  velocityY?: number;
  velocityZ?: number;
  isPlayerControllingBot?: boolean;
}

export interface Damage {
  attackerSteamId: string;
  victimSteamId: string;
  weaponName?: string;
  /** 0=generic, 1=head, 2=chest, 3=stomach, 4=left arm, 5=right arm, 6=left leg, 7=right leg, 8=neck, 10=gear. */
  hitgroup?: number;
  healthDamage?: number;
  armorDamage?: number;
  tick?: number;
  roundNumber?: number;
}

export interface BombEvent {
  playerSteamId: string;
  playerName?: string;
  /** 'A' or 'B' site. */
  site?: 'A' | 'B';
  tick?: number;
  roundNumber?: number;
}

export interface Clutch {
  clutcherSteamId: string;
  /** 1..5 — number of alive enemies when the clutch began. */
  opponentsCount: number;
  won: boolean;
  roundNumber?: number;
  tick?: number;
}

export interface Grenade {
  /** flashbang | hegrenade | smokegrenade | molotov | incgrenade | decoy */
  type?: string;
  throwerSteamId?: string;
  throwerSide?: TeamSide;
  throwerName?: string;
  roundNumber?: number;
  tick?: number;
  /** Final position (landing / explosion). */
  position?: Position;
}

export interface PlayerBlind {
  flasherSteamId?: string;
  flashedSteamId?: string;
  flasherSide?: TeamSide;
  flashedSide?: TeamSide;
  /** Seconds of blindness inflicted by this flash event. */
  duration?: number;
  roundNumber?: number;
  tick?: number;
}

/**
 * Per-frame sample of a player's world position + state, emitted by csda's
 * `-positions` flag. The parser records one entry per active player per
 * `FrameDone` event (i.e. every demo frame, ~64-128 per second depending on
 * the tick-rate). The decimator in scoreboard/compute/playback.ts thins this
 * to 8Hz before it hits the browser.
 *
 * Field names mirror cs-demo-analyzer's `PlayerPosition` Go struct,
 * camelCase-ified (`playerPositions` JSON tag on Match).
 */
export interface PlayerPositionFrame {
  tick?: number;
  frame?: number;
  roundNumber?: number;
  steamId: string;
  name?: string;
  side?: TeamSide;
  x: number;
  y: number;
  z?: number;
  yaw?: number;
  isAlive?: boolean;
  health?: number;
  armor?: number;
  hasHelmet?: boolean;
  activeWeaponName?: string;
  hasBomb?: boolean;
  hasDefuseKit?: boolean;
  flashDurationRemaining?: number;
  money?: number;
  isDucking?: boolean;
  isScoping?: boolean;
  isDefusing?: boolean;
  isPlanting?: boolean;
}

/**
 * Per-frame grenade projectile position. csda emits one entry per in-flight
 * projectile per frame (so a smoke lives for ~1-2 seconds = ~100-200 frames).
 * Grouped by `projectileId` downstream to reconstruct the flight arc.
 */
export interface GrenadePositionFrame {
  tick?: number;
  frame?: number;
  roundNumber?: number;
  /** 64-bit projectile id — preserved as string via precisionSafeRewrite. */
  projectileId: string;
  grenadeId?: string;
  grenadeName?: string;
  throwerSteamId?: string;
  throwerName?: string;
  throwerSide?: TeamSide;
  x: number;
  y: number;
  z?: number;
}

/**
 * Per-frame inferno (molotov/incendiary) particle positions. csda emits one
 * entry per fire particle per frame. We only need the {round, tStart, tEnd,
 * centroid} summary downstream for the 2D replay overlay.
 */
export interface InfernoPositionFrame {
  tick?: number;
  frame?: number;
  roundNumber?: number;
  projectileId: string;
  x: number;
  y: number;
  z?: number;
}

/**
 * The core typed match object.
 *
 * Note: we intentionally do NOT retain the full parsed JSON here. An earlier
 * version kept a `raw: unknown` field "for future features", which for a 280
 * MB CS2 demo pinned 1-2 GB of object graph in memory for the entire render
 * + post-to-Discord pipeline. Only two fields (`shareCode`, `serverName`) were
 * ever actually read from it — both are extracted during normalizeMatch and
 * stored as typed properties below. If a future feature needs a field we
 * haven't mapped yet, add it to this interface rather than reintroducing raw.
 */
export interface Match {
  checksum?: string;
  demoFilePath?: string;
  mapName: string;
  game?: 'CSGO' | 'CS2' | 'CS2 LT';
  source?: string;
  type?: 'POV' | 'GOTV';
  tickrate?: number;
  frameRate?: number;
  duration: number;
  date?: string;
  serverName?: string;
  clientName?: string;
  shareCode?: string;

  maxRounds?: number;
  winnerName?: string;
  winnerSide?: TeamSide;

  teamA: Team;
  teamB: Team;
  players: MatchPlayer[];
  rounds?: Round[];
  kills?: Kill[];
  clutches?: Clutch[];
  grenades?: Grenade[];
  playerBlinds?: PlayerBlind[];
  shots?: Shot[];
  damages?: Damage[];
  bombsPlanted?: BombEvent[];
  bombsDefused?: BombEvent[];

  /**
   * Per-frame entity position arrays. Only present when csda was run with
   * `-positions` (INCLUDE_POSITIONS=true). Loaded as-is; the scoreboard
   * compute layer (playback.ts) decimates to 8Hz before the web JSON export.
   */
  playerPositions?: PlayerPositionFrame[];
  grenadePositions?: GrenadePositionFrame[];
  infernoPositions?: InfernoPositionFrame[];
}

export const TEAM_SIDE_T: TeamSide = 2;
export const TEAM_SIDE_CT: TeamSide = 3;
