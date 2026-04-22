import type { Match, MatchPlayer, Kill, Damage, Round } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';
import { computeAim } from './aim.ts';
import { computeUtility } from './utility.ts';
import { computeClutchMulti } from './clutches.ts';
import { computeOpeningDuels } from './opening-duels.ts';

const HEAD_HITGROUP = 1;
const TOP_WEAPONS = 5;

export interface PlayerCardData {
  player: {
    name: string;
    steamId: string;
    teamName: string;
    teamLetter: 'A' | 'B';
    /** The side the player finished on (CT/T). 'MIXED' for aborted matches. */
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
    side: 'CT' | 'T' | null;
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
}

/**
 * Build a rich, player-centric data bundle for one SteamID. Reuses the
 * per-player aggregates that the match panels already compute and adds
 * insights that only make sense when focused on a single player: per-round
 * damage timeline, per-weapon accuracy slice, duel record vs each enemy,
 * and a "nemesis" — the enemy who killed the player most.
 *
 * Returns `null` if the player is not in the match.
 */
export function computePlayerCard(match: Match, steamId: string): PlayerCardData | null {
  const player = match.players.find((p) => p.steamId === steamId);
  if (!player) return null;

  const teamLetter: 'A' | 'B' = player.teamName === match.teamA.name ? 'A' : 'B';
  const team = teamLetter === 'A' ? match.teamA : match.teamB;
  const opponent = teamLetter === 'A' ? match.teamB : match.teamA;
  const finalSide: 'CT' | 'T' | 'MIXED' =
    team.currentSide === TEAM_SIDE_CT ? 'CT' : team.currentSide === TEAM_SIDE_T ? 'T' : 'MIXED';

  const kills = match.kills ?? [];
  const damages = match.damages ?? [];
  const rounds = match.rounds ?? [];
  const clutches = match.clutches ?? [];

  const killsByPlayer = kills.filter((k) => k.killerSteamId === steamId);
  const deathsOfPlayer = kills.filter((k) => k.victimSteamId === steamId);

  const result =
    match.teamA.score === match.teamB.score
      ? 'DRAW'
      : (match.teamA.score > match.teamB.score ? 'A' : 'B') === teamLetter
        ? 'WON'
        : 'LOST';

  // --- Openings (reuse computeOpeningDuels row) ---
  const openingRows = computeOpeningDuels(match);
  const openingRow = openingRows.find((r) => r.steamId === steamId);
  const openings = {
    wins: openingRow?.wins ?? 0,
    losses: openingRow?.losses ?? 0,
    winPct: openingRow ? round1(openingRow.successPct) : 0,
    entryFrags: player.firstKillCount ?? 0,
    firstDeaths: player.firstDeathCount ?? 0,
  };

  // --- Clutches + multi-kills (reuse computeClutchMulti row) ---
  const cmRows = computeClutchMulti(match);
  const cmRow = cmRows.find((r) => r.steamId === steamId);
  const clutchesBlock = {
    v1: cmRow?.v1 ?? { won: 0, att: 0 },
    v2: cmRow?.v2 ?? { won: 0, att: 0 },
    v3: cmRow?.v3 ?? { won: 0, att: 0 },
    v4: cmRow?.v4 ?? { won: 0, att: 0 },
    v5: cmRow?.v5 ?? { won: 0, att: 0 },
  };
  const multiKills = {
    k1: player.oneKillCount ?? 0,
    k2: player.twoKillCount ?? 0,
    k3: player.threeKillCount ?? 0,
    k4: player.fourKillCount ?? 0,
    ace: player.fiveKillCount ?? 0,
  };

  // --- Per-round impact ---
  const roundsOut = buildRoundImpact(rounds, kills, damages, clutches, steamId, teamLetter);

  // --- Weapons: kills + hit%/HS% slice per weapon ---
  const weapons = buildWeaponRows(kills, damages, steamId);

  // --- Aim (reuse) ---
  const aimPanel = computeAim(match);
  const aimRow = aimPanel.rows.find((r) => r.steamId === steamId);
  const aim = {
    hitPct: aimRow?.hitPct ?? 0,
    hsAcc: aimRow?.hsAcc ?? 0,
    sprayAcc: aimRow?.sprayAcc ?? 0,
    tapAcc: aimRow?.tapAcc ?? 0,
    movingPct: aimRow?.movingPct ?? 0,
    avgDist: aimRow?.avgDist ?? 0,
  };

  // --- Utility (reuse) ---
  const utilRows = computeUtility(match);
  const utilRow = utilRows.find((r) => r.steamId === steamId);
  const utility = {
    heDmg: utilRow?.heDamage ?? 0,
    flashAssists: utilRow?.flashAssists ?? 0,
    enemiesFlashed: utilRow?.enemiesFlashed ?? 0,
    blindTime: utilRow?.blindTime ?? 0,
    smokes: utilRow?.smokes ?? 0,
  };

  // --- Specials (novelty kills by this player) ---
  const specials = {
    wallbangs: killsByPlayer.filter((k) => k.isWallbang).length,
    noscopes: killsByPlayer.filter((k) => k.isNoScope).length,
    throughSmoke: killsByPlayer.filter((k) => k.isThroughSmoke).length,
    blindKills: killsByPlayer.filter((k) => k.isKillerBlinded).length,
    flashKills: killsByPlayer.filter((k) => k.isAssistedFlash).length,
  };

  // --- Duel record vs each opponent ---
  const enemyPlayers = match.players.filter((p) => p.teamName === opponent.name);
  const duelsVsEnemies = enemyPlayers
    .map((enemy) => ({
      enemyName: enemy.name,
      kills: kills.filter((k) => k.killerSteamId === steamId && k.victimSteamId === enemy.steamId)
        .length,
      deaths: kills.filter((k) => k.killerSteamId === enemy.steamId && k.victimSteamId === steamId)
        .length,
    }))
    .sort((a, b) => b.kills - a.kills || b.deaths - a.deaths);

  // --- Death analysis ---
  const deathsBlock = buildDeathAnalysis(deathsOfPlayer, player, enemyPlayers);

  return {
    player: {
      name: player.name,
      steamId: player.steamId,
      teamName: player.teamName,
      teamLetter,
      finalSide,
    },
    match: {
      mapName: match.mapName,
      mapPretty: prettyMap(match.mapName),
      scoreA: match.teamA.score,
      scoreB: match.teamB.score,
      teamAName: match.teamA.name,
      teamBName: match.teamB.name,
      result,
      date: formatDate(match.date),
      durationLabel: formatDuration(match.duration),
    },
    headline: {
      kills: player.killCount,
      deaths: player.deathCount,
      assists: player.assistCount,
      adr: round1(player.averageDamagePerRound),
      rating: round2(player.hltvRating2 ?? player.hltvRating ?? 0),
      hsPct: round1(player.headshotPercentage),
      kast: round1(player.kast ?? 0),
      mvps: player.mvpCount ?? 0,
    },
    openings,
    clutches: clutchesBlock,
    multiKills,
    rounds: roundsOut,
    weapons,
    aim,
    utility,
    specials,
    duelsVsEnemies,
    deaths: deathsBlock,
  };
}

function buildRoundImpact(
  rounds: Round[],
  kills: Kill[],
  damages: Damage[],
  clutches: { clutcherSteamId: string; won: boolean; roundNumber?: number }[],
  steamId: string,
  teamLetter: 'A' | 'B',
): PlayerCardData['rounds'] {
  // Aggregate damage dealt per round by this player.
  const dmgByRound = new Map<number, number>();
  for (const d of damages) {
    if (d.attackerSteamId !== steamId) continue;
    if (d.roundNumber === undefined) continue;
    dmgByRound.set(d.roundNumber, (dmgByRound.get(d.roundNumber) ?? 0) + (d.healthDamage ?? 0));
  }

  // Kills per round + first-kill + multi-kill flags.
  const killsByRound = new Map<number, Kill[]>();
  for (const k of kills) {
    if (k.killerSteamId !== steamId) continue;
    if (k.roundNumber === undefined) continue;
    let list = killsByRound.get(k.roundNumber);
    if (!list) {
      list = [];
      killsByRound.set(k.roundNumber, list);
    }
    list.push(k);
  }

  // Clutch-won rounds for this player.
  const clutchWonRounds = new Set<number>();
  for (const c of clutches) {
    if (c.clutcherSteamId !== steamId) continue;
    if (!c.won) continue;
    if (c.roundNumber !== undefined) clutchWonRounds.add(c.roundNumber);
  }

  const out: PlayerCardData['rounds'] = [];
  // Walk match rounds in order so the chart reflects real round count even
  // in rounds where this player had no activity.
  for (const r of rounds) {
    if (r.number === undefined || r.number === null) continue;
    const n = r.number;
    const roundKills = killsByRound.get(n) ?? [];
    const dmg = dmgByRound.get(n) ?? 0;
    const playerSide: 'CT' | 'T' | null =
      teamLetter === 'A'
        ? r.teamASide === TEAM_SIDE_CT
          ? 'CT'
          : r.teamASide === TEAM_SIDE_T
            ? 'T'
            : null
        : r.teamBSide === TEAM_SIDE_CT
          ? 'CT'
          : r.teamBSide === TEAM_SIDE_T
            ? 'T'
            : null;
    const winnerSide: 'CT' | 'T' | null =
      r.winnerSide === TEAM_SIDE_CT ? 'CT' : r.winnerSide === TEAM_SIDE_T ? 'T' : null;
    const won = winnerSide !== null && playerSide !== null && winnerSide === playerSide;

    out.push({
      n,
      damage: Math.round(dmg),
      won,
      hadKill: roundKills.length > 0,
      isClutch: clutchWonRounds.has(n),
      isFirstKill: roundKills.some((k) => k.isFirstKill),
      isMultiKill: roundKills.length >= 3,
      side: playerSide,
    });
  }

  return out;
}

function buildWeaponRows(
  kills: Kill[],
  damages: Damage[],
  steamId: string,
): PlayerCardData['weapons'] {
  const killsByWeapon = new Map<string, { total: number; hs: number }>();
  for (const k of kills) {
    if (k.killerSteamId !== steamId) continue;
    const w = (k.weaponName ?? '').trim();
    if (!w) continue;
    let rec = killsByWeapon.get(w);
    if (!rec) {
      rec = { total: 0, hs: 0 };
      killsByWeapon.set(w, rec);
    }
    rec.total += 1;
    if (k.isHeadshot) rec.hs += 1;
  }

  // Hit% per weapon needs shot counts we don't track here, but HS% of landed
  // hits is a good proxy: HS damage events / all damage events for that weapon.
  // We also approximate hit rate as damage-events-per-kill (not a true
  // accuracy, but a consistent "how clean was this weapon for me" proxy).
  const dmgByWeapon = new Map<string, { total: number; hs: number }>();
  for (const d of damages) {
    if (d.attackerSteamId !== steamId) continue;
    const w = (d.weaponName ?? '').trim();
    if (!w) continue;
    let rec = dmgByWeapon.get(w);
    if (!rec) {
      rec = { total: 0, hs: 0 };
      dmgByWeapon.set(w, rec);
    }
    rec.total += 1;
    if (d.hitgroup === HEAD_HITGROUP) rec.hs += 1;
  }

  const rows = [...killsByWeapon.entries()].map(([name, k]) => {
    const dmg = dmgByWeapon.get(name);
    const hitPct = dmg && dmg.total > 0 ? round1((dmg.hs / dmg.total) * 100) : 0;
    const hsPct = k.total > 0 ? round1((k.hs / k.total) * 100) : 0;
    return { name, kills: k.total, hitPct, hsPct };
  });

  rows.sort((a, b) => b.kills - a.kills);
  return rows.slice(0, TOP_WEAPONS);
}

function buildDeathAnalysis(
  deathsOfPlayer: Kill[],
  player: MatchPlayer,
  enemyPlayers: MatchPlayer[],
): PlayerCardData['deaths'] {
  const byKiller = new Map<string, { name: string; count: number; weapons: Map<string, number> }>();
  for (const k of deathsOfPlayer) {
    const id = k.killerSteamId;
    if (!id) continue;
    let rec = byKiller.get(id);
    if (!rec) {
      const enemy = enemyPlayers.find((p) => p.steamId === id);
      rec = { name: enemy?.name ?? k.killerName ?? 'Unknown', count: 0, weapons: new Map() };
      byKiller.set(id, rec);
    }
    rec.count += 1;
    const w = (k.weaponName ?? '').trim();
    if (w) rec.weapons.set(w, (rec.weapons.get(w) ?? 0) + 1);
  }

  let nemesis: { name: string; count: number; weapon: string | null } | null = null;
  for (const rec of byKiller.values()) {
    if (!nemesis || rec.count > nemesis.count) {
      const topWeapon = [...rec.weapons.entries()].sort((a, b) => b[1] - a[1])[0];
      nemesis = { name: rec.name, count: rec.count, weapon: topWeapon ? topWeapon[0] : null };
    }
  }

  const firstDeaths = player.firstDeathCount ?? 0;
  const tradedDeaths = player.tradeDeathCount ?? 0;
  const blindedDeaths = deathsOfPlayer.filter((k) => k.isVictimBlinded).length;

  return {
    nemesisName: nemesis?.name ?? null,
    nemesisDeaths: nemesis?.count ?? 0,
    nemesisWeapon: nemesis?.weapon ?? null,
    firstDeaths,
    tradedDeaths,
    totalDeaths: player.deathCount,
    blindedDeaths,
  };
}

function prettyMap(mapName: string): string {
  return mapName.replace(/^de_/, '').replace(/^cs_/, '').replace(/^ar_/, '');
}

function formatDate(raw: string | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
