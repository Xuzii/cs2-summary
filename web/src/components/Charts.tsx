import { useState } from 'react';
import type { ViewModel } from '../lib/adapter';

export function ChartsPage({ match }: { match: ViewModel }) {
  const allPlayers = [...match.teamA.players, ...match.teamB.players].map((p) => p.name);
  const [selected, setSelected] = useState(allPlayers[0] ?? '');
  const eq = match.eqTimeline;
  const eqMax = Math.max(1, ...eq.map((r) => Math.max(r.eqA, r.eqB)));
  const dmg = match.damagePerRound[selected] ?? [];
  const dmgMax = Math.max(1, ...dmg);
  const rounds = eq.length;
  const W = 760;
  const H = 160;
  const stepX = rounds > 1 ? W / (rounds - 1) : W;

  const pathA = eq.map((r, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${H - (r.eqA / eqMax) * H}`).join(' ');
  const pathB = eq.map((r, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${H - (r.eqB / eqMax) * H}`).join(' ');
  const fillA = `${pathA} L ${(rounds - 1) * stepX} ${H} L 0 ${H} Z`;
  const fillB = `${pathB} L ${(rounds - 1) * stepX} ${H} L 0 ${H} Z`;

  const diffSum = eq.reduce((a, r) => a + (r.eqA - r.eqB), 0);
  const diffTotalAbs = eq.reduce((a, r) => a + Math.abs(r.eqA - r.eqB), 0) || 1;
  const advA = Math.max(0, Math.round(((diffSum + diffTotalAbs) / (2 * diffTotalAbs)) * 100));
  const advB = 100 - advA;

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Damage & Economy</div>
        <div className="right">Trends across {rounds} rounds</div>
      </div>

      <div className="chart-wrap" style={{ marginBottom: 16 }}>
        <div className="chart-hd">
          <div className="title">Equipment Value Timeline</div>
          <div className="leg">
            <span style={{ color: 'var(--t)' }}>● T</span>
            <span style={{ color: 'var(--ct)', marginLeft: 8 }}>● CT</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: '100%' }}>
          <path d={fillA} fill="var(--t-glow)" opacity="0.6" />
          <path d={fillB} fill="var(--ct-glow)" opacity="0.6" />
          <path d={pathA} fill="none" stroke="var(--t)" strokeWidth="2" />
          <path d={pathB} fill="none" stroke="var(--ct)" strokeWidth="2" />
        </svg>
      </div>

      <div className="chart-wrap" style={{ marginBottom: 16 }}>
        <div className="chart-hd">
          <div className="title">Damage Per Round — {selected}</div>
          <div className="leg">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{ background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text)', padding: '4px 8px' }}
            >
              {allPlayers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 120 }}>
          {dmg.map((d, i) => (
            <div
              key={i}
              title={`R${i + 1} · ${d} dmg`}
              style={{
                flex: 1,
                height: `${(d / dmgMax) * 100}%`,
                background: 'var(--gold)',
                opacity: 0.6 + (d / dmgMax) * 0.4,
                transition: 'height .3s ease',
              }}
            />
          ))}
        </div>
      </div>

      <div className="chart-wrap">
        <div className="chart-hd">
          <div className="title">Economic Advantage</div>
          <div className="leg">
            <span className="muted">across full match</span>
          </div>
        </div>
        <div style={{ display: 'flex', height: 40, border: '1px solid var(--line)' }}>
          <div style={{ flex: advA, background: 'var(--t)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {match.teamA.name} · {advA}%
          </div>
          <div style={{ flex: advB, background: 'var(--ct)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
            {match.teamB.name} · {advB}%
          </div>
        </div>
      </div>
    </div>
  );
}
