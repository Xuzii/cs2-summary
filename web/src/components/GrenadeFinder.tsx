import { useState, useMemo } from 'react';
import type { ViewModel } from '../lib/adapter';
import type { PlaybackGrenade } from '../types';
import { Radar } from './Radar';

const TYPES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'smoke', label: 'Smoke' },
  { id: 'flash', label: 'Flash' },
  { id: 'he', label: 'HE' },
  { id: 'molotov', label: 'Molotov' },
];

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

  const allGren: PlaybackGrenade[] = pb.rounds.flatMap((r) => r.grenades);
  const allPlayers = Array.from(new Set(allGren.map((g) => g.thrower).filter(Boolean)));
  const [type, setType] = useState('all');
  const [roundN, setRoundN] = useState<number | 'all'>('all');
  const [player, setPlayer] = useState<string>('all');

  const filtered = useMemo(() => {
    return allGren.filter((g) => {
      if (type !== 'all' && normType(g.type) !== type) return false;
      if (roundN !== 'all') {
        const roundOfG = pb.rounds.find((r) => r.grenades.includes(g));
        if (!roundOfG || roundOfG.n !== roundN) return false;
      }
      if (player !== 'all' && g.thrower !== player) return false;
      return true;
    });
  }, [allGren, type, roundN, player, pb.rounds]);

  const topThrowers: Record<string, number> = {};
  for (const g of filtered) topThrowers[g.thrower] = (topThrowers[g.thrower] ?? 0) + 1;
  const sortedThrowers = Object.entries(topThrowers).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Grenade Finder</div>
        <div className="right">
          {filtered.length} / {allGren.length} grenades
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              style={{
                padding: '6px 12px',
                background: type === t.id ? typeColor(t.id) : 'var(--panel)',
                border: '1px solid var(--line)',
                color: type === t.id ? '#000' : 'var(--text)',
                fontSize: 11,
                letterSpacing: '.1em',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
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
                  const f = toPct(g.from.x, g.from.y);
                  const to = toPct(g.to.x, g.to.y);
                  const t = normType(g.type);
                  const color = typeColor(t);
                  return (
                    <g key={i}>
                      <line
                        x1={f.left}
                        y1={f.top}
                        x2={to.left}
                        y2={to.top}
                        stroke={color}
                        strokeWidth="1.5"
                        opacity="0.6"
                      />
                      <circle cx={to.left} cy={to.top} r="5" fill={color} opacity="0.9" />
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
                <span className="v">{filtered.filter((g) => normType(g.type) === tp).length}</span>
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
