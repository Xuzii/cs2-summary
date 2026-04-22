import { useState, useMemo } from 'react';
import type { ViewModel } from '../lib/adapter';
import type { PlaybackGrenade, PlaybackGrenadeTrajectory } from '../types';
import { Radar } from './Radar';

const TYPES: Array<{ id: string; label: string }> = [
  { id: 'smoke', label: 'Smoke' },
  { id: 'flash', label: 'Flash' },
  { id: 'he', label: 'HE' },
  { id: 'molotov', label: 'Molotov' },
];
const ALL_TYPE_IDS = TYPES.map((t) => t.id);

function normType(raw: string): string {
  const s = (raw || '').toLowerCase();
  if (s.includes('smoke')) return 'smoke';
  if (s.includes('flash')) return 'flash';
  if (s.includes('he') || s === 'hegrenade') return 'he';
  if (s.includes('molot') || s.includes('incgren') || s.includes('incendiary')) return 'molotov';
  return 'other';
}

function typeColor(t: string): string {
  switch (t) {
    case 'smoke':
      return 'var(--ct)';
    case 'flash':
      return 'var(--gold)';
    case 'he':
      return 'var(--lose)';
    case 'molotov':
      return 'var(--t)';
    default:
      return 'var(--muted)';
  }
}

/**
 * Unified row — either a real sampled trajectory (preferred when
 * `INCLUDE_POSITIONS=true`) or a landing-only fallback for legacy data.
 */
interface FinderItem {
  roundN: number;
  thrower: string;
  type: string;
  points: Array<{ x: number; y: number }>;
  landing: { x: number; y: number };
}

function trajToItem(roundN: number, tr: PlaybackGrenadeTrajectory): FinderItem {
  return {
    roundN,
    thrower: tr.thrower,
    type: normType(tr.type),
    points: tr.points.map((p) => ({ x: p.x, y: p.y })),
    landing: tr.points[tr.points.length - 1]
      ? { x: tr.points[tr.points.length - 1]!.x, y: tr.points[tr.points.length - 1]!.y }
      : { x: 0, y: 0 },
  };
}

function grenToItem(roundN: number, g: PlaybackGrenade): FinderItem {
  return {
    roundN,
    thrower: g.thrower,
    type: normType(g.type),
    // Straight line from thrower pos to landing — same as the pre-trajectory
    // visualization.
    points: [{ x: g.from.x, y: g.from.y }, { x: g.to.x, y: g.to.y }],
    landing: { x: g.to.x, y: g.to.y },
  };
}

export function GrenadeFinderPage({ match }: { match: ViewModel }) {
  const pb = match.playback;
  if (!pb || pb.rounds.length === 0) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">Grenade Finder</div>
          <div className="right">Re-parse with INCLUDE_POSITIONS=true to enable</div>
        </div>
      </div>
    );
  }

  // Prefer trajectories (per-tick arcs) per round; fall back to landing-only
  // grenade list when a round has no trajectory data.
  const allItems: FinderItem[] = useMemo(() => {
    const out: FinderItem[] = [];
    for (const r of pb.rounds) {
      if (r.trajectories && r.trajectories.length > 0) {
        for (const tr of r.trajectories) out.push(trajToItem(r.n, tr));
      } else {
        for (const g of r.grenades) out.push(grenToItem(r.n, g));
      }
    }
    return out;
  }, [pb.rounds]);

  const allPlayers = Array.from(new Set(allItems.map((g) => g.thrower).filter(Boolean)));
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => new Set(ALL_TYPE_IDS));
  const [roundN, setRoundN] = useState<number | 'all'>('all');
  const [player, setPlayer] = useState<string>('all');

  const toggleType = (id: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const roundIndex = roundN === 'all' ? -1 : pb.rounds.findIndex((r) => r.n === roundN);
  const gotoRound = (delta: number) => {
    if (pb.rounds.length === 0) return;
    if (roundN === 'all') {
      const first = pb.rounds[0];
      if (first) setRoundN(first.n);
      return;
    }
    const next = roundIndex + delta;
    if (next < 0 || next >= pb.rounds.length) return;
    const target = pb.rounds[next];
    if (target) setRoundN(target.n);
  };

  const filtered = useMemo(() => {
    return allItems.filter((g) => {
      if (!selectedTypes.has(g.type)) return false;
      if (roundN !== 'all' && g.roundN !== roundN) return false;
      if (player !== 'all' && g.thrower !== player) return false;
      return true;
    });
  }, [allItems, selectedTypes, roundN, player]);

  const topThrowers: Record<string, number> = {};
  for (const g of filtered) topThrowers[g.thrower] = (topThrowers[g.thrower] ?? 0) + 1;
  const sortedThrowers = Object.entries(topThrowers).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Grenade Finder</div>
        <div className="right">
          {filtered.length} / {allItems.length} grenades
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPES.map((t) => {
            const on = selectedTypes.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleType(t.id)}
                style={{
                  padding: '6px 12px',
                  background: on ? typeColor(t.id) : 'var(--panel)',
                  border: '1px solid var(--line)',
                  color: on ? '#000' : 'var(--muted)',
                  fontSize: 11,
                  letterSpacing: '.1em',
                  opacity: on ? 1 : 0.6,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={() => gotoRound(-1)}
            disabled={roundN === 'all' || roundIndex <= 0}
            style={{
              padding: '6px 10px',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              fontSize: 12,
              cursor: roundN === 'all' || roundIndex <= 0 ? 'default' : 'pointer',
              opacity: roundN === 'all' || roundIndex <= 0 ? 0.4 : 1,
            }}
            aria-label="Previous round"
          >
            ◀
          </button>
          <select
            value={roundN}
            onChange={(e) => setRoundN(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)', padding: '6px 10px' }}
          >
            <option value="all">All rounds</option>
            {pb.rounds.map((r) => (
              <option key={r.n} value={r.n}>
                R{r.n}
              </option>
            ))}
          </select>
          <button
            onClick={() => gotoRound(1)}
            disabled={roundN === 'all' || roundIndex >= pb.rounds.length - 1}
            style={{
              padding: '6px 10px',
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              fontSize: 12,
              cursor: roundN === 'all' || roundIndex >= pb.rounds.length - 1 ? 'default' : 'pointer',
              opacity: roundN === 'all' || roundIndex >= pb.rounds.length - 1 ? 0.4 : 1,
            }}
            aria-label="Next round"
          >
            ▶
          </button>
        </div>
        <select
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
          style={{ background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--text)', padding: '6px 10px' }}
        >
          <option value="all">All players</option>
          {allPlayers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="two-col">
        <div style={{ background: 'var(--panel)', padding: 10, border: '1px solid var(--line)' }}>
          <Radar mapName={match.mapName}>
            {(toPct) => (
              <svg
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              >
                {filtered.map((g, i) => {
                  const color = typeColor(g.type);
                  const landing = toPct(g.landing.x, g.landing.y);
                  const pts = g.points.map((p) => {
                    const pc = toPct(p.x, p.y);
                    return `${pc.left},${pc.top}`;
                  });
                  return (
                    <g key={i}>
                      {g.points.length >= 2 && (
                        <polyline
                          points={pts.join(' ')}
                          stroke={color}
                          strokeWidth={1.5}
                          fill="none"
                          opacity={0.6}
                        />
                      )}
                      <circle cx={landing.left} cy={landing.top} r={5} fill={color} opacity={0.9} />
                    </g>
                  );
                })}
              </svg>
            )}
          </Radar>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="chart-wrap">
            <div className="chart-hd">
              <div className="title">Counts by type</div>
            </div>
            {['smoke', 'flash', 'he', 'molotov'].map((tp) => (
              <div key={tp} className="rec-row">
                <span className="k" style={{ color: typeColor(tp) }}>
                  {tp.toUpperCase()}
                </span>
                <span className="v">{filtered.filter((g) => g.type === tp).length}</span>
              </div>
            ))}
          </div>
          <div className="chart-wrap">
            <div className="chart-hd">
              <div className="title">Top throwers</div>
            </div>
            {sortedThrowers.map(([n, c]) => (
              <div key={n} className="rec-row">
                <span className="k">{n}</span>
                <span className="v">{c}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
