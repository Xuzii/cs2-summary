import type { ViewModel, VMTeam } from '../lib/adapter';

interface MiniRow {
  name: string;
  note?: string;
  values: Array<string | number | { label: string | number; pos?: boolean; neg?: boolean }>;
}

function MiniTable({ team, side, cols, rows }: { team: VMTeam; side: 't' | 'ct'; cols: string[]; rows: MiniRow[] }) {
  const cw = cols.length >= 9 ? 38 : cols.length >= 7 ? 44 : 52;
  const nameW = cols.length >= 9 ? '110px' : cols.length >= 7 ? '130px' : '140px';
  const style = {
    gridTemplateColumns: `minmax(${nameW}, 1.4fr) ${(cw + 'px ').repeat(cols.length).trim()}`,
  };
  return (
    <div className={`t-card ${side}`}>
      <div className="t-hd">
        <span>{team.name}</span>
        <span className="pill">{team.side}</span>
      </div>
      <div className="stat-table">
        <div className="h" style={style}>
          <div>PLAYER</div>
          {cols.map((c) => (
            <div key={c} className="v" style={{ textTransform: 'uppercase' }}>
              {c}
            </div>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="r" style={style}>
            <div className="name">
              {r.name}
              {r.note && <span className="note">{r.note}</span>}
            </div>
            {r.values.map((v, j) => {
              if (typeof v === 'object') {
                const s: React.CSSProperties = v.neg ? { color: 'var(--lose)' } : v.pos ? { color: 'var(--win)' } : {};
                return (
                  <div key={j} className="v" style={s}>
                    {v.label}
                  </div>
                );
              }
              return (
                <div key={j} className="v">
                  {v}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function OpeningDuelsRows({ match }: { match: ViewModel }) {
  const toRows = (list: ViewModel['openingDuels']['teamA']): MiniRow[] =>
    list.map((r) => ({
      name: r.name,
      note: r.note,
      values: [
        r.attempts,
        { label: r.wins, pos: r.wins > r.lost },
        { label: r.lost, neg: r.lost > r.wins },
        `${r.pct.toFixed(1)}%`,
        r.tSide,
        r.ctSide,
      ],
    }));
  return (
    <div className="two-col">
      <MiniTable
        team={match.teamA}
        side="t"
        cols={['ATT', 'W', 'L', '%', 'T-SIDE', 'CT-SIDE']}
        rows={toRows(match.openingDuels.teamA)}
      />
      <MiniTable
        team={match.teamB}
        side="ct"
        cols={['ATT', 'W', 'L', '%', 'T-SIDE', 'CT-SIDE']}
        rows={toRows(match.openingDuels.teamB)}
      />
    </div>
  );
}

function UtilitySection({ match }: { match: ViewModel }) {
  const toRows = (list: ViewModel['utility']['teamA']): MiniRow[] =>
    list.map((r) => ({
      name: r.name,
      values: [r.heDmg, r.heEfh.toFixed(1), r.fa, r.ef, `${r.blindTime.toFixed(1)}s`, r.smokes],
    }));
  return (
    <div className="two-col">
      <MiniTable
        team={match.teamA}
        side="t"
        cols={['HE', 'EF/HE', 'FA', 'EF', 'BLIND', 'SM']}
        rows={toRows(match.utility.teamA)}
      />
      <MiniTable
        team={match.teamB}
        side="ct"
        cols={['HE', 'EF/HE', 'FA', 'EF', 'BLIND', 'SM']}
        rows={toRows(match.utility.teamB)}
      />
    </div>
  );
}

function EconomySplit({ match }: { match: ViewModel }) {
  const { teamA, teamB, economy } = match;
  const row = (side: 't' | 'ct', team: VMTeam, e: ViewModel['economy']['teamA']) => (
    <div className={`econ-tile ${side}`}>
      <div className="econ-top">
        <div className="sd">{team.side}</div>
        <div className="n">{team.name}</div>
        <div className="sd" style={{ marginLeft: 'auto' }}>
          {team.score}
        </div>
      </div>
      <div className="econ-sub">HALF SPLIT · {e.half}</div>
      <div className="econ-nums">
        <div className="econ-num">
          <div className={`v ${e.pistols === 0 ? 'zero' : ''}`}>{e.pistols}</div>
          <div className="l">Pistols</div>
        </div>
        <div className="econ-num">
          <div className={`v ${e.ecos === 0 ? 'zero' : ''}`}>{e.ecos}</div>
          <div className="l">Ecos</div>
        </div>
        <div className="econ-num">
          <div className={`v ${e.forces === 0 ? 'zero' : ''}`}>{e.forces}</div>
          <div className="l">Force/Semi</div>
        </div>
        <div className="econ-num">
          <div className={`v ${e.fullBuys === 0 ? 'zero' : ''}`}>{e.fullBuys}</div>
          <div className="l">Full Buys</div>
        </div>
      </div>
    </div>
  );
  return (
    <div className="two-col">
      {row('t', teamA, economy.teamA)}
      {row('ct', teamB, economy.teamB)}
    </div>
  );
}

function ClutchesSection({ match }: { match: ViewModel }) {
  const toRows = (list: ViewModel['clutches']['teamA']): MiniRow[] =>
    list.map((r) => ({
      name: r.name,
      values: [r.c1, r.c2, r.c3, r.c4, r.c5, r.k1, r.k2, r.k3, r.k4 || '·', r.ace || '·'],
    }));
  return (
    <div className="two-col">
      <MiniTable
        team={match.teamA}
        side="t"
        cols={['1V1', '1V2', '1V3', '1V4', '1V5', '1K', '2K', '3K', '4K', 'ACE']}
        rows={toRows(match.clutches.teamA)}
      />
      <MiniTable
        team={match.teamB}
        side="ct"
        cols={['1V1', '1V2', '1V3', '1V4', '1V5', '1K', '2K', '3K', '4K', 'ACE']}
        rows={toRows(match.clutches.teamB)}
      />
    </div>
  );
}

function EntryTradeSection({ match }: { match: ViewModel }) {
  const toRows = (list: ViewModel['entryTrade']['teamA']): MiniRow[] =>
    list.map((r) => ({
      name: r.name,
      values: [r.fk, r.fd, r.traded, r.tradeFor, r.opened, r.dmgGiven, r.dmgTaken],
    }));
  return (
    <div className="two-col">
      <MiniTable
        team={match.teamA}
        side="t"
        cols={['FK', 'FD', 'TR', 'TF', 'OPN', 'DMG+', 'DMG-']}
        rows={toRows(match.entryTrade.teamA)}
      />
      <MiniTable
        team={match.teamB}
        side="ct"
        cols={['FK', 'FD', 'TR', 'TF', 'OPN', 'DMG+', 'DMG-']}
        rows={toRows(match.entryTrade.teamB)}
      />
    </div>
  );
}

function WeaponsRecords({ match }: { match: ViewModel }) {
  const topMax = Math.max(1, ...match.weaponTops.map((w) => w.kills));
  return (
    <div className="grid-3-2">
      <div className="wp-card">
        <div className="wp-hd">Top Weapons</div>
        {match.weaponTops.map((w, i) => (
          <div key={i} className="wp-row">
            <div className="n">{w.name}</div>
            <div className="bar">
              <div className="f" style={{ width: `${(w.kills / topMax) * 100}%`, animationDelay: `${i * 0.07}s` }}></div>
            </div>
            <div className="meta">
              <b>{w.kills}k</b> {w.hs}%HS
            </div>
          </div>
        ))}
      </div>
      {match.records && (
        <>
          <div className="rec-card">
            <div className="rec-hd">Records</div>
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
          </div>
          <div className="rec-card">
            <div className="rec-hd">Novelty</div>
            <div className="rec-row">
              <span className="k">Wallbangs</span>
              <span className="v">{match.records.novelty.wallbangs}</span>
            </div>
            <div className="rec-row">
              <span className="k">No-scopes</span>
              <span className="v">{match.records.novelty.noScopes}</span>
            </div>
            <div className="rec-row">
              <span className="k">Through smoke</span>
              <span className="v">{match.records.novelty.throughSmoke}</span>
            </div>
            <div className="rec-row">
              <span className="k">Collaterals</span>
              <span className="v">{match.records.novelty.collaterals}</span>
            </div>
            <div className="rec-row">
              <span className="k">Blind kills</span>
              <span className="v">{match.records.novelty.blindKills}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AimAccuracy({ match }: { match: ViewModel }) {
  const toRows = (list: ViewModel['aim']['teamA']): MiniRow[] =>
    list.map((r) => ({
      name: r.name,
      values: [
        r.shots,
        `${r.hitPct.toFixed(1)}%`,
        `${r.hsPct.toFixed(1)}%`,
        `${r.hsAccPct.toFixed(1)}%`,
        `${r.tapPct.toFixed(1)}%`,
        `${r.sprayPct.toFixed(1)}%`,
      ],
    }));
  return (
    <div className="two-col">
      <MiniTable
        team={match.teamA}
        side="t"
        cols={['SHOTS', 'HIT%', 'HS%', 'HS-A%', 'TAP%', 'SPR%']}
        rows={toRows(match.aim.teamA)}
      />
      <MiniTable
        team={match.teamB}
        side="ct"
        cols={['SHOTS', 'HIT%', 'HS%', 'HS-A%', 'TAP%', 'SPR%']}
        rows={toRows(match.aim.teamB)}
      />
    </div>
  );
}

function BombPlaysPanel({ match }: { match: ViewModel }) {
  const { bomb } = match;
  const plantsA = Math.floor((bomb.plants * bomb.siteSplit.A) / 100);
  const plantsB = bomb.plants - plantsA;
  return (
    <div className="bomb-strip">
      <div className="bomb-cell">
        <div className="l">Plants</div>
        <div className="v">{bomb.plants}</div>
        <div className="sub">
          A · {plantsA} · B · {plantsB}
        </div>
      </div>
      <div className="bomb-cell">
        <div className="l">Defuses</div>
        <div className="v">{bomb.defuses}</div>
      </div>
      <div className="bomb-cell">
        <div className="l">Top Planter</div>
        <div className="v" style={{ fontSize: 26 }}>
          {bomb.topPlanter.name}
        </div>
        <div className="sub">{bomb.topPlanter.n} plants</div>
      </div>
      <div className="bomb-cell">
        <div className="l">Top Defuser</div>
        <div className="v" style={{ fontSize: 26 }}>
          {bomb.topDefuser.name}
        </div>
        <div className="sub">{bomb.topDefuser.n} defuse</div>
      </div>
      <div className="bomb-cell split">
        <div className="l">Site Split</div>
        <div className="halves">
          <div className="half a">A {bomb.siteSplit.A}%</div>
          <div className="half b">B {bomb.siteSplit.B}%</div>
        </div>
      </div>
    </div>
  );
}

export function RoundsPage({ match }: { match: ViewModel }) {
  return (
    <div className="fade-in">
      <div className="sect" style={{ marginTop: 8 }}>
        <div className="sect-h">
          <div className="title">Round Details</div>
          <div className="right">Per-round kill feeds</div>
        </div>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', padding: 16 }}>
          {match.roundDetails.slice(0, 12).map((r) => (
            <div key={r.n} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.18em', color: 'var(--muted)' }}>
                <span>
                  R{r.n} · {r.winner}
                </span>
                <span>
                  {r.endReason} · {r.duration.toFixed(1)}s
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text)' }}>
                {r.kills.length} kills
                {r.bomb.planted && ` · bomb planted ${r.bomb.site ?? ''}${r.bomb.defused ? ' (defused)' : ''}`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailPage({ match }: { match: ViewModel }) {
  return (
    <div className="fade-in">
      <div className="sect" style={{ marginTop: 8 }}>
        <div className="sect-h">
          <div className="title">Opening Duels</div>
          <div className="right">First blood of each round</div>
        </div>
        <OpeningDuelsRows match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Utility</div>
          <div className="right">Grenades & flashes</div>
        </div>
        <UtilitySection match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Economy & Half Split</div>
          <div className="right">Buy breakdown</div>
        </div>
        <EconomySplit match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Clutches & Multi-Kills</div>
          <div className="right">1vX & multi-frag rounds</div>
        </div>
        <ClutchesSection match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Entry & Trade</div>
          <div className="right">First bloods, trade frags, open duels</div>
        </div>
        <EntryTradeSection match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Weapons & Records</div>
          <div className="right">Match highlights</div>
        </div>
        <WeaponsRecords match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Aim & Accuracy</div>
          <div className="right">Shots, hits, spray vs tap</div>
        </div>
        <AimAccuracy match={match} />
      </div>
      <div className="sect">
        <div className="sect-h">
          <div className="title">Bomb Plays</div>
          <div className="right">Plants & defuses</div>
        </div>
        <BombPlaysPanel match={match} />
      </div>
    </div>
  );
}
