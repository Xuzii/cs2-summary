import type { ViewModel } from '../lib/adapter';
import { Radar } from './Radar';

export function OpeningDuelsMapPage({ match }: { match: ViewModel }) {
  const duels = match.openingsSpatial;
  if (!duels || duels.length === 0) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">Opening Duels · Map</div>
          <div className="right">No spatial duel data for this match</div>
        </div>
      </div>
    );
  }

  const tWins = duels.filter((d) => d.winnerSide === 'T').length;
  const ctWins = duels.filter((d) => d.winnerSide === 'CT').length;
  const weaponCounts: Record<string, number> = {};
  for (const d of duels) {
    const w = (d.weapon || '').replace(/^weapon_/, '').toUpperCase() || 'UNKNOWN';
    weaponCounts[w] = (weaponCounts[w] ?? 0) + 1;
  }
  const topWeapons = Object.entries(weaponCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Opening Duels</div>
        <div className="right">First blood positions — {duels.length} opens</div>
      </div>
      <div className="two-col">
        <div style={{ background: 'var(--panel)', padding: 10, border: '1px solid var(--line)' }}>
          <Radar mapName={match.mapName}>
            {(toPct) => (
              <>
                {duels.map((d) => {
                  const pos = toPct(d.x, d.y);
                  const color = d.winnerSide === 'T' ? 'var(--t)' : 'var(--ct)';
                  return (
                    <div
                      key={d.n}
                      title={`R${d.n} · ${d.killer} → ${d.victim}`}
                      style={{
                        position: 'absolute',
                        left: pos.left,
                        top: pos.top,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: color,
                        transform: 'translate(-50%, -50%)',
                        boxShadow: `0 0 10px ${color}`,
                        opacity: 0.85,
                        border: '1px solid var(--text)',
                      }}
                    />
                  );
                })}
              </>
            )}
          </Radar>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="chart-wrap">
            <div className="chart-hd">
              <div className="title">Outcome Split</div>
            </div>
            <div style={{ display: 'flex', height: 36, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <div
                style={{
                  flex: tWins,
                  background: 'var(--t)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                T · {tWins}
              </div>
              <div
                style={{
                  flex: ctWins,
                  background: 'var(--ct)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                CT · {ctWins}
              </div>
            </div>
          </div>
          <div className="chart-wrap">
            <div className="chart-hd">
              <div className="title">Top Opening Weapons</div>
            </div>
            {topWeapons.map(([w, n]) => (
              <div key={w} className="rec-row">
                <span className="k">{w}</span>
                <span className="v">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
