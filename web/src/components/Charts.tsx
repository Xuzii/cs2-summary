import { useState } from 'react';
import type { ViewModel } from '../lib/adapter';

const W = 800;
const H = 260;
const H_SHORT = 240;
const H_DIFF = 200;
const PAD = 40;

/**
 * Equipment value over time: two SVG polylines with dotted markers, axis
 * labels in $XK increments, R-labels every 4 rounds, gridlines at quartiles.
 * Ported from the reference standalone deck.
 */
function EqTimelineChart({ match }: { match: ViewModel }) {
  const eq = match.eqTimeline;
  if (eq.length === 0) return null;
  const maxV = Math.max(1, ...eq.flatMap((r) => [r.eqA, r.eqB])) * 1.1;
  const xAt = (i: number) => PAD + (i / Math.max(1, eq.length - 1)) * (W - PAD * 2);
  const yAt = (v: number) => H - PAD - (v / maxV) * (H - PAD * 2);
  const pathA = eq.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(r.eqA)}`).join(' ');
  const pathB = eq.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(r.eqB)}`).join(' ');
  return (
    <div className="chart-wrap">
      <div className="chart-hd">
        <div className="title">Equipment Value · Over Time</div>
        <div className="leg">
          <span className="lg t">
            <i />
            {match.teamA.name}
          </span>
          <span className="lg ct">
            <i />
            {match.teamB.name}
          </span>
        </div>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <line
            key={i}
            className="gridline"
            x1={PAD}
            x2={W - PAD}
            y1={H - PAD - f * (H - PAD * 2)}
            y2={H - PAD - f * (H - PAD * 2)}
          />
        ))}
        {eq.map((r, i) =>
          i % 4 === 0 ? (
            <text key={i} x={xAt(i)} y={H - PAD + 16} textAnchor="middle">
              R{r.n}
            </text>
          ) : null,
        )}
        {[0, 0.5, 1].map((f, i) => (
          <text key={i} x={PAD - 6} y={H - PAD - f * (H - PAD * 2) + 4} textAnchor="end" fill="var(--muted)">
            ${Math.round((maxV * f) / 1000)}K
          </text>
        ))}
        <path d={pathA} stroke="var(--t)" strokeWidth={2} fill="none" />
        <path d={pathB} stroke="var(--ct)" strokeWidth={2} fill="none" />
        {eq.map((r, i) => (
          <circle key={`a${i}`} cx={xAt(i)} cy={yAt(r.eqA)} r={2.5} fill="var(--t)" />
        ))}
        {eq.map((r, i) => (
          <circle key={`b${i}`} cx={xAt(i)} cy={yAt(r.eqB)} r={2.5} fill="var(--ct)" />
        ))}
      </svg>
    </div>
  );
}

/**
 * Per-round damage bar chart with a player selector + staggered fillIn
 * animation. Bar color flips T vs CT based on which team the selection is on.
 */
function DamagePerRoundChart({ match }: { match: ViewModel }) {
  const all = [...match.teamA.players, ...match.teamB.players];
  const defaultName = all[0]?.name ?? '';
  const [selected, setSelected] = useState(defaultName);
  const data = match.damagePerRound[selected] ?? [];
  if (data.length === 0 && all.length === 0) return null;
  const maxV = Math.max(1, ...data) * 1.1;
  const BW = (W - PAD * 2) / Math.max(1, data.length);
  const onA = match.teamA.players.some((p) => p.name === selected);
  const color = onA ? 'var(--t)' : 'var(--ct)';
  return (
    <div className="chart-wrap">
      <div className="chart-hd">
        <div className="title">Damage Dealt · Per Round</div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="fchip"
          style={{ padding: '5px 10px' }}
        >
          {all.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H_SHORT}`}>
        {[0, 0.5, 1].map((f, i) => (
          <line
            key={i}
            className="gridline"
            x1={PAD}
            x2={W - PAD}
            y1={H_SHORT - PAD - f * (H_SHORT - PAD * 2)}
            y2={H_SHORT - PAD - f * (H_SHORT - PAD * 2)}
          />
        ))}
        {data.map((v, i) => (
          <g key={i}>
            <rect
              x={PAD + i * BW + 2}
              y={H_SHORT - PAD - (v / maxV) * (H_SHORT - PAD * 2)}
              width={Math.max(0, BW - 4)}
              height={(v / maxV) * (H_SHORT - PAD * 2)}
              fill={color}
              opacity={0.8}
              style={{
                animation: 'fillIn .6s ease both',
                animationDelay: `${i * 0.02}s`,
                transformOrigin: 'bottom',
              }}
            />
            {(i + 1) % 4 === 1 && (
              <text x={PAD + i * BW + BW / 2} y={H_SHORT - PAD + 16} textAnchor="middle">
                R{i + 1}
              </text>
            )}
          </g>
        ))}
        {[0, 0.5, 1].map((f, i) => (
          <text
            key={i}
            x={PAD - 6}
            y={H_SHORT - PAD - f * (H_SHORT - PAD * 2) + 4}
            textAnchor="end"
            fill="var(--muted)"
          >
            {Math.round(maxV * f)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/**
 * Signed diff chart: team A advantage above the midline, team B below.
 * Replaces the earlier one-dimensional colored band that was hard to read.
 */
function EconAdvChart({ match }: { match: ViewModel }) {
  const eq = match.eqTimeline;
  if (eq.length === 0) return null;
  const diffs = eq.map((r) => r.eqA - r.eqB);
  const maxAbs = Math.max(1, ...diffs.map(Math.abs)) * 1.1;
  const BW = (W - PAD * 2) / eq.length;
  return (
    <div className="chart-wrap">
      <div className="chart-hd">
        <div className="title">Eq Advantage · ({match.teamA.name} – {match.teamB.name})</div>
        <div className="leg">
          <span className="lg t">
            <i />
            {match.teamA.name} AHEAD
          </span>
          <span className="lg ct">
            <i />
            {match.teamB.name} AHEAD
          </span>
        </div>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H_DIFF}`}>
        <line className="gridline" x1={PAD} x2={W - PAD} y1={H_DIFF / 2} y2={H_DIFF / 2} />
        {diffs.map((d, i) => {
          const h = (Math.abs(d) / maxAbs) * (H_DIFF / 2 - PAD);
          const y = d >= 0 ? H_DIFF / 2 - h : H_DIFF / 2;
          return (
            <rect
              key={i}
              x={PAD + i * BW + 2}
              y={y}
              width={Math.max(0, BW - 4)}
              height={h}
              fill={d >= 0 ? 'var(--t)' : 'var(--ct)'}
              opacity={0.75}
              style={{
                animation: 'fillIn .6s ease both',
                animationDelay: `${i * 0.02}s`,
              }}
            />
          );
        })}
        {eq.map((r, i) =>
          (i + 1) % 4 === 1 ? (
            <text key={i} x={PAD + i * BW + BW / 2} y={H_DIFF - 8} textAnchor="middle">
              R{r.n}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function ChartsPage({ match }: { match: ViewModel }) {
  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Damage & Economy</div>
        <div className="right">per round timelines</div>
      </div>
      <EqTimelineChart match={match} />
      <div className="sect">
        <DamagePerRoundChart match={match} />
      </div>
      <div className="sect">
        <EconAdvChart match={match} />
      </div>
    </div>
  );
}
