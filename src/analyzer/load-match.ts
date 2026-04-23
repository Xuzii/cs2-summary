import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type {
  BombEvent,
  Clutch,
  Damage,
  Grenade,
  GrenadePositionFrame,
  InfernoPositionFrame,
  Match,
  MatchPlayer,
  PlayerBlind,
  PlayerPositionFrame,
  Position,
  Round,
  Shot,
  Team,
  TeamSide,
} from './types.ts';

/**
 * Read the JSON file produced by @akiver/cs-demo-analyzer's `format=json`
 * export and normalize it into our Match type.
 *
 * Shape notes verified against v1.8.3 output on CS2 Valve matchmaking demos:
 *   - `players` is an object keyed by steamId (string), not an array.
 *     We prefer the key over the numeric `steamId` field inside each entry
 *     because 64-bit Steam IDs lose precision when parsed as JS numbers.
 *   - `duration` is nanoseconds.
 *   - `winner` is the winning team object (not a string).
 *   - `framerate` is lowercase.
 *   - Per-player field names include: team (nested object), healthDamage,
 *     armorDamage, headshotPercent, averageKillPerRound, averageDeathPerRound,
 *     utilityDamagePerRound, winCount, oneVsOneCount, oneVsOneWonCount, ...
 */
export async function loadMatchFromJsonFolder(outputFolder: string): Promise<Match> {
  const log = (msg: string) => console.log(`[${new Date().toISOString()}] [load] ${msg}`);
  const mem = () => {
    const m = process.memoryUsage();
    const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `rss=${mb(m.rss)} heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}`;
  };

  const entries = await readdir(outputFolder);
  const jsonFile = entries.find((f) => f.toLowerCase().endsWith('.json'));
  if (!jsonFile) {
    throw new Error(`No JSON output file found in ${outputFolder}. Entries: ${entries.join(', ')}`);
  }

  const jsonPath = path.join(outputFolder, jsonFile);
  const jsonStat = await stat(jsonPath);
  log(`Reading JSON (${(jsonStat.size / (1024 * 1024)).toFixed(1)} MB) from ${jsonPath}`);

  // V8 caps single-string length at ~512 MB (2^29 - 24). csda emits per-tick
  // player/grenade/inferno positions at the demo's full tick rate (~64 Hz),
  // so a normal-length match exceeds 700 MB and any overtime match exceeds 1 GB.
  // Above the threshold we stream-parse instead of materializing the whole
  // file as a JS string. Native JSON.parse stays for smaller files because
  // it's significantly faster than the streaming tokenizer.
  const STREAM_PARSE_THRESHOLD_BYTES = 400 * 1024 * 1024;
  const useStreaming = jsonStat.size > STREAM_PARSE_THRESHOLD_BYTES;

  let raw: unknown;
  let rawDate: unknown;
  try {
    if (useStreaming) {
      log(`Using streaming parser (file > ${STREAM_PARSE_THRESHOLD_BYTES / (1024 * 1024)} MB threshold).`);
      const t0 = Date.now();
      raw = await streamParseJsonFile(jsonPath, log);
      log(`Streaming JSON parse in ${Date.now() - t0}ms (${mem()})`);
    } else {
      // Memory-critical section. For a 280 MB demo the JSON can exceed 500 MB,
      // and each of (file-string, precision-rewritten string, parsed object tree)
      // is the same size or larger. We drop each intermediate immediately and
      // rebind to let-vars so the GC can reclaim them before the next allocation.
      // Previously these were held in `const`s that lived the whole function and
      // pushed peak RSS into multi-GB territory on top of whatever csda left.
      const t0 = Date.now();
      let buf: string | null = await readFile(jsonPath, 'utf8');
      log(`Read JSON in ${Date.now() - t0}ms (${mem()})`);

      const t1 = Date.now();
      let rewritten: string | null = precisionSafeRewrite(buf);
      buf = null; // release the untouched copy — rewritten supersedes it
      log(`Precision-safe rewrite in ${Date.now() - t1}ms (${mem()})`);
      const t2 = Date.now();
      raw = JSON.parse(rewritten);
      rewritten = null; // release the rewritten copy — parsed tree supersedes it
      log(`JSON.parse in ${Date.now() - t2}ms (${mem()})`);
    }
  } catch (err) {
    throw new Error(`Failed to parse analyzer JSON at ${jsonPath}: ${(err as Error).message}`);
  }

  const t3 = Date.now();
  const match = normalizeMatch(raw);
  // Capture the date field for DATE_DEBUG before we drop the raw tree.
  if (process.env.DATE_DEBUG && isObject(raw)) {
    rawDate = (raw as Record<string, unknown>)['date'];
  }
  // Critical: drop the last reference to the full parser JSON so it can be
  // garbage-collected. Without this, the 1-2 GB object graph lives until the
  // pipeline's outermost function returns, pinned through compute/render/post.
  raw = undefined;
  log(`Normalized match in ${Date.now() - t3}ms (${mem()})`);

  // Date fallback: if the parser didn't populate a match-start date, use the
  // source .dem file's mtime. Avoids showing "now" (current render time).
  if (!match.date && match.demoFilePath) {
    try {
      const st = await stat(match.demoFilePath);
      match.date = st.mtime.toISOString();
    } catch {
      // Demo file might be moved/deleted after analysis — leave date unset.
    }
  }

  if (process.env.DATE_DEBUG) {
    console.log('[load-match] date resolution:', {
      rawDate,
      normalizedDate: match.date,
      demoFilePath: match.demoFilePath,
    });
  }

  return match;
}

/**
 * The parser emits 64-bit steam IDs and projectile IDs as bare JSON numbers,
 * which JS `JSON.parse` silently rounds once they exceed 2^53 (~16 digits).
 * We quote any 16+ digit numeric literal so parsing preserves the exact string.
 * Steam IDs become strings end-to-end, eliminating lookup mismatches between
 * the `players` dict (string-keyed) and event arrays.
 */
function precisionSafeRewrite(text: string): string {
  return text.replace(/([:\[,]\s*)(\d{16,})(\s*[,\]}])/g, '$1"$2"$3');
}

// stream-json is CommonJS; createRequire avoids any ESM/CJS interop quirks.
const requireCjs = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const streamJsonParser = requireCjs('stream-json/parser.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StreamJsonAssembler = requireCjs('stream-json/assembler.js');

/**
 * Streaming Assembler that preserves precision for 16+ digit integers, the
 * token-level equivalent of `precisionSafeRewrite`. The base Assembler calls
 * `parseFloat` on every numeric literal, which silently rounds 64-bit steam
 * IDs (e.g. 76561198053011290 → 76561198053011300). We intercept those tokens
 * and route them through `stringValue` instead so they survive end-to-end.
 *
 * Same matching rule as the regex: only positive integer literals of 16+
 * digits — fractional or exponent-bearing numbers go through unchanged.
 */
class PrecisionSafeAssembler extends StreamJsonAssembler {
  numberValue(value: string): void {
    if (value.length >= 16 && /^\d+$/.test(value)) {
      super.stringValue(value);
    } else {
      super.numberValue(value);
    }
  }
}

/**
 * Stream-parse a JSON file too large to fit in a single JS string (V8 caps
 * strings at ~512 MB). Builds the same in-memory object tree native
 * `JSON.parse` would produce, but without ever materializing the file as a
 * single string. Handles 64-bit steam IDs via `PrecisionSafeAssembler`.
 *
 * Tradeoff: the streaming tokenizer is several times slower than native
 * `JSON.parse` per byte, so we only invoke this above the size threshold.
 */
function streamParseJsonFile(jsonPath: string, log: (msg: string) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const file = createReadStream(jsonPath, { highWaterMark: 4 * 1024 * 1024 });
    // packValues + !streamValues: only the consolidated `keyValue/stringValue/
    // numberValue` tokens are emitted, which is all the Assembler needs.
    // Suppressing the per-character chunk tokens roughly halves token volume.
    const parserStream = streamJsonParser.asStream({
      packValues: true,
      streamValues: false,
    });
    const asm = new PrecisionSafeAssembler();
    asm.connectTo(parserStream);

    let bytesRead = 0;
    let nextLogAt = 100 * 1024 * 1024; // log every 100 MB
    file.on('data', (chunk: Buffer | string) => {
      bytesRead += chunk.length;
      if (bytesRead >= nextLogAt) {
        log(`...streaming parse ${(bytesRead / (1024 * 1024)).toFixed(0)} MB read`);
        nextLogAt += 100 * 1024 * 1024;
      }
    });

    const fail = (err: Error) => reject(err);
    file.on('error', fail);
    parserStream.on('error', fail);
    parserStream.on('end', () => {
      if (!asm.done) {
        return reject(new Error('Streaming JSON parse ended before top-level value completed'));
      }
      resolve(asm.current);
    });

    file.pipe(parserStream);
  });
}

export function normalizeMatch(raw: unknown): Match {
  if (!isObject(raw)) {
    throw new Error('Analyzer output is not a JSON object.');
  }
  const root = (isObject(raw['match']) ? raw['match'] : raw) as Record<string, unknown>;

  const teamA = readTeam(root['teamA'] ?? root['team_a'], 'A');
  const teamB = readTeam(root['teamB'] ?? root['team_b'], 'B');

  const players = readPlayers(root['players']);
  const rounds = pickArray(root, ['rounds']).map(readRound);
  const kills = pickArray(root, ['kills']).map(readKill);
  const clutches = pickArray(root, ['clutches']).map(readClutch).filter((c): c is Clutch => c !== null);
  const grenades = [
    ...pickArray(root, ['grenades', 'grenadeThrows', 'grenade_throws']).map((g) => readGrenade(g, undefined)),
    ...pickArray(root, ['flashbangsExplode']).map((g) => readGrenade(g, 'flashbang')),
    ...pickArray(root, ['smokesStart']).map((g) => readGrenade(g, 'smokegrenade')),
    ...pickArray(root, ['heGrenadesExplode']).map((g) => readGrenade(g, 'hegrenade')),
    ...pickArray(root, ['decoysStart']).map((g) => readGrenade(g, 'decoy')),
    ...pickArray(root, ['infernosStart', 'molotovsStart']).map((g) => readGrenade(g, 'molotov')),
  ];
  const playerBlinds = pickArray(root, ['playersFlashed', 'playerBlinds', 'player_blinds', 'blinds']).map(
    readPlayerBlind,
  );
  const shots = pickArray(root, ['shots', 'weaponsFired', 'weapons_fired']).map(readShot);
  const damages = pickArray(root, ['damages', 'playerHurt', 'player_hurt']).map(readDamage);
  const bombsPlanted = pickArray(root, ['bombsPlanted', 'bombs_planted', 'bombPlants']).map(readBombEvent);
  const bombsDefused = pickArray(root, ['bombsDefused', 'bombs_defused', 'bombDefuses']).map(readBombEvent);
  const playerPositions = pickArray(root, ['playerPositions', 'player_positions']).map(readPlayerPositionFrame);
  const grenadePositions = pickArray(root, ['grenadePositions', 'grenade_positions']).map(readGrenadePositionFrame);
  const infernoPositions = pickArray(root, ['infernoPositions', 'inferno_positions']).map(readInfernoPositionFrame);

  const mapName = readString(root, ['mapName', 'map_name', 'map']) ?? 'unknown';
  const durationNs = readNumber(root, ['duration']);
  // Parser emits duration in nanoseconds. Convert to seconds.
  const duration = durationNs != null ? durationNs / 1_000_000_000 : 0;

  const winnerObj = root['winner'];
  const winnerName =
    isObject(winnerObj) ? readString(winnerObj, ['name']) : readString(root, ['winnerName', 'winner_name']);
  const winnerSide = isObject(winnerObj)
    ? (readNumber(winnerObj, ['currentSide', 'current_side']) as TeamSide | undefined)
    : (readNumber(root, ['winnerSide', 'winner_side']) as TeamSide | undefined);

  return {
    checksum: readString(root, ['checksum']),
    demoFilePath: readString(root, ['demoFilePath', 'demo_file_path']),
    mapName,
    game: readString(root, ['game']) as Match['game'],
    source: readString(root, ['source']),
    type: readString(root, ['type']) as Match['type'],
    tickrate: readNumber(root, ['tickrate']),
    frameRate: readNumber(root, ['frameRate', 'framerate', 'frame_rate']),
    duration,
    date: readMatchDate(root),
    serverName: readString(root, ['serverName', 'server_name']),
    clientName: readString(root, ['clientName', 'client_name']),
    shareCode: readString(root, ['shareCode', 'share_code']),
    maxRounds: readNumber(root, ['maxRounds', 'max_rounds']),
    winnerName,
    winnerSide,
    teamA,
    teamB,
    players,
    rounds: rounds.length ? rounds : undefined,
    kills: kills.length ? kills : undefined,
    clutches: clutches.length ? clutches : undefined,
    grenades: grenades.length ? grenades : undefined,
    playerBlinds: playerBlinds.length ? playerBlinds : undefined,
    shots: shots.length ? shots : undefined,
    damages: damages.length ? damages : undefined,
    bombsPlanted: bombsPlanted.length ? bombsPlanted : undefined,
    bombsDefused: bombsDefused.length ? bombsDefused : undefined,
    playerPositions: playerPositions.length ? playerPositions : undefined,
    grenadePositions: grenadePositions.length ? grenadePositions : undefined,
    infernoPositions: infernoPositions.length ? infernoPositions : undefined,
  };
}

function readPlayerPositionFrame(value: unknown): PlayerPositionFrame {
  if (!isObject(value)) return { steamId: '', x: 0, y: 0 };
  return {
    tick: readNumber(value, ['tick']),
    frame: readNumber(value, ['frame']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
    steamId: readSteamId(value, ['steamId', 'steamId64', 'steam_id', 'steam_id_64']),
    name: readString(value, ['name', 'playerName', 'player_name']),
    side: readNumber(value, ['side', 'teamSide', 'team_side']) as TeamSide | undefined,
    x: readNumber(value, ['x', 'X']) ?? 0,
    y: readNumber(value, ['y', 'Y']) ?? 0,
    z: readNumber(value, ['z', 'Z']),
    yaw: readNumber(value, ['yaw', 'Yaw']),
    isAlive: readBoolean(value, ['isAlive', 'is_alive']),
    health: readNumber(value, ['health']),
    armor: readNumber(value, ['armor']),
    hasHelmet: readBoolean(value, ['hasHelmet', 'has_helmet']),
    activeWeaponName: readString(value, ['activeWeaponName', 'active_weapon_name']),
    hasBomb: readBoolean(value, ['hasBomb', 'has_bomb']),
    hasDefuseKit: readBoolean(value, ['hasDefuseKit', 'has_defuse_kit']),
    flashDurationRemaining: readNumber(value, ['flashDurationRemaining', 'flash_duration_remaining']),
    money: readNumber(value, ['money']),
    isDucking: readBoolean(value, ['isDucking', 'is_ducking']),
    isScoping: readBoolean(value, ['isScoping', 'is_scoping']),
    isDefusing: readBoolean(value, ['isDefusing', 'is_defusing']),
    isPlanting: readBoolean(value, ['isPlanting', 'is_planting']),
  };
}

function readGrenadePositionFrame(value: unknown): GrenadePositionFrame {
  if (!isObject(value)) return { projectileId: '', x: 0, y: 0 };
  return {
    tick: readNumber(value, ['tick']),
    frame: readNumber(value, ['frame']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
    projectileId: readSteamId(value, ['projectileId', 'projectile_id']),
    grenadeId: readString(value, ['grenadeId', 'grenade_id']),
    grenadeName: readString(value, ['grenadeName', 'grenade_name', 'type', 'weaponName']),
    throwerSteamId: readSteamIdOptional(value, ['throwerSteamId', 'thrower_steam_id', 'throwerSteamID64']),
    throwerName: readString(value, ['throwerName', 'thrower_name']),
    throwerSide: readNumber(value, ['throwerSide', 'thrower_side']) as TeamSide | undefined,
    x: readNumber(value, ['x', 'X']) ?? 0,
    y: readNumber(value, ['y', 'Y']) ?? 0,
    z: readNumber(value, ['z', 'Z']),
  };
}

function readInfernoPositionFrame(value: unknown): InfernoPositionFrame {
  if (!isObject(value)) return { projectileId: '', x: 0, y: 0 };
  return {
    tick: readNumber(value, ['tick']),
    frame: readNumber(value, ['frame']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
    projectileId: readSteamId(value, ['projectileId', 'projectile_id']),
    x: readNumber(value, ['x', 'X']) ?? 0,
    y: readNumber(value, ['y', 'Y']) ?? 0,
    z: readNumber(value, ['z', 'Z']),
  };
}

function readTeam(value: unknown, fallbackLetter: 'A' | 'B'): Team {
  if (!isObject(value)) {
    return {
      name: `Team ${fallbackLetter}`,
      letter: fallbackLetter,
      score: 0,
      currentSide: fallbackLetter === 'A' ? 2 : 3,
    };
  }
  return {
    name: readString(value, ['name']) ?? `Team ${fallbackLetter}`,
    letter: (readString(value, ['letter']) as 'A' | 'B' | undefined) ?? fallbackLetter,
    score: readNumber(value, ['score']) ?? 0,
    currentSide: (readNumber(value, ['currentSide', 'current_side']) as TeamSide | undefined) ?? 2,
    scoreFirstHalf: readNumber(value, ['scoreFirstHalf', 'score_first_half']),
    scoreSecondHalf: readNumber(value, ['scoreSecondHalf', 'score_second_half']),
  };
}

/**
 * Normalize the `players` field to an array. The parser emits it as an
 * object keyed by steamId, which we use as the canonical steamId (the
 * numeric `steamId` inside each entry loses precision on 64-bit IDs).
 */
function readPlayers(value: unknown): MatchPlayer[] {
  if (Array.isArray(value)) {
    return value.map((v) => readPlayer(v, undefined));
  }
  if (isObject(value)) {
    return Object.entries(value).map(([key, v]) => readPlayer(v, key));
  }
  return [];
}

function readPlayer(value: unknown, steamIdFromKey: string | undefined): MatchPlayer {
  if (!isObject(value)) {
    throw new Error('Player entry is not an object.');
  }

  const teamObj = value['team'];
  const teamNameFromNested = isObject(teamObj) ? readString(teamObj, ['name']) : undefined;

  return {
    // Prefer the dict-key steamId (precision-safe) over the number inside.
    steamId: steamIdFromKey ?? readString(value, ['steamId', 'steam_id']) ?? stringifyNumber(value['steamId']) ?? '',
    name: readString(value, ['name']) ?? 'unknown',
    teamName: teamNameFromNested ?? readString(value, ['teamName', 'team_name']) ?? '',

    killCount: readNumber(value, ['killCount', 'kill_count', 'kills']) ?? 0,
    deathCount: readNumber(value, ['deathCount', 'death_count', 'deaths']) ?? 0,
    assistCount: readNumber(value, ['assistCount', 'assist_count', 'assists']) ?? 0,
    averageDamagePerRound:
      readNumber(value, ['averageDamagePerRound', 'average_damage_per_round', 'adr']) ?? 0,
    headshotPercentage: readNumber(value, ['headshotPercentage', 'headshotPercent', 'headshot_percentage']) ?? 0,
    mvpCount: readNumber(value, ['mvpCount', 'mvp_count', 'mvp']) ?? 0,
    firstKillCount: readNumber(value, ['firstKillCount', 'first_kill_count']) ?? 0,
    firstDeathCount: readNumber(value, ['firstDeathCount', 'first_death_count']),
    hltvRating: readNumber(value, ['hltvRating', 'hltv_rating']),
    hltvRating2: readNumber(value, ['hltvRating2', 'hltv_rating_2']),
    kast: readNumber(value, ['kast']),
    score: readNumber(value, ['score']),
    headshotCount: readNumber(value, ['headshotCount', 'headshot_count']),
    killDeathRatio: readNumber(value, ['killDeathRatio', 'kill_death_ratio']),
    damageHealth: readNumber(value, ['damageHealth', 'healthDamage', 'damage_health', 'health_damage']),
    damageArmor: readNumber(value, ['damageArmor', 'armorDamage', 'damage_armor', 'armor_damage']),
    utilityDamage: readNumber(value, ['utilityDamage', 'utility_damage']),
    averageUtilityDamagePerRound: readNumber(value, [
      'averageUtilityDamagePerRound',
      'utilityDamagePerRound',
      'average_utility_damage_per_round',
      'utility_damage_per_round',
    ]),
    tradeKillCount: readNumber(value, ['tradeKillCount', 'trade_kill_count']),
    tradeDeathCount: readNumber(value, ['tradeDeathCount', 'trade_death_count']),
    oneKillCount: readNumber(value, ['oneKillCount', 'one_kill_count']),
    twoKillCount: readNumber(value, ['twoKillCount', 'two_kill_count']),
    threeKillCount: readNumber(value, ['threeKillCount', 'three_kill_count']),
    fourKillCount: readNumber(value, ['fourKillCount', 'four_kill_count']),
    fiveKillCount: readNumber(value, ['fiveKillCount', 'five_kill_count']),
    collateralKillCount: readNumber(value, ['collateralKillCount', 'collateral_kill_count']),
    wallbangKillCount: readNumber(value, ['wallbangKillCount', 'wallbang_kill_count']),
    noScopeKillCount: readNumber(value, ['noScopeKillCount', 'no_scope_kill_count']),
    bombPlantedCount: readNumber(value, ['bombPlantedCount', 'bomb_planted_count']),
    bombDefusedCount: readNumber(value, ['bombDefusedCount', 'bomb_defused_count']),
    hostageRescuedCount: readNumber(value, ['hostageRescuedCount', 'hostage_rescued_count']),
    oneVsOneCount: readNumber(value, ['oneVsOneCount', 'one_vs_one_count', '1v1Count']),
    oneVsOneWonCount: readNumber(value, ['oneVsOneWonCount', 'one_vs_one_won_count', '1v1WonCount']),
    clutchCount: readNumber(value, ['clutchCount', 'clutch_count']),
    clutchWonCount: readNumber(value, ['clutchWonCount', 'clutch_won_count']),
    enemiesFlashedCount: readNumber(value, ['enemiesFlashedCount', 'enemies_flashed_count', 'enemyFlashedCount']),
    blindTimeInflicted: readNumber(value, [
      'blindTimeInflicted',
      'blind_time_inflicted',
      'enemiesFlashDuration',
      'enemies_flash_duration',
    ]),
    flashAssistCount: readNumber(value, ['flashAssistCount', 'flash_assist_count', 'flashAssistsCount']),
    smokeThrownCount: readNumber(value, ['smokeThrownCount', 'smoke_thrown_count', 'smokesThrownCount']),
    heThrownCount: readNumber(value, ['heThrownCount', 'he_thrown_count', 'heGrenadeThrownCount']),
    molotovThrownCount: readNumber(value, ['molotovThrownCount', 'molotov_thrown_count', 'molotovsThrownCount']),
    decoyThrownCount: readNumber(value, ['decoyThrownCount', 'decoy_thrown_count', 'decoysThrownCount']),
    flashThrownCount: readNumber(value, ['flashThrownCount', 'flash_thrown_count', 'flashesThrownCount']),
  };
}

function readRound(value: unknown): Round {
  if (!isObject(value)) return { number: 0 };
  const bombSiteRaw = readString(value, ['bombSite', 'bomb_site']);
  const bombSite = bombSiteRaw === 'A' || bombSiteRaw === 'B' ? bombSiteRaw : undefined;

  // `endReason` may be either a numeric enum (csda default) or a string
  // (cs-demo-manager DB ingest). Canonicalize to our round-flow vocabulary
  // here so downstream code doesn't need to care.
  const endReasonNum = readNumber(value, ['endReason', 'end_reason']);
  const endReasonStr = readString(value, ['endReason', 'end_reason']);
  const endReason = canonicalizeEndReason(endReasonNum, endReasonStr);

  return {
    number: readNumber(value, ['number']) ?? 0,
    startTick: readNumber(value, ['startTick', 'start_tick']),
    freezeTimeEndTick: readNumber(value, ['freezeTimeEndTick', 'freeze_time_end_tick']),
    endTick: readNumber(value, ['endTick', 'end_tick']),
    endOfficiallyTick: readNumber(value, ['endOfficiallyTick', 'end_officially_tick']),
    teamAScore: readNumber(value, ['teamAScore', 'team_a_score']),
    teamBScore: readNumber(value, ['teamBScore', 'team_b_score']),
    teamASide: readNumber(value, ['teamASide', 'team_a_side']) as TeamSide | undefined,
    teamBSide: readNumber(value, ['teamBSide', 'team_b_side']) as TeamSide | undefined,
    duration: readNumber(value, ['duration']),
    endReason,
    winnerTeamName: readString(value, ['winnerName', 'winnerTeamName', 'winner_team_name']),
    winnerSide: readNumber(value, ['winnerSide', 'winner_side']) as TeamSide | undefined,
    teamAStartMoney: readNumber(value, ['teamAStartMoney', 'team_a_start_money']),
    teamBStartMoney: readNumber(value, ['teamBStartMoney', 'team_b_start_money']),
    teamAEquipmentValue: readNumber(value, ['teamAEquipmentValue', 'team_a_equipment_value']),
    teamBEquipmentValue: readNumber(value, ['teamBEquipmentValue', 'team_b_equipment_value']),
    teamAEconomyType: readString(value, ['teamAEconomyType', 'team_a_economy_type']),
    teamBEconomyType: readString(value, ['teamBEconomyType', 'team_b_economy_type']),
    bombSite,
  };
}

// Maps the csda numeric round-end-reason enum (from sourcemod) to the
// canonical string vocabulary round-flow.ts understands. Values come from
// node_modules/@akiver/cs-demo-analyzer/dist/constants.d.ts :: RoundEndReason.
function canonicalizeEndReason(num: number | undefined, str: string | undefined): string | undefined {
  if (num !== undefined && Number.isFinite(num)) {
    switch (num) {
      case 1:
        return 'bomb_exploded';
      case 7:
        return 'bomb_defused';
      case 8:
        return 't_eliminated'; // CtWin → Ts were eliminated
      case 9:
        return 'ct_eliminated'; // TerroristWin → CTs were eliminated
      case 12:
        return 'time_ran_out'; // TargetSaved (time expired, no plant-defuse-or-elim)
      case 17:
      case 18:
        return 'surrender';
      default:
        return `raw:${num}`;
    }
  }
  return str;
}

function readKill(value: unknown) {
  if (!isObject(value)) {
    return {
      killerSteamId: '',
      killerName: '',
      killerSide: 2 as const,
      victimSteamId: '',
      victimName: '',
      victimSide: 2 as const,
    };
  }
  const penetratedObjects = readNumber(value, ['penetratedObjects', 'penetrated_objects']);
  return {
    killerSteamId: readSteamId(value, ['killerSteamId', 'killer_steam_id']),
    killerName: readString(value, ['killerName', 'killer_name']) ?? '',
    killerSide: (readNumber(value, ['killerSide', 'killer_side']) as TeamSide) ?? 2,
    victimSteamId: readSteamId(value, ['victimSteamId', 'victim_steam_id']),
    victimName: readString(value, ['victimName', 'victim_name']) ?? '',
    victimSide: (readNumber(value, ['victimSide', 'victim_side']) as TeamSide) ?? 2,
    assisterSteamId: readSteamIdOptional(value, ['assisterSteamId', 'assister_steam_id']),
    assisterName: readString(value, ['assisterName', 'assister_name']),
    weaponName: readString(value, ['weaponName', 'weapon_name']),
    isHeadshot: readBoolean(value, ['isHeadshot', 'is_headshot']),
    isTradeKill: readBoolean(value, ['isTradeKill', 'is_trade_kill']),
    isTradeDeath: readBoolean(value, ['isTradeDeath', 'is_trade_death']),
    isWallbang:
      readBoolean(value, ['isWallbang', 'is_wallbang']) ??
      (penetratedObjects !== undefined ? penetratedObjects > 0 : undefined),
    isNoScope: readBoolean(value, ['isNoScope', 'is_no_scope']),
    isThroughSmoke: readBoolean(value, ['isThroughSmoke', 'is_through_smoke', 'throughSmoke']),
    isKillerBlinded: readBoolean(value, ['isKillerBlinded', 'is_killer_blinded']),
    isVictimBlinded: readBoolean(value, ['isVictimBlinded', 'is_victim_blinded']),
    isAssistedFlash: readBoolean(value, ['isAssistedFlash', 'is_assisted_flash']),
    isFirstKill: readBoolean(value, ['isFirstKill', 'is_first_kill', 'isOpeningKill', 'is_opening_kill']),
    killerPosition:
      readPosition(value['killerPosition'] ?? value['killer_position']) ??
      readFlatPosition(value, 'killer'),
    victimPosition:
      readPosition(value['victimPosition'] ?? value['victim_position']) ??
      readFlatPosition(value, 'victim'),
    tick: readNumber(value, ['tick']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
  };
}

function readPosition(value: unknown): Position | undefined {
  if (!isObject(value)) return undefined;
  const x = readNumber(value, ['x', 'X']);
  const y = readNumber(value, ['y', 'Y']);
  const z = readNumber(value, ['z', 'Z']);
  if (x === undefined || y === undefined) return undefined;
  return { x, y, z: z ?? 0 };
}

/** Parser emits positions as flat `${prefix}X/Y/Z` fields, e.g. `killerX`. */
function readFlatPosition(
  obj: Record<string, unknown>,
  prefix: 'killer' | 'victim' | 'thrower' | 'flasher' | 'flashed',
): Position | undefined {
  const x = readNumber(obj, [`${prefix}X`, `${prefix}_x`]);
  const y = readNumber(obj, [`${prefix}Y`, `${prefix}_y`]);
  const z = readNumber(obj, [`${prefix}Z`, `${prefix}_z`]);
  if (x === undefined || y === undefined) return undefined;
  return { x, y, z: z ?? 0 };
}

/**
 * Read a steam ID that survives 64-bit precision. After `precisionSafeRewrite`,
 * steam IDs arrive as strings; we also handle legacy snake_case variants.
 * Returns '' (not undefined) so mandatory fields stay strings for the loader.
 */
function readSteamId(obj: Record<string, unknown>, keys: string[]): string {
  return readSteamIdOptional(obj, keys) ?? '';
}
function readSteamIdOptional(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() !== '' && v !== '0') return v;
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return String(v);
  }
  return undefined;
}

function readClutch(value: unknown): Clutch | null {
  if (!isObject(value)) return null;
  const clutcherSteamId = readSteamIdOptional(value, [
    'clutcherSteamId',
    'clutcher_steam_id',
    'playerSteamId',
    'player_steam_id',
    'steamId',
    'steam_id',
  ]);
  const opponentsCount = readNumber(value, [
    'opponentCount',
    'opponent_count',
    'opponentsCount',
    'opponents_count',
    'enemiesCount',
    'enemies_count',
  ]);
  const won = readBoolean(value, ['hasWon', 'has_won', 'won', 'isWon', 'is_won', 'success']);
  if (!clutcherSteamId || opponentsCount === undefined || won === undefined) return null;
  return {
    clutcherSteamId,
    opponentsCount,
    won,
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
    tick: readNumber(value, ['tick']),
  };
}

function readGrenade(value: unknown, fallbackType: string | undefined): Grenade {
  if (!isObject(value)) return fallbackType ? { type: fallbackType } : {};
  const position =
    readPosition(value['position'] ?? value['finalPosition'] ?? value['final_position']) ??
    readFlatPosition(value, 'thrower') ??
    (() => {
      // Projectile impact positions are on the event itself as flat x/y/z.
      const x = readNumber(value, ['x']);
      const y = readNumber(value, ['y']);
      const z = readNumber(value, ['z']);
      if (x === undefined || y === undefined) return undefined;
      return { x, y, z: z ?? 0 };
    })();
  return {
    type:
      readString(value, ['type', 'grenadeType', 'grenade_type', 'weaponName', 'weapon_name']) ??
      fallbackType,
    throwerSteamId: readSteamIdOptional(value, [
      'throwerSteamId',
      'thrower_steam_id',
      'playerSteamId',
      'player_steam_id',
    ]),
    throwerSide: readNumber(value, ['throwerSide', 'thrower_side', 'side']) as TeamSide | undefined,
    throwerName: readString(value, ['throwerName', 'thrower_name', 'playerName', 'player_name']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
    tick: readNumber(value, ['tick']),
    position,
  };
}

function readShot(value: unknown): Shot {
  if (!isObject(value)) {
    return { playerSteamId: '' };
  }
  return {
    playerSteamId: readSteamId(value, ['playerSteamId', 'player_steam_id', 'shooterSteamId', 'shooter_steam_id']),
    playerSide: readNumber(value, ['playerSide', 'player_side', 'side']) as TeamSide | undefined,
    weaponName: readString(value, ['weaponName', 'weapon_name', 'weapon']),
    tick: readNumber(value, ['tick']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
    velocityX: readNumber(value, ['playerVelocityX', 'velocityX', 'velocity_x']),
    velocityY: readNumber(value, ['playerVelocityY', 'velocityY', 'velocity_y']),
    velocityZ: readNumber(value, ['playerVelocityZ', 'velocityZ', 'velocity_z']),
    isPlayerControllingBot: readBoolean(value, ['isPlayerControllingBot', 'is_player_controlling_bot']),
  };
}

function readDamage(value: unknown): Damage {
  if (!isObject(value)) {
    return { attackerSteamId: '', victimSteamId: '' };
  }
  return {
    attackerSteamId: readSteamId(value, ['attackerSteamId', 'attacker_steam_id']),
    victimSteamId: readSteamId(value, ['victimSteamId', 'victim_steam_id']),
    weaponName: readString(value, ['weaponName', 'weapon_name']),
    hitgroup: readNumber(value, ['hitgroup', 'hit_group']),
    healthDamage: readNumber(value, ['healthDamage', 'health_damage', 'dmgHealth', 'dmg_health']),
    armorDamage: readNumber(value, ['armorDamage', 'armor_damage', 'dmgArmor', 'dmg_armor']),
    tick: readNumber(value, ['tick']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
  };
}

function readBombEvent(value: unknown): BombEvent {
  if (!isObject(value)) {
    return { playerSteamId: '' };
  }
  const siteRaw =
    readString(value, ['site', 'bombSite', 'bomb_site']) ??
    (readNumber(value, ['site', 'siteIndex']) === 0 ? 'A' : readNumber(value, ['site', 'siteIndex']) === 1 ? 'B' : undefined);
  const site = siteRaw === 'A' || siteRaw === 'B' ? siteRaw : undefined;
  return {
    playerSteamId: readSteamId(value, [
      'playerSteamId',
      'player_steam_id',
      'planterSteamId',
      'planter_steam_id',
      'defuserSteamId',
      'defuser_steam_id',
    ]),
    playerName: readString(value, ['playerName', 'player_name', 'planterName', 'defuserName']),
    site,
    tick: readNumber(value, ['tick']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
  };
}

function readPlayerBlind(value: unknown): PlayerBlind {
  if (!isObject(value)) return {};
  return {
    flasherSteamId: readSteamIdOptional(value, ['flasherSteamId', 'flasher_steam_id']),
    flashedSteamId: readSteamIdOptional(value, [
      'flashedSteamId',
      'flashed_steam_id',
      'victimSteamId',
      'victim_steam_id',
    ]),
    flasherSide: readNumber(value, ['flasherSide', 'flasher_side']) as TeamSide | undefined,
    flashedSide: readNumber(value, ['flashedSide', 'flashed_side']) as TeamSide | undefined,
    duration: readNumber(value, ['duration', 'blindDuration', 'blind_duration']),
    roundNumber: readNumber(value, ['roundNumber', 'round_number']),
    tick: readNumber(value, ['tick']),
  };
}

/**
 * Parser variants for the match-played timestamp. Prefer the most specific
 * field available. Rejects Go's zero-time sentinel ("0001-01-01T00:00:00Z")
 * and any unparseable value so the caller can fall back to demo file mtime.
 */
function readMatchDate(root: Record<string, unknown>): string | undefined {
  const candidates = [
    'matchStartDate',
    'match_start_date',
    'matchDate',
    'match_date',
    'startDate',
    'start_date',
    'dateMatch',
    'date',
  ];
  for (const key of candidates) {
    const raw = root[key];
    if (typeof raw !== 'string' || raw.trim() === '') continue;
    if (raw.startsWith('0001-01-01')) continue;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return raw;
  }
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickArray(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function readString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function readNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function readBoolean(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

function stringifyNumber(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim() !== '') return v;
  return undefined;
}

export { loadMatchFromJsonFolder as loadMatch };
