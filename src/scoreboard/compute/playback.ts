import type { Match, Grenade } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

/**
 * Per-round playback payload for the 2D Round Viewer.
 *
 * Important: true per-tick player position tracks are not exposed by the
 * @akiver/cs-demo-analyzer JSON export we load today (load-match.ts only
 * pulls kill positions + grenade landing positions). This module provides
 * a useful subset:
 *  - `deaths` with killer/victim positions (actual world coords)
 *  - `grenades` with thrower+landing positions
 *  - `flashes` enriched with victim identity
 *  - `tracks` SYNTHESIZED as way-points along each player's known positions
 *    in the round (their kills and deaths). The viewer will interpolate
 *    linearly between way-points. If a player never appears in a kill/death
 *    event for the round, they get a static placeholder at spawn-ish coords.
 *
 * World coords pass through unchanged; the radar transform is a client-side
 * concern (see web/src/lib/radar.ts).
 */

export interface PlaybackPoint {
  t: number;
  x: number;
  y: number;
  z?: number;
}

export interface PlaybackTrack {
  name: string;
  side: 'CT' | 'T';
  team: 'A' | 'B';
  points: PlaybackPoint[];
}

export interface PlaybackDeath {
  t: number;
  killer: string;
  killerSide: 'CT' | 'T';
  victim: string;
  victimSide: 'CT' | 'T';
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
  throwerSide: 'CT' | 'T';
  type: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface PlaybackFlash {
  grenadeId: string;
  thrower: string;
  throwerSide: 'CT' | 'T';
  victim: string;
  victimSide: 'CT' | 'T';
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
  killerSide?: 'CT' | 'T';
  victimSide?: 'CT' | 'T';
}

export interface PlaybackRound {
  n: number;
  winner: 'CT' | 'T';
  halftime?: boolean;
  endReason: string;
  duration: number;
  bomb: { planted: boolean; site?: 'A' | 'B'; defused?: boolean };
  bombPlantT: number | null;
  bombDefuseT: number | null;
  tracks: PlaybackTrack[];
  deaths: PlaybackDeath[];
  grenades: PlaybackGrenade[];
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
  rounds: PlaybackRound[];
}

const TICK_DEFAULT = 64;

function sideOf(s: number | undefined): 'CT' | 'T' {
  return s === TEAM_SIDE_CT ? 'CT' : s === TEAM_SIDE_T ? 'T' : 'T';
}

function canonicalEcon(raw: string | undefined): string {
  if (!raw) return 'full';
  const s = raw.toLowerCase();
  if (s.includes('pistol')) return 'pistol';
  if (s.includes('eco')) return 'eco';
  if (s.includes('force') || s.includes('semi')) return 'force';
  return 'full';
}

function prettyEndReason(raw: string | undefined): string {
  if (!raw) return 'Eliminated';
  const s = raw.toLowerCase();
  if (s.includes('bomb') && (s.includes('explod') || s.includes('detonat'))) return 'Bomb detonated';
  if (s.includes('defus')) return 'Bomb defused';
  if (s.includes('time')) return 'Time ran out';
  return 'Eliminated';
}

export function computePlayback(match: Match): PlaybackData {
  const rounds = match.rounds ?? [];
  if (rounds.length === 0) return { tickrate: match.tickrate ?? TICK_DEFAULT, rounds: [] };

  const tickrate = match.tickrate && match.tickrate > 0 ? match.tickrate : TICK_DEFAULT;
  const bySteam = new Map<string, { name: string; team: 'A' | 'B' }>();
  for (const p of match.players) {
    bySteam.set(p.steamId, {
      name: p.name,
      team: p.teamName === match.teamA.name ? 'A' : 'B',
    });
  }

  const grenades = match.grenades ?? [];
  const blinds = match.playerBlinds ?? [];
  const kills = match.kills ?? [];
  const bombsPlanted = match.bombsPlanted ?? [];
  const bombsDefused = match.bombsDefused ?? [];

  return {
    tickrate,
    rounds: rounds.map((r, idx) => {
      const n = r.number || idx + 1;
      const startTick = r.startTick ?? 0;
      const duration = r.duration ?? 0;
      const relT = (tick: number | undefined): number =>
        tick !== undefined && startTick ? Math.max(0, (tick - startTick) / tickrate) : 0;

      const rKills = kills.filter((k) => k.roundNumber === n).slice().sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

      // Determine sides per round
      const roundSide = (rawSide: number | undefined, team: 'A' | 'B'): 'CT' | 'T' => {
        const teamSide = team === 'A' ? r.teamASide : r.teamBSide;
        return sideOf(teamSide ?? rawSide);
      };

      const deaths: PlaybackDeath[] = rKills.map((k, ki) => ({
        t: relT(k.tick),
        killer: k.killerName,
        killerSide: sideOf(k.killerSide),
        victim: k.victimName,
        victimSide: sideOf(k.victimSide),
        weapon: k.weaponName ?? '',
        headshot: !!k.isHeadshot,
        wallbang: !!k.isWallbang,
        firstKill: ki === 0,
        killerPos: { x: k.killerPosition?.x ?? 0, y: k.killerPosition?.y ?? 0 },
        victimPos: { x: k.victimPosition?.x ?? 0, y: k.victimPosition?.y ?? 0 },
      }));

      const rGren: Grenade[] = grenades.filter((g) => g.roundNumber === n);
      const playbackGren: PlaybackGrenade[] = rGren.map((g, gi) => ({
        id: `r${n}g${gi}`,
        t: relT(g.tick),
        thrower: g.throwerName ?? 'unknown',
        throwerSide: sideOf(g.throwerSide),
        type: g.type ?? 'unknown',
        from: { x: g.position?.x ?? 0, y: g.position?.y ?? 0 },
        to: { x: g.position?.x ?? 0, y: g.position?.y ?? 0 },
      }));

      const rBlinds = blinds.filter((b) => b.roundNumber === n);
      const flashes: PlaybackFlash[] = rBlinds.map((b, fi) => {
        const thrower = b.flasherSteamId ? bySteam.get(b.flasherSteamId) : undefined;
        const victim = b.flashedSteamId ? bySteam.get(b.flashedSteamId) : undefined;
        const throwerSide = sideOf(b.flasherSide);
        const victimSide = sideOf(b.flashedSide);
        return {
          grenadeId: `r${n}b${fi}`,
          thrower: thrower?.name ?? 'unknown',
          throwerSide,
          victim: victim?.name ?? 'unknown',
          victimSide,
          duration: b.duration ?? 0,
          teamFlash: throwerSide === victimSide,
        };
      });

      // Build synthesized tracks from kill events (waypoints with time)
      const tracks: PlaybackTrack[] = match.players.map((p) => {
        const team: 'A' | 'B' = p.teamName === match.teamA.name ? 'A' : 'B';
        const side = roundSide(undefined, team);
        const points: PlaybackPoint[] = [];

        // Starting position: try to find player's earliest appearance
        for (const k of rKills) {
          if (k.killerName === p.name && k.killerPosition) {
            points.push({ t: relT(k.tick), x: k.killerPosition.x, y: k.killerPosition.y });
          }
          if (k.victimName === p.name && k.victimPosition) {
            points.push({ t: relT(k.tick), x: k.victimPosition.x, y: k.victimPosition.y });
          }
        }

        // Dedupe sort
        points.sort((a, b) => a.t - b.t);

        return { name: p.name, side, team, points };
      });

      const plant = bombsPlanted.find((b) => b.roundNumber === n);
      const defuse = bombsDefused.find((b) => b.roundNumber === n);
      const bombPlantT = plant ? relT(plant.tick) : null;
      const bombDefuseT = defuse ? relT(defuse.tick) : null;

      // Timeline events
      const events: PlaybackEvent[] = [
        { t: 0, kind: 'freeze-start', label: 'FREEZETIME' },
        { t: 7, kind: 'round-start', label: 'ROUND START' },
      ];
      for (const d of deaths) {
        events.push({
          t: d.t,
          kind: 'kill',
          label: `${d.killer} → ${d.victim}`,
          killer: d.killer,
          victim: d.victim,
          weapon: d.weapon,
          hs: d.headshot,
          killerSide: d.killerSide,
          victimSide: d.victimSide,
        });
      }
      if (bombPlantT !== null) {
        events.push({ t: bombPlantT, kind: 'plant', label: `BOMB PLANTED · ${plant?.site ?? ''}` });
      }
      if (bombDefuseT !== null) {
        events.push({ t: bombDefuseT, kind: 'defuse', label: 'BOMB DEFUSED' });
      }
      events.push({ t: duration, kind: 'end', label: prettyEndReason(r.endReason).toUpperCase() });
      events.sort((a, b) => a.t - b.t);

      const damageDealt: Record<string, number> = {};
      for (const p of match.players) damageDealt[p.name] = 0;

      return {
        n,
        winner: sideOf(r.winnerSide),
        halftime: undefined,
        endReason: prettyEndReason(r.endReason),
        duration,
        bomb: { planted: !!plant, site: plant?.site ?? r.bombSite, defused: !!defuse },
        bombPlantT,
        bombDefuseT,
        tracks,
        deaths,
        grenades: playbackGren,
        flashes,
        events,
        eqA: r.teamAEquipmentValue ?? 0,
        eqB: r.teamBEquipmentValue ?? 0,
        econA: canonicalEcon(r.teamAEconomyType),
        econB: canonicalEcon(r.teamBEconomyType),
        damageDealt,
      };
    }),
  };
}
