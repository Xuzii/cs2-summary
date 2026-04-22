import type { ViewModel, VMTeam, VMPlayer } from '../lib/adapter';
import type { TemplateHighlight } from '../types';

function KPIStrip({ match }: { match: ViewModel }) {
  const { teamA, teamB, roundDetails, bomb, grenadesAgg } = match;
  const all = [...teamA.players, ...teamB.players];
  const totalKills = all.reduce((a, p) => a + p.k, 0);
  const hsAvg = all.length > 0 ? Math.round(all.reduce((a, p) => a + p.hs, 0) / all.length) : 0;
  const topAdr = [...all].sort((a, b) => b.adr - a.adr)[0] ?? { name: '—', adr: 0 };
  const topRat = [...all].sort((a, b) => b.rating - a.rating)[0] ?? { name: '—', rating: 0 };
  const bombPlants = roundDetails.filter((r) => r.bomb.planted).length;
  const clutchesWon = Object.values(match.playerRoundImpact).reduce(
    (sum, rs) => sum + rs.filter((r) => r.clutchWon).length,
    0,
  );
  return (
    <div className="kpi-strip">
      <div className="kpi">
        <div className="l">TOTAL KILLS</div>
        <div className="v">{totalKills}</div>
        <div className="sub">across {roundDetails.length} rounds</div>
      </div>
      <div className="kpi ct">
        <div className="l">AVG HS%</div>
        <div className="v">{hsAvg}%</div>
        <div className="sub">server-wide</div>
      </div>
      <div className="kpi t">
        <div className="l">TOP ADR</div>
        <div className="v">{topAdr.adr.toFixed(0)}</div>
        <div className="sub">{topAdr.name}</div>
      </div>
      <div className="kpi win">
        <div className="l">MVP RATING</div>
        <div className="v">{topRat.rating.toFixed(2)}</div>
        <div className="sub">{topRat.name}</div>
      </div>
      <div className="kpi">
        <div className="l">PLANTS</div>
        <div className="v">{bombPlants}</div>
        <div className="sub">{bomb.defuses} defuse</div>
      </div>
      <div className="kpi lose">
        <div className="l">NADES</div>
        <div className="v">{grenadesAgg.total}</div>
        <div className="sub">{clutchesWon} clutches</div>
      </div>
    </div>
  );
}

function ScoreboardTable({ team, onRowClick }: { team: VMTeam; onRowClick?: (p: VMPlayer) => void }) {
  const sideCls = team.side.toLowerCase();
  const sorted = [...team.players].sort((a, b) => b.rating - a.rating);
  return (
    <div className="sb">
      <div className={`sb-hd ${sideCls} ${team.score < 13 ? 'lost' : ''}`}>
        <div className="sig">{team.side}</div>
        <div>
          <div className="tname">{team.name}</div>
          <div className="tmeta">{team.resultLabel}</div>
        </div>
        <div className="score">{team.score}</div>
      </div>
      <div className="sb-row head">
        <div>PLAYER</div>
        <div className="c">K</div>
        <div className="c">D</div>
        <div className="c">A</div>
        <div className="c">ADR</div>
        <div className="c">HS%</div>
        <div className="c">KAST</div>
        <div className="c">MVP</div>
        <div className="c">FK</div>
        <div className="c">RATING</div>
      </div>
      {sorted.map((p) => (
        <div key={p.name} className={`sb-row ${sideCls}-side`} onClick={() => onRowClick?.(p)}>
          <div className="p">
            <span className="pn">{p.name}</span>
            {p.mvpFlag && <span className="mvp">MVP</span>}
            {p.note && <span className="note">{p.note}</span>}
          </div>
          <div className="c">{p.k}</div>
          <div className="c">{p.d}</div>
          <div className="c">{p.a}</div>
          <div className="c">{p.adr.toFixed(1)}</div>
          <div className="c">{p.hs}%</div>
          <div className="c">{p.kast}%</div>
          <div className="c">{p.mvp}</div>
          <div className="c">{p.fk}</div>
          <div className={`c rating ${p.rating >= 1.3 ? 'hi' : p.rating < 1 ? 'lo' : ''}`}>
            {p.rating.toFixed(2)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Highlights({ highlights }: { highlights: TemplateHighlight[] }) {
  const cls: Record<string, string> = {
    MVP: 'mvp',
    'BEST ENTRY': 'entry',
    CLUTCH: 'clutch',
    UTILITY: 'util',
    '4K': 'frag',
    ACE: 'frag',
    '3K': 'frag',
  };
  return (
    <div className="hl-grid">
      {highlights.map((h, i) => (
        <div key={i} className={`hl ${cls[h.label.toUpperCase()] ?? 'mvp'}`}>
          <div className="k">{h.label.toUpperCase()}</div>
          <div className="player">
            {h.player}
            {h.label.toUpperCase() === 'MVP' && <span className="pill">MVP</span>}
          </div>
          <div className="d">{h.detail}</div>
        </div>
      ))}
    </div>
  );
}

function RoundFlow({
  match,
  onCellClick,
  activeRound,
}: {
  match: ViewModel;
  onCellClick?: (n: number) => void;
  activeRound?: number;
}) {
  const { teamA, teamB, roundFlow } = match;
  const total = roundFlow.length;
  return (
    <div className="rflow">
      <div className={`rflow-team ${teamA.side.toLowerCase()}`}>
        <span className="sq"></span>
        <span>{teamA.name}</span>
      </div>
      <div className="rflow-bar">
        <div className="rflow-top">
          <span>R1</span>
          <span className="mid">
            {teamA.score} — {teamB.score}
          </span>
          <span>R{total}</span>
        </div>
        <div
          className="rflow-cells"
          style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}
        >
          {roundFlow.map((r, i) => {
            const firstHalf = r.n <= 12;
            const aSideNow = firstHalf ? teamA.side : teamA.side === 'T' ? 'CT' : 'T';
            const aWon = r.winner === aSideNow;
            const cls = aWon ? teamA.side.toLowerCase() : teamB.side.toLowerCase();
            return (
              <div
                key={i}
                className={`rflow-cell ${cls} ${r.halftime ? 'ht' : ''} ${activeRound === r.n ? 'active' : ''}`}
                title={`R${r.n} · ${r.winner}`}
                onClick={() => onCellClick?.(r.n)}
              >
                {r.n}
              </div>
            );
          })}
        </div>
        <div className="rflow-bottom">
          <span>1H</span>
          <span>HALFTIME</span>
          <span>2H</span>
        </div>
      </div>
      <div className={`rflow-team ${teamB.side.toLowerCase()}`}>
        <span>{teamB.name}</span>
        <span className="sq"></span>
      </div>
    </div>
  );
}

function EndReasonDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const colors: Record<string, string> = {
    Eliminated: 'var(--lose)',
    'Bomb detonated': 'var(--t)',
    'Bomb defused': 'var(--ct)',
    'Time ran out': 'var(--muted)',
  };
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const circ = 2 * Math.PI * 52;
  let acc = 0;
  return (
    <div className="chart-wrap">
      <div className="chart-hd">
        <div className="title">Round End Reasons</div>
        <div className="leg">
          <span className="muted">{total} rounds</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div className="donut">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" stroke="#131b2a" strokeWidth="14" fill="none" />
            {entries.map(([k, v]) => {
              const frac = v / sum;
              const dash = frac * circ;
              const out = (
                <circle
                  key={k}
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke={colors[k] ?? 'var(--muted)'}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += dash;
              return out;
            })}
          </svg>
          <div className="lbl">
            <div className="v">{sum}</div>
            <div className="s">ROUNDS</div>
          </div>
        </div>
        <div className="donut-legend" style={{ flex: 1 }}>
          {entries.map(([k, v]) => (
            <div key={k} className="row">
              <i style={{ background: colors[k] ?? 'var(--muted)' }}></i>
              <span className="k">{k}</span>
              <span className="v">
                {v} <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{Math.round((v / sum) * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OverviewPage({
  match,
  onPlayerClick,
  onRoundClick,
}: {
  match: ViewModel;
  onPlayerClick: (p: VMPlayer) => void;
  onRoundClick: (n: number) => void;
}) {
  return (
    <div className="fade-in">
      <div className="sect">
        <KPIStrip match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Scoreboard</div>
          <div className="right">Click a row for player detail</div>
        </div>
        <ScoreboardTable team={match.teamA} onRowClick={onPlayerClick} />
        <ScoreboardTable team={match.teamB} onRowClick={onPlayerClick} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Highlights</div>
          <div className="right">{match.highlights.length} standouts</div>
        </div>
        <Highlights highlights={match.highlights} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Round Flow</div>
          <div className="right">Click to jump into a round</div>
        </div>
        <RoundFlow match={match} onCellClick={onRoundClick} />
      </div>
      <div className="sect">
        <div className="grid-2-1">
          <EndReasonDonut counts={match.endReasonCounts} total={match.roundFlow.length} />
          {match.records && (
            <div className="chart-wrap">
              <div className="chart-hd">
                <div className="title">Records</div>
              </div>
              {match.records.longestKill && (
                <div className="rec-row">
                  <span className="k">Longest kill</span>
                  <span className="v">
                    <b>{match.records.longestKill.player}</b> · {match.records.longestKill.distance}u
                  </span>
                </div>
              )}
              {match.records.bestRound && (
                <div className="rec-row">
                  <span className="k">Best round</span>
                  <span className="v">
                    <b>{match.records.bestRound.player}</b> · {match.records.bestRound.kills}K · R{match.records.bestRound.roundNumber}
                  </span>
                </div>
              )}
              {match.records.fastestRound && (
                <div className="rec-row">
                  <span className="k">Fastest round</span>
                  <span className="v">
                    R{match.records.fastestRound.roundNumber} · {match.records.fastestRound.durationSec.toFixed(1)}s
                  </span>
                </div>
              )}
              {match.records.slowestRound && (
                <div className="rec-row">
                  <span className="k">Slowest round</span>
                  <span className="v">
                    R{match.records.slowestRound.roundNumber} · {match.records.slowestRound.durationSec.toFixed(1)}s
                  </span>
                </div>
              )}
              <div className="rec-row">
                <span className="k">Wallbangs</span>
                <span className="v">{match.records.novelty.wallbangs}</span>
              </div>
              <div className="rec-row">
                <span className="k">Collaterals</span>
                <span className="v">{match.records.novelty.collaterals}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
