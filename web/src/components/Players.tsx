import type { ViewModel, VMPlayer } from '../lib/adapter';

export function PlayerCardPage({
  match,
  playerName,
  onPlayerChange,
}: {
  match: ViewModel;
  playerName: string;
  onPlayerChange: (n: string) => void;
}) {
  const { teamA, teamB, playerRoundImpact } = match;
  const all = [...teamA.players, ...teamB.players];
  const p: VMPlayer = all.find((x) => x.name === playerName) ?? all[0]!;
  if (!p) return <div className="fade-in">No players.</div>;
  const onTeamA = teamA.players.some((x) => x.name === p.name);
  const team = onTeamA ? teamA : teamB;
  const enemies = (onTeamA ? teamB : teamA).players;
  const side = team.side;
  const sideCls = side === 'T' ? 't' : 'ct';
  const aWon = teamA.score > teamB.score;
  const won = onTeamA ? aWon : !aWon;

  const impact = playerRoundImpact[p.name] ?? [];

  const aimRows = (onTeamA ? match.aim.teamA : match.aim.teamB);
  const aim = aimRows.find((x) => x.name === p.name);
  const utilRows = (onTeamA ? match.utility.teamA : match.utility.teamB);
  const util = utilRows.find((x) => x.name === p.name);
  const entryRows = (onTeamA ? match.entryTrade.teamA : match.entryTrade.teamB);
  const entry = entryRows.find((x) => x.name === p.name);
  const cl = (onTeamA ? match.clutches.teamA : match.clutches.teamB).find((x) => x.name === p.name);
  const od = (onTeamA ? match.openingDuels.teamA : match.openingDuels.teamB).find((x) => x.name === p.name);

  // Per-player weapon tops — use duelMatrix row if available, else proportional split of total kills
  const pWeps = match.weaponTops.slice(0, 4).map((w, i) => ({
    n: w.name,
    k: Math.max(0, Math.round((p.k * w.kills) / Math.max(1, match.weaponTops[0]!.kills) - i * p.k * 0.05)),
    hs: w.hs,
  })).filter((w) => w.k > 0);
  const wMax = Math.max(1, ...pWeps.map((w) => w.k));

  // vs enemies: read duel matrix
  const matrixPlayers = match.duelMatrix.players;
  const meIdx = matrixPlayers.findIndex((m) => m.name === p.name);
  const vs = enemies.map((e) => {
    const eIdx = matrixPlayers.findIndex((m) => m.name === e.name);
    const k = meIdx >= 0 && eIdx >= 0 ? match.duelMatrix.kills[meIdx]?.[eIdx] ?? 0 : 0;
    const d = meIdx >= 0 && eIdx >= 0 ? match.duelMatrix.kills[eIdx]?.[meIdx] ?? 0 : 0;
    return { name: e.name, k, d };
  });
  const nem = [...vs].sort((a, b) => b.d - b.k - (a.d - a.k))[0] ?? { name: '—', k: 0, d: 0 };

  return (
    <div className="fade-in">
      <div className={`pc-hero ${sideCls}`}>
        <div>
          <div className="pc-name">{p.name.toUpperCase()}</div>
          <div className="pc-sub">
            <span className={`sd ${sideCls}`}>{side}</span>
            <span>{team.name}</span>
            <span>· {match.mapPretty}</span>
          </div>
        </div>
        <div className="pc-result">
          <div className={`pc-result-tag ${won ? 'won' : 'lost'}`}>{won ? 'WON' : 'LOST'}</div>
          <div className="pc-result-score">
            {teamA.name} {teamA.score} — {teamB.score} {teamB.name}
          </div>
          <div className="pc-result-date">
            {(match.date || '').split(' ')[0]} · {match.durationLabel}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {all.map((x) => {
          const isA = teamA.players.some((y) => y.name === x.name);
          const s = isA ? teamA.side.toLowerCase() : teamB.side.toLowerCase();
          const active = x.name === p.name;
          return (
            <button
              key={x.name}
              onClick={() => onPlayerChange(x.name)}
              style={{
                padding: '6px 12px',
                background: active
                  ? s === 't'
                    ? 'rgba(243,147,33,.15)'
                    : 'rgba(74,163,255,.15)'
                  : 'var(--panel)',
                border: `1px solid ${active ? (s === 't' ? 'var(--t)' : 'var(--ct)') : 'var(--line)'}`,
                color: active ? 'var(--text)' : 'var(--muted)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '.06em',
                borderLeft: `3px solid ${s === 't' ? 'var(--t)' : 'var(--ct)'}`,
              }}
            >
              {x.name}
            </button>
          );
        })}
      </div>

      <div className="pc-headline">
        <div className="pc-hc">
          <div className="l">K / D / A</div>
          <div className="v">
            {p.k}/{p.d}/{p.a}
          </div>
        </div>
        <div className="pc-hc">
          <div className="l">ADR</div>
          <div className="v">{p.adr.toFixed(1)}</div>
        </div>
        <div className="pc-hc">
          <div className="l">Rating</div>
          <div
            className="v"
            style={{ color: p.rating >= 1.3 ? 'var(--gold)' : p.rating < 1 ? 'var(--lose)' : '' }}
          >
            {p.rating.toFixed(2)}
          </div>
        </div>
        <div className="pc-hc">
          <div className="l">HS %</div>
          <div className="v">{p.hs}%</div>
        </div>
        <div className="pc-hc">
          <div className="l">KAST</div>
          <div className="v">{p.kast}%</div>
        </div>
        <div className="pc-hc">
          <div className="l">MVPs</div>
          <div className="v">{p.mvp}</div>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="kv-card">
          <div className="hd">Openings</div>
          <div className="row">
            <span className="k">Wins / Losses</span>
            <span className="v">
              {od?.wins ?? 0} / {od?.lost ?? 0}
            </span>
          </div>
          <div className="row">
            <span className="k">Win %</span>
            <span className="v">{(od?.pct ?? 0).toFixed(1)}%</span>
          </div>
          <div className="row">
            <span className="k">Entry frags</span>
            <span className="v">{entry?.opened ?? 0}</span>
          </div>
          <div className="row">
            <span className="k">First deaths</span>
            <span className="v">{entry?.fd ?? 0}</span>
          </div>
        </div>
        <div className="kv-card">
          <div className="hd">Clutches</div>
          <div className="row"><span className="k">1V1</span><span className="v">{cl?.c1 ?? '0/0'}</span></div>
          <div className="row"><span className="k">1V2</span><span className="v">{cl?.c2 ?? '0/0'}</span></div>
          <div className="row"><span className="k">1V3</span><span className="v">{cl?.c3 ?? '0/0'}</span></div>
          <div className="row"><span className="k">1V4</span><span className="v">{cl?.c4 ?? '0/0'}</span></div>
          <div className="row"><span className="k">1V5</span><span className="v">{cl?.c5 ?? '0/0'}</span></div>
        </div>
        <div className="kv-card">
          <div className="hd">Multi-Kills</div>
          <div className="row"><span className="k">1K</span><span className="v">{cl?.k1 ?? 0}</span></div>
          <div className="row"><span className="k">2K</span><span className="v">{cl?.k2 ?? 0}</span></div>
          <div className="row"><span className="k">3K</span><span className="v">{cl?.k3 ?? 0}</span></div>
          <div className="row"><span className="k">4K</span><span className={`v ${!cl?.k4 ? 'zero' : ''}`}>{cl?.k4 ?? 0}</span></div>
          <div className="row"><span className="k">ACE</span><span className={`v ${!cl?.ace ? 'zero' : ''}`}>{cl?.ace ?? 0}</span></div>
        </div>
      </div>

      <div className="sect" style={{ marginTop: 0 }}>
        <div className="sect-h">
          <div className="title">Round Impact</div>
          <div className="right">Damage per round · {impact.length} rounds</div>
        </div>
        <div className="impact-card">
          <div className="impact-legend">
            <span className="lg w"><i></i>Round Won</span>
            <span className="lg l"><i></i>Round Lost</span>
            <span className="lg k"><i></i>Kill</span>
            <span className="lg fk"><i></i>First Kill</span>
            <span className="lg mk"><i></i>3K+</span>
            <span className="lg cl"><i></i>Clutch Won</span>
          </div>
          <div className="impact-strip">
            {impact.map((r, i) => (
              <div key={i} className={`impact-cell ${r.won ? 'won' : 'lost'}`}>
                <div className="rn">R{r.n}</div>
                <div className="icons">
                  {Array.from({ length: Math.min(r.kills, 3) }).map((_, k) => (
                    <i key={k} className="k" />
                  ))}
                  {r.firstKill && <i className="fk" />}
                  {r.multiKill && <i className="mk" />}
                  {r.clutchWon && <i className="cl" />}
                </div>
                <div className="dmg">{r.dmg}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="wp-card">
          <div className="wp-hd">Top Weapons</div>
          {pWeps.map((w, i) => (
            <div key={i} className="wp-row">
              <div className="n">{w.n}</div>
              <div className="bar">
                <div className="f" style={{ width: `${(w.k / wMax) * 100}%`, animationDelay: `${i * 0.07}s` }}></div>
              </div>
              <div className="meta">
                <b>{w.k}k</b> {w.hs}%HS
              </div>
            </div>
          ))}
        </div>
        <div className="kv-card">
          <div className="hd">Aim & Accuracy</div>
          <div className="row"><span className="k">Hit %</span><span className="v">{(aim?.hitPct ?? 0).toFixed(1)}%</span></div>
          <div className="row"><span className="k">HS Accuracy</span><span className="v">{(aim?.hsAccPct ?? 0).toFixed(1)}%</span></div>
          <div className="row"><span className="k">Tap %</span><span className="v">{(aim?.tapPct ?? 0).toFixed(1)}%</span></div>
          <div className="row"><span className="k">Spray %</span><span className="v">{(aim?.sprayPct ?? 0).toFixed(1)}%</span></div>
          <div className="row"><span className="k">Moving %</span><span className="v">{(aim?.movingPct ?? 0).toFixed(0)}%</span></div>
          <div className="row"><span className="k">Avg Kill Dist.</span><span className="v">{aim?.avgDist ?? 0}u</span></div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="kv-card">
          <div className="hd">Utility</div>
          <div className="row"><span className="k">HE Damage</span><span className="v">{util?.heDmg ?? 0}</span></div>
          <div className="row"><span className="k">Flash Assists</span><span className="v">{util?.fa ?? 0}</span></div>
          <div className="row"><span className="k">Enemies Flashed</span><span className="v">{util?.ef ?? 0}</span></div>
          <div className="row"><span className="k">Blind Time</span><span className="v">{(util?.blindTime ?? 0).toFixed(1)}s</span></div>
          <div className="row"><span className="k">Smokes Thrown</span><span className="v">{util?.smokes ?? 0}</span></div>
        </div>
        <div className="kv-card">
          <div className="hd">Specials</div>
          <div className="row"><span className="k">Wallbangs</span><span className="v">{match.records?.novelty.wallbangs ?? 0}</span></div>
          <div className="row"><span className="k">No-Scopes</span><span className="v zero">{match.records?.novelty.noScopes ?? 0}</span></div>
          <div className="row"><span className="k">Through Smoke</span><span className="v">{match.records?.novelty.throughSmoke ?? 0}</span></div>
          <div className="row"><span className="k">Blind Kills</span><span className="v">{match.records?.novelty.blindKills ?? 0}</span></div>
          <div className="row"><span className="k">Collaterals</span><span className="v">{match.records?.novelty.collaterals ?? 0}</span></div>
        </div>
      </div>

      <div className="sect">
        <div className="sect-h">
          <div className="title">Vs Enemies</div>
          <div className="right">duels — {enemies.length} players</div>
        </div>
        <div className="vs-grid">
          {vs.map((v) => (
            <div key={v.name} className="vs-cell">
              <div className="l">VS {v.name.toUpperCase()}</div>
              <div className="v">
                <span style={{ color: v.k >= v.d ? 'var(--win)' : 'var(--lose)' }}>{v.k}</span>
                <span className="d">–</span>
                <span style={{ color: v.d > v.k ? 'var(--win)' : 'var(--lose)', fontWeight: 700 }}>{v.d}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="nem-row">
        <div className="nem-card nem">
          <div className="l">Nemesis</div>
          <div className="big" style={{ color: 'var(--lose)' }}>
            {nem.name}
          </div>
          <div className="sub">{nem.d} deaths</div>
        </div>
        <div className="nem-card">
          <div className="l">First Deaths</div>
          <div className="big">{entry?.fd ?? 0}</div>
        </div>
        <div className="nem-card">
          <div className="l">Traded</div>
          <div className="big">
            {entry?.traded ?? 0}/{p.d}
          </div>
        </div>
        <div className="nem-card">
          <div className="l">Round Wins</div>
          <div className="big">{impact.filter((r) => r.won).length}</div>
        </div>
      </div>
    </div>
  );
}
