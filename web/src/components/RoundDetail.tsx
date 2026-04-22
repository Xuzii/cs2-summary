import { useMemo, useState } from 'react';
import type { ViewModel } from '../lib/adapter';

/**
 * Rich per-round detail page with a round-picker strip at the top, KPI strip,
 * kill-feed sequence, equipment-going-in, plant/defuse/clutch snapshot, and
 * top-damage bars.
 *
 * Ported from the reference standalone deck (see zip: `features.jsx:101-231`).
 * All data flows off `ViewModel` — no mocks, nothing synthesized client-side.
 */
export function RoundDetailPage({
  match,
  initialRound = 1,
  onJumpToTick,
}: {
  match: ViewModel;
  initialRound?: number;
  onJumpToTick?: (roundN: number, tSec: number) => void;
}) {
  const details = match.roundDetails;
  const playback = match.playback;
  const inv = match.roundInventory;

  const allRoundNumbers = useMemo(() => {
    const fromDetails = details.map((d) => d.n);
    const fromFlow = match.roundFlow.map((r) => r.n);
    const set = new Set<number>([...fromDetails, ...fromFlow]);
    return [...set].sort((a, b) => a - b);
  }, [details, match.roundFlow]);

  const initialRoundSafe = allRoundNumbers.includes(initialRound) ? initialRound : allRoundNumbers[0] ?? 1;
  const [roundN, setRoundN] = useState(initialRoundSafe);

  if (details.length === 0) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">Round Detail</div>
          <div className="right">No round data available</div>
        </div>
      </div>
    );
  }

  const detail = details.find((d) => d.n === roundN) ?? details[0]!;
  const pbRound = playback?.rounds.find((r) => r.n === roundN);
  const roundInv = inv[roundN] ?? {};
  const firstHalf = roundN <= 12;
  const aSide = firstHalf ? match.teamA.side : match.teamA.side === 'T' ? 'CT' : 'T';
  const aWin = detail.winner === aSide;

  const allPlayers = [...match.teamA.players, ...match.teamB.players];
  const plantedBy = detail.kills.find((k) => k.killerSide === 'T')?.killer;
  const clutchCandidate = detail.kills.length >= 3 ? detail.kills[detail.kills.length - 1]!.killer : null;

  const jump = (tSec: number) => onJumpToTick?.(roundN, tSec);

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Round {String(roundN).padStart(2, '0')} · Detail</div>
        <div className="rnav">
          <button className="rnav-btn" onClick={() => setRoundN((n) => Math.max(allRoundNumbers[0] ?? 1, n - 1))}>
            ◀
          </button>
          <div className="cur">R {String(roundN).padStart(2, '0')}</div>
          <button
            className="rnav-btn"
            onClick={() => setRoundN((n) => Math.min(allRoundNumbers[allRoundNumbers.length - 1] ?? n, n + 1))}
          >
            ▶
          </button>
        </div>
      </div>

      <div className="round-picker">
        {allRoundNumbers.map((n) => {
          const d = details.find((x) => x.n === n);
          const fh = n <= 12;
          const aSideForRnd = fh ? match.teamA.side : match.teamA.side === 'T' ? 'CT' : 'T';
          const aWon = d ? d.winner === aSideForRnd : false;
          const cls = aWon ? match.teamA.side.toLowerCase() : match.teamB.side.toLowerCase();
          return (
            <button
              key={n}
              className={`rp-btn ${cls} ${n === roundN ? 'on' : ''}`}
              onClick={() => setRoundN(n)}
            >
              R{n}
            </button>
          );
        })}
      </div>

      <div className="kpi-strip" style={{ marginBottom: 14 }}>
        <div className={`kpi ${aWin ? 'win' : 'lose'}`}>
          <div className="l">WINNER</div>
          <div className="v">{aWin ? match.teamA.name : match.teamB.name}</div>
          <div className="sub">{detail.winner} SIDE</div>
        </div>
        <div className="kpi">
          <div className="l">END REASON</div>
          <div className="v" style={{ fontSize: 20 }}>
            {detail.endReason}
          </div>
        </div>
        <div className="kpi">
          <div className="l">DURATION</div>
          <div className="v">{detail.duration.toFixed(1)}s</div>
        </div>
        <div className="kpi">
          <div className="l">TOTAL KILLS</div>
          <div className="v">{detail.kills.length}</div>
        </div>
        <div className="kpi t">
          <div className="l">ECON · {match.teamA.name}</div>
          <div className="v" style={{ fontSize: 22 }}>
            ${(detail.eqA / 1000).toFixed(1)}K
          </div>
          <div className="sub">{detail.econA}</div>
        </div>
        <div className="kpi ct">
          <div className="l">ECON · {match.teamB.name}</div>
          <div className="v" style={{ fontSize: 22 }}>
            ${(detail.eqB / 1000).toFixed(1)}K
          </div>
          <div className="sub">{detail.econB}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-hd">
            <div className="t">Kill Feed · Sequence</div>
            <div className="r">{detail.kills.length} kills</div>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
            {detail.kills.map((d, i) => (
              <div
                key={i}
                onClick={() => jump(d.t)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: 'var(--panel-2)',
                  borderLeft: `3px solid ${d.killerSide === 'T' ? 'var(--t)' : 'var(--ct)'}`,
                  fontSize: 12,
                  cursor: onJumpToTick ? 'pointer' : 'default',
                }}
              >
                <div style={{ fontFamily: 'JetBrains Mono', color: 'var(--muted)', fontWeight: 700, fontSize: 11 }}>
                  {d.t.toFixed(1)}s
                </div>
                <div>
                  <b style={{ color: d.killerSide === 'T' ? 'var(--t-2)' : 'var(--ct-2)' }}>{d.killer}</b>
                  <span style={{ color: 'var(--muted)', fontFamily: 'JetBrains Mono', fontSize: 10, margin: '0 6px' }}>
                    [{(d.weapon || '').toUpperCase()}]
                  </span>
                  {d.headshot && <span style={{ color: 'var(--gold)', fontSize: 10, marginRight: 6 }}>⊙HS</span>}
                  {d.wallbang && <span style={{ color: 'var(--purple)', fontSize: 10, marginRight: 6 }}>◐WB</span>}
                  ▸ <b style={{ color: d.victimSide === 'T' ? 'var(--t-2)' : 'var(--ct-2)' }}>{d.victim}</b>
                </div>
                <div style={{ fontSize: 10, color: 'var(--subtle)', letterSpacing: '.14em' }}>
                  {onJumpToTick ? '→ TICK' : ''}
                </div>
              </div>
            ))}
            {detail.kills.length === 0 && (
              <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center', fontSize: 11 }}>No kills this round</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-hd">
              <div className="t">Equipment Going In</div>
            </div>
            <div style={{ padding: 12 }}>
              {allPlayers.map((p, pi) => {
                const row = roundInv[p.name];
                if (!row) return null;
                const onA = pi < match.teamA.players.length;
                return (
                  <div
                    key={p.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      padding: '5px 0',
                      fontSize: 12,
                      borderLeft: `2px solid ${onA ? 'var(--t)' : 'var(--ct)'}`,
                      paddingLeft: 10,
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)' }}>
                      {row.primary ? (
                        <span style={{ color: 'var(--text)', marginRight: 8 }}>{row.primary.toUpperCase()}</span>
                      ) : (
                        <span style={{ color: 'var(--subtle)', marginRight: 8 }}>—</span>
                      )}
                      {row.secondary.toUpperCase()}
                      {row.armor > 0 ? ` · K${row.helmet ? 'H' : ''}` : ''}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--gold)', fontWeight: 700 }}>
                      ${(row.money / 1000).toFixed(1)}K
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="t">Plant / Defuse / Clutch</div>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {detail.bomb.planted ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '.22em', fontWeight: 700, textTransform: 'uppercase' }}>
                      BOMB PLANTED · SITE {detail.bomb.site ?? '?'}
                    </span>
                    {pbRound?.bombPlantT !== undefined && pbRound?.bombPlantT !== null && (
                      <b style={{ fontFamily: 'JetBrains Mono' }}>{pbRound.bombPlantT.toFixed(1)}s</b>
                    )}
                  </div>
                  {plantedBy && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Planted by <b style={{ color: 'var(--text)' }}>{plantedBy}</b>
                    </div>
                  )}
                  {detail.bomb.defused && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ color: 'var(--ct)', fontSize: 10, letterSpacing: '.22em', fontWeight: 700, textTransform: 'uppercase' }}>
                        BOMB DEFUSED
                      </span>
                      {pbRound?.bombDefuseT !== undefined && pbRound?.bombDefuseT !== null && (
                        <b style={{ fontFamily: 'JetBrains Mono' }}>{pbRound.bombDefuseT.toFixed(1)}s</b>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '.14em', fontWeight: 700, textTransform: 'uppercase' }}>
                  NO BOMB PLANTED
                </div>
              )}
              <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.22em', fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>
                  CLUTCH SNAPSHOT
                </div>
                <div style={{ fontFamily: 'Barlow Condensed', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>
                  {clutchCandidate ? `${clutchCandidate} · 1vX` : '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                  {clutchCandidate ? 'final kill pattern suggests a clutch attempt' : 'no clutch attempt'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sect">
        <div className="sect-h">
          <div className="title">Top Damage · This Round</div>
        </div>
        <div className="card">
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {detail.topDamage.map((d, i) => (
              <div
                key={i}
                style={{ display: 'grid', gridTemplateColumns: '140px 1fr 60px', gap: 14, alignItems: 'center', fontSize: 12 }}
              >
                <span style={{ fontWeight: 700, letterSpacing: '.02em' }}>{d.name}</span>
                <div style={{ height: 10, background: 'var(--panel-3)', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      right: 'auto',
                      width: `${Math.min(100, (d.dmg / 200) * 100)}%`,
                      background: 'linear-gradient(90deg, var(--gold), #f39321)',
                      animation: 'fillIn .6s ease both',
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                </div>
                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, textAlign: 'right' }}>{d.dmg}</span>
              </div>
            ))}
            {detail.topDamage.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center', padding: 20 }}>
                No damage data for this round
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
