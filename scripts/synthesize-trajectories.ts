/**
 * DEV-ONLY: Patch an existing web MatchDocument in place with synthesized
 * per-tick playback data — 8Hz player tracks, grenade trajectories, and
 * smoke/molotov/flash effects — so the Viewer2D rendering paths added for
 * the 8Hz tick work can be exercised without re-parsing the original .dem.
 *
 * This is purely a visual-verification aid. Real trajectory data should
 * come from re-running the pipeline with INCLUDE_POSITIONS=true.
 *
 * Usage:
 *   npx tsx scripts/synthesize-trajectories.ts web/public/matches/<id>.json
 */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

interface Pt {
  t: number;
  x: number;
  y: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * de_inferno has world coords roughly in [-2200, 3500] on both axes. We
 * sample inside a plausible playable envelope so markers land on the map
 * image (radar.ts calibration clips anything outside).
 */
const INFERNO_BOX = { minX: -1600, maxX: 2700, minY: -1000, maxY: 3300 };

function lerpPoint(a: Pt, b: Pt, u: number): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx scripts/synthesize-trajectories.ts <path-to-match-json>');
    process.exit(2);
  }
  const file = path.resolve(arg);
  console.log(`[synth] Reading ${file}`);
  const raw = await readFile(file, 'utf8');
  const doc = JSON.parse(raw);
  const playback = doc.match?.playback;
  if (!playback || !Array.isArray(playback.rounds)) {
    console.error('[synth] MatchDocument has no playback.rounds — nothing to patch.');
    process.exit(1);
  }

  const rng = mulberry32(0xc25f);
  const randIn = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const pickAreaT = () => ({
    x: randIn(INFERNO_BOX.minX, INFERNO_BOX.minX + 800),
    y: randIn(INFERNO_BOX.minY + 1600, INFERNO_BOX.maxY),
  });
  const pickAreaCT = () => ({
    x: randIn(INFERNO_BOX.maxX - 800, INFERNO_BOX.maxX),
    y: randIn(INFERNO_BOX.minY, INFERNO_BOX.minY + 1400),
  });
  const pickMid = () => ({
    x: randIn(INFERNO_BOX.minX + 1000, INFERNO_BOX.maxX - 1000),
    y: randIn(INFERNO_BOX.minY + 800, INFERNO_BOX.maxY - 800),
  });

  playback.sampleHz = 8;

  for (const r of playback.rounds) {
    const duration = Math.max(20, r.duration ?? 60);
    const nSamples = Math.max(20, Math.floor(duration * 8));
    const tracks = r.tracks ?? [];

    // 8Hz player tracks. Synthesize T-side players starting from a T area,
    // CT-side from a CT area, sweeping toward mid with a sprinkle of noise.
    r.tracks = tracks.map((trk: { side: 'T' | 'CT'; name: string; team: 'A' | 'B' }) => {
      const start = trk.side === 'T' ? pickAreaT() : pickAreaCT();
      const end = pickMid();
      const points: Array<Pt & { health: number; isAlive: boolean; hasBomb?: boolean }> = [];
      for (let i = 0; i < nSamples; i++) {
        const u = i / Math.max(1, nSamples - 1);
        const p = lerpPoint(
          { t: 0, ...start },
          { t: duration, ...end },
          u,
        );
        points.push({
          t: (i / 8),
          x: p.x + randIn(-90, 90),
          y: p.y + randIn(-90, 90),
          health: Math.max(0, 100 - Math.round(u * 20 + rng() * 30)),
          isAlive: true,
        });
      }
      return { ...trk, points };
    });

    // 2-4 grenade trajectories per round: each is a 1-1.5s arc of 8-12 pts,
    // starting from a random T-side position toward a mid/CT area.
    const nTraj = 2 + Math.floor(rng() * 3);
    const types = ['smoke', 'flash', 'he', 'molotov'];
    const trajectories: Array<{
      id: string;
      projectileId: string;
      type: string;
      thrower: string;
      throwerSide: 'T' | 'CT';
      tStart: number;
      tEnd: number;
      points: Pt[];
    }> = [];
    for (let gi = 0; gi < nTraj; gi++) {
      const type = types[Math.floor(rng() * types.length)]!;
      const throwerIdx = Math.floor(rng() * Math.max(1, r.tracks.length));
      const thrower = r.tracks[throwerIdx] ?? { name: 'unknown', side: 'T' };
      const tStart = 8 + rng() * (duration - 12);
      const flightSec = 0.6 + rng() * 0.9;
      const tEnd = tStart + flightSec;
      const from = trackPositionAt(r.tracks[throwerIdx], tStart);
      const to = pickMid();
      const nPts = Math.max(6, Math.floor(flightSec * 8));
      const points: Pt[] = [];
      for (let i = 0; i <= nPts; i++) {
        const u = i / nPts;
        const p = lerpPoint({ t: tStart, ...from }, { t: tEnd, ...to }, u);
        // Parabolic sag to imitate an arc (visual only — z not used in radar).
        const sag = -4 * (u - 0.5) ** 2 + 1; // 0..1..0 bump
        points.push({
          t: tStart + u * flightSec,
          x: p.x,
          y: p.y - sag * 60,
        });
      }
      trajectories.push({
        id: `r${r.n}t${gi}`,
        projectileId: `p${r.n}-${gi}`,
        type,
        thrower: thrower.name,
        throwerSide: thrower.side,
        tStart,
        tEnd,
        points,
      });
    }
    r.trajectories = trajectories;

    // Effects mirror trajectories: smoke clouds + molotov fires + flash bursts.
    const effects: Array<{
      kind: 'smoke' | 'molotov' | 'flash';
      projectileId: string;
      at: { x: number; y: number };
      tStart: number;
      tEnd: number;
    }> = [];
    for (const tr of trajectories) {
      const landing = tr.points[tr.points.length - 1]!;
      if (tr.type === 'smoke') {
        effects.push({ kind: 'smoke', projectileId: tr.projectileId, at: { x: landing.x, y: landing.y }, tStart: tr.tEnd, tEnd: tr.tEnd + 18 });
      } else if (tr.type === 'flash') {
        effects.push({ kind: 'flash', projectileId: tr.projectileId, at: { x: landing.x, y: landing.y }, tStart: tr.tEnd, tEnd: tr.tEnd + 0.15 });
      } else if (tr.type === 'molotov') {
        effects.push({ kind: 'molotov', projectileId: tr.projectileId, at: { x: landing.x, y: landing.y }, tStart: tr.tEnd, tEnd: tr.tEnd + 7 });
      }
    }
    r.effects = effects;
  }

  await writeFile(file, JSON.stringify(doc), 'utf8');
  console.log(`[synth] Patched ${file}`);
  console.log(`[synth] ${playback.rounds.length} rounds processed, 8Hz tracks + trajectories + effects injected.`);
}

function trackPositionAt(
  trk: { points: Array<{ t: number; x: number; y: number }> } | undefined,
  t: number,
): { x: number; y: number } {
  if (!trk || trk.points.length === 0) return { x: 0, y: 0 };
  let i = 0;
  while (i < trk.points.length - 1 && trk.points[i + 1]!.t <= t) i++;
  return { x: trk.points[i]!.x, y: trk.points[i]!.y };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
