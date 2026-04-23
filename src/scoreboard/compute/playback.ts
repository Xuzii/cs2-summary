import type {
  Grenade,
  GrenadePositionFrame,
  InfernoPositionFrame,
  Match,
  PlayerPositionFrame,
} from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

/**
 * Per-round playback payload for the 2D Round Viewer.
 *
 * When the demo was parsed with `-positions` (INCLUDE_POSITIONS=true), csda
 * emits three per-frame arrays we decimate here:
 *   - `match.playerPositions`  → 10 entries per frame (one per alive player)
 *   - `match.grenadePositions` → one entry per in-flight projectile per frame
 *   - `match.infernoPositions` → one entry per fire particle per frame
 *
 * At 64-tick that's ~640 player-position entries and tens of thousands of
 * total rows per second of demo. Shipping those straight to the browser is
 * untenable, so we decimate to **8Hz** (every `tickrate/8` ticks) — enough
 * for smooth 2D playback, matches cs-demo-manager's viewer cadence, keeps
 * the per-match JSON safely under GitHub Pages' 100MB/file limit.
 *
 * When positions are absent, we fall back to the old behavior: waypoint-only
 * tracks synthesized from kill/death events (effectively 0-2 points per
 * player per round) — the viewer still renders, it just teleports between
 * known positions.
 */

export interface PlaybackPoint {
  t: number;
  x: number;
  y: number;
  z?: number;
  /** Present only when the sample came from true per-tick data. */
  health?: number;
  isAlive?: boolean;
  hasBomb?: boolean;
  yaw?: number;
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

/**
 * Landing-position summary for a grenade. Kept for back-compat with the
 * Grenade Finder page which renders from/to lines; the per-tick arc lives
 * separately in `trajectories` so the Finder can opt in without migrating.
 */
export interface PlaybackGrenade {
  id: string;
  t: number;
  thrower: string;
  throwerSide: 'CT' | 'T';
  type: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Full flight arc of a single projectile, sampled at 8Hz. `points[0]` is
 * the throw, `points[points.length-1]` is the landing. `t` is round-relative
 * seconds matching the viewer's scrubber.
 */
export interface PlaybackGrenadeTrajectory {
  id: string;
  projectileId: string;
  type: string;
  thrower: string;
  throwerSide: 'CT' | 'T';
  tStart: number;
  tEnd: number;
  points: Array<{ t: number; x: number; y: number; z?: number }>;
}

/**
 * Area-of-effect overlay the viewer renders while the effect is live:
 *   - smoke    → 18s cloud at landing pos
 *   - molotov  → ~7s fire centroid (avg of inferno particle positions)
 *   - flash    → 0.15s burst at landing pos (actual blind durations per
 *                victim are shown in the sidebar separately)
 */
export interface PlaybackEffect {
  kind: 'smoke' | 'molotov' | 'flash';
  projectileId: string;
  at: { x: number; y: number };
  tStart: number;
  tEnd: number;
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
  /**
   * Seconds from round start to the moment freeze time ends (players can
   * move). Derived from csda's `freezeTimeEndTick`; falls back to the first
   * timestamp where position data shows any player moving.
   */
  freezetimeEndT: number;
  bomb: { planted: boolean; site?: 'A' | 'B'; defused?: boolean };
  bombPlantT: number | null;
  bombDefuseT: number | null;
  tracks: PlaybackTrack[];
  deaths: PlaybackDeath[];
  grenades: PlaybackGrenade[];
  trajectories: PlaybackGrenadeTrajectory[];
  effects: PlaybackEffect[];
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
  /** Effective sample rate of per-tick tracks/trajectories, in Hz. */
  sampleHz: number;
  rounds: PlaybackRound[];
}

const TICK_DEFAULT = 64;
const TARGET_HZ = 8;
const SMOKE_LIFETIME_SEC = 18;
const MOLOTOV_LIFETIME_SEC = 7;
const FLASH_BURST_SEC = 0.15;

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

function normalizeGrenadeType(raw: string | undefined): string {
  if (!raw) return 'unknown';
  const s = raw.toLowerCase();
  if (s.includes('smoke')) return 'smoke';
  if (s.includes('flash')) return 'flash';
  if (s.includes('he') || s === 'hegrenade') return 'he';
  if (s.includes('molot') || s.includes('inc') || s === 'incgrenade') return 'molotov';
  if (s.includes('decoy')) return 'decoy';
  return s;
}

export function computePlayback(match: Match): PlaybackData {
  const rounds = match.rounds ?? [];
  if (rounds.length === 0) return { tickrate: match.tickrate ?? TICK_DEFAULT, sampleHz: TARGET_HZ, rounds: [] };

  const tickrate = match.tickrate && match.tickrate > 0 ? match.tickrate : TICK_DEFAULT;
  const stride = Math.max(1, Math.round(tickrate / TARGET_HZ));
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
  const playerPositions = match.playerPositions ?? [];
  const grenadePositions = match.grenadePositions ?? [];
  const infernoPositions = match.infernoPositions ?? [];

  // Index per-round for O(1) bucketed access. roundNumber on each frame is
  // authoritative; we fall back to startTick window only if it's missing.
  const playerFramesByRound = bucketBy(playerPositions, (f) => f.roundNumber);
  const grenadeFramesByRound = bucketBy(grenadePositions, (f) => f.roundNumber);
  const infernoFramesByRound = bucketBy(infernoPositions, (f) => f.roundNumber);

  return {
    tickrate,
    sampleHz: TARGET_HZ,
    rounds: rounds.map((r, idx) => {
      const n = r.number || idx + 1;
      const startTick = r.startTick ?? 0;
      const rawDuration = r.duration ?? 0;
      // csda emits round.duration in milliseconds; normalise to seconds so
      // every timestamp in the PlaybackRound shares one unit system. Older
      // exports sometimes omit duration — fall back to tick span.
      const durationFromTicks = r.endTick !== undefined && startTick
        ? Math.max(0, (r.endTick - startTick) / tickrate)
        : 0;
      const durationSec = rawDuration > 300 ? rawDuration / 1000
        : rawDuration > 0 ? rawDuration
        : durationFromTicks;
      const relT = (tick: number | undefined): number =>
        tick !== undefined && startTick ? Math.max(0, (tick - startTick) / tickrate) : 0;

      const rKills = kills.filter((k) => k.roundNumber === n).slice().sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

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
        type: normalizeGrenadeType(g.type),
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

      // Determine side per team for THIS round (teams swap at halftime).
      const aSide = sideOf(r.teamASide);
      const bSide = sideOf(r.teamBSide);

      // Tracks: decimated per-tick when position frames are available, else
      // fall back to waypoint synthesis from kills/deaths.
      const tracks: PlaybackTrack[] = buildTracks({
        match,
        startTick,
        tickrate,
        stride,
        playerFrames: playerFramesByRound.get(n) ?? [],
        rKills,
        relT,
        aSide,
        bSide,
      });

      // Trajectories: one entry per projectileId, sampled at 8Hz.
      const trajectories = buildTrajectories({
        roundNumber: n,
        startTick,
        tickrate,
        stride,
        frames: grenadeFramesByRound.get(n) ?? [],
      });

      // Effects: smoke / molotov / flash overlays the viewer can render by time.
      const effects = buildEffects({
        startTick,
        tickrate,
        trajectories,
        playbackGren,
        infernoFrames: infernoFramesByRound.get(n) ?? [],
      });

      // Freeze-time end: prefer csda's `freezeTimeEndTick` (authoritative).
      // Fallback: first tick where any player's (x,y) diverges from their
      // frame-0 position — keeps older exports without the field working.
      let freezetimeEndT =
        r.freezeTimeEndTick !== undefined && startTick
          ? Math.max(0, (r.freezeTimeEndTick - startTick) / tickrate)
          : 0;
      if (freezetimeEndT === 0 && tracks.length > 0) {
        let firstMoveT = Number.POSITIVE_INFINITY;
        for (const trk of tracks) {
          const pts = trk.points;
          if (pts.length < 2) continue;
          const x0 = pts[0]!.x;
          const y0 = pts[0]!.y;
          for (let i = 1; i < pts.length; i++) {
            if (Math.abs(pts[i]!.x - x0) > 1 || Math.abs(pts[i]!.y - y0) > 1) {
              if (pts[i]!.t < firstMoveT) firstMoveT = pts[i]!.t;
              break;
            }
          }
        }
        if (Number.isFinite(firstMoveT)) freezetimeEndT = firstMoveT;
      }

      // Extend the effective duration to cover the full position capture
      // window. csda samples positions through `endOfficiallyTick` (~7s past
      // `endTick`); if the viewer's scrubber clamps at the shorter `duration`,
      // trailing movement after the round officially ends goes unseen.
      let effectiveDuration = durationSec;
      const maxPointT = Math.max(
        0,
        ...tracks.flatMap((t) => t.points.map((p) => p.t ?? 0)),
      );
      if (maxPointT > effectiveDuration) effectiveDuration = maxPointT;

      const plant = bombsPlanted.find((b) => b.roundNumber === n);
      const defuse = bombsDefused.find((b) => b.roundNumber === n);
      const bombPlantT = plant ? relT(plant.tick) : null;
      const bombDefuseT = defuse ? relT(defuse.tick) : null;

      const events: PlaybackEvent[] = [
        { t: 0, kind: 'freeze-start', label: 'FREEZETIME' },
        { t: freezetimeEndT, kind: 'round-start', label: 'ROUND START' },
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
      events.push({ t: effectiveDuration, kind: 'end', label: prettyEndReason(r.endReason).toUpperCase() });
      events.sort((a, b) => a.t - b.t);

      const damageDealt: Record<string, number> = {};
      for (const p of match.players) damageDealt[p.name] = 0;

      return {
        n,
        winner: sideOf(r.winnerSide),
        halftime: undefined,
        endReason: prettyEndReason(r.endReason),
        duration: effectiveDuration,
        freezetimeEndT,
        bomb: { planted: !!plant, site: plant?.site ?? r.bombSite, defused: !!defuse },
        bombPlantT,
        bombDefuseT,
        tracks,
        deaths,
        grenades: playbackGren,
        trajectories,
        effects,
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

function bucketBy<T>(list: T[], keyFn: (t: T) => number | undefined): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of list) {
    const k = keyFn(item);
    if (k === undefined) continue;
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

interface BuildTracksOpts {
  match: Match;
  startTick: number;
  tickrate: number;
  stride: number;
  playerFrames: PlayerPositionFrame[];
  rKills: NonNullable<Match['kills']>;
  relT: (tick: number | undefined) => number;
  aSide: 'CT' | 'T';
  bSide: 'CT' | 'T';
}

function buildTracks(opts: BuildTracksOpts): PlaybackTrack[] {
  const { match, startTick, tickrate, stride, playerFrames, rKills, relT, aSide, bSide } = opts;

  const teamOf = (p: Match['players'][number]): 'A' | 'B' =>
    p.teamName === match.teamA.name ? 'A' : 'B';
  const sideFor = (team: 'A' | 'B'): 'CT' | 'T' => (team === 'A' ? aSide : bSide);

  if (playerFrames.length > 0) {
    // Per-tick data is authoritative. Bucket by steam id, decimate by stride.
    const bySteam = new Map<string, PlayerPositionFrame[]>();
    for (const f of playerFrames) {
      if (!f.steamId || f.tick === undefined) continue;
      const arr = bySteam.get(f.steamId);
      if (arr) arr.push(f);
      else bySteam.set(f.steamId, [f]);
    }
    for (const arr of bySteam.values()) arr.sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

    return match.players.map((p) => {
      const team = teamOf(p);
      const frames = bySteam.get(p.steamId) ?? [];
      // Prefer side from the first frame of this round (authoritative at
      // that tick); fall back to the Round's side mapping so the track
      // renders in the right color even if the player never spawned.
      const firstFrameSide = frames[0] ? sideOf(frames[0].side) : undefined;
      const side: 'CT' | 'T' = firstFrameSide ?? sideFor(team);

      const points: PlaybackPoint[] = [];
      for (const f of frames) {
        const tick = f.tick ?? 0;
        if ((tick - startTick) % stride !== 0) continue;
        points.push({
          t: Math.max(0, (tick - startTick) / tickrate),
          x: f.x,
          y: f.y,
          z: f.z,
          health: f.health,
          isAlive: f.isAlive,
          hasBomb: f.hasBomb,
          yaw: f.yaw,
        });
      }
      return { name: p.name, side, team, points };
    });
  }

  // Fallback: synthesize waypoints from this player's kills/deaths.
  return match.players.map((p) => {
    const team = teamOf(p);
    const points: PlaybackPoint[] = [];
    for (const k of rKills) {
      if (k.killerName === p.name && k.killerPosition) {
        points.push({ t: relT(k.tick), x: k.killerPosition.x, y: k.killerPosition.y });
      }
      if (k.victimName === p.name && k.victimPosition) {
        points.push({ t: relT(k.tick), x: k.victimPosition.x, y: k.victimPosition.y });
      }
    }
    points.sort((a, b) => a.t - b.t);
    return { name: p.name, side: sideFor(team), team, points };
  });
}

interface BuildTrajectoriesOpts {
  roundNumber: number;
  startTick: number;
  tickrate: number;
  stride: number;
  frames: GrenadePositionFrame[];
}

function buildTrajectories(opts: BuildTrajectoriesOpts): PlaybackGrenadeTrajectory[] {
  const { roundNumber, startTick, tickrate, stride, frames } = opts;
  if (frames.length === 0) return [];

  const byProj = new Map<string, GrenadePositionFrame[]>();
  for (const f of frames) {
    if (!f.projectileId) continue;
    const arr = byProj.get(f.projectileId);
    if (arr) arr.push(f);
    else byProj.set(f.projectileId, [f]);
  }

  const out: PlaybackGrenadeTrajectory[] = [];
  let idx = 0;
  for (const [projectileId, arr] of byProj) {
    arr.sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
    const points: PlaybackGrenadeTrajectory['points'] = [];
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i]!;
      const tick = f.tick ?? 0;
      // Always include first + last point; decimate the middle.
      const isEndpoint = i === 0 || i === arr.length - 1;
      if (!isEndpoint && (tick - startTick) % stride !== 0) continue;
      points.push({
        t: Math.max(0, (tick - startTick) / tickrate),
        x: f.x,
        y: f.y,
        z: f.z,
      });
    }
    if (points.length === 0) continue;
    const first = arr[0]!;
    const type = normalizeGrenadeType(first.grenadeName);
    out.push({
      id: `r${roundNumber}t${idx++}`,
      projectileId,
      type,
      thrower: first.throwerName ?? 'unknown',
      throwerSide: sideOf(first.throwerSide),
      tStart: points[0]!.t,
      tEnd: points[points.length - 1]!.t,
      points,
    });
  }
  return out;
}

interface BuildEffectsOpts {
  startTick: number;
  tickrate: number;
  trajectories: PlaybackGrenadeTrajectory[];
  playbackGren: PlaybackGrenade[];
  infernoFrames: InfernoPositionFrame[];
}

function buildEffects(opts: BuildEffectsOpts): PlaybackEffect[] {
  const { startTick, tickrate, trajectories, playbackGren, infernoFrames } = opts;
  const out: PlaybackEffect[] = [];

  // Smokes + flashes pulled from trajectories (each has a clear landing).
  for (const traj of trajectories) {
    const landing = traj.points[traj.points.length - 1]!;
    if (traj.type === 'smoke') {
      out.push({
        kind: 'smoke',
        projectileId: traj.projectileId,
        at: { x: landing.x, y: landing.y },
        tStart: traj.tEnd,
        tEnd: traj.tEnd + SMOKE_LIFETIME_SEC,
      });
    } else if (traj.type === 'flash') {
      out.push({
        kind: 'flash',
        projectileId: traj.projectileId,
        at: { x: landing.x, y: landing.y },
        tStart: traj.tEnd,
        tEnd: traj.tEnd + FLASH_BURST_SEC,
      });
    }
  }

  // If we don't have trajectories (older data), synthesize smoke/flash
  // effects from the landing-only `playbackGren` list so the viewer still
  // shows something.
  if (trajectories.length === 0) {
    for (const g of playbackGren) {
      if (g.type === 'smoke') {
        out.push({
          kind: 'smoke',
          projectileId: g.id,
          at: g.to,
          tStart: g.t,
          tEnd: g.t + SMOKE_LIFETIME_SEC,
        });
      } else if (g.type === 'flash') {
        out.push({
          kind: 'flash',
          projectileId: g.id,
          at: g.to,
          tStart: g.t,
          tEnd: g.t + FLASH_BURST_SEC,
        });
      }
    }
  }

  // Molotovs: group inferno frames by projectileId and compute centroid +
  // [tStart, tEnd]. csda emits one row per fire particle per frame; the
  // centroid smooths out the per-particle jitter into a single overlay pos.
  if (infernoFrames.length > 0) {
    const byProj = new Map<string, InfernoPositionFrame[]>();
    for (const f of infernoFrames) {
      if (!f.projectileId) continue;
      const arr = byProj.get(f.projectileId);
      if (arr) arr.push(f);
      else byProj.set(f.projectileId, [f]);
    }
    for (const [projectileId, arr] of byProj) {
      let sumX = 0;
      let sumY = 0;
      let minTick = Infinity;
      let maxTick = -Infinity;
      for (const f of arr) {
        sumX += f.x;
        sumY += f.y;
        const t = f.tick ?? 0;
        if (t < minTick) minTick = t;
        if (t > maxTick) maxTick = t;
      }
      const tStart = Math.max(0, (minTick - startTick) / tickrate);
      const tEnd = Math.max(tStart, (maxTick - startTick) / tickrate);
      out.push({
        kind: 'molotov',
        projectileId,
        at: { x: sumX / arr.length, y: sumY / arr.length },
        tStart,
        tEnd: Math.max(tEnd, tStart + MOLOTOV_LIFETIME_SEC * 0.5),
      });
    }
  }

  return out.sort((a, b) => a.tStart - b.tStart);
}
