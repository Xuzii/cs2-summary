// Page 2: Detailed Stats
function MiniTable({ team, side, cols, rows }) {
  const colCount = cols.length + 1;
  const cw = cols.length >= 9 ? 38 : cols.length >= 7 ? 44 : 52;
  const nameW = cols.length >= 9 ? '110px' : cols.length >= 7 ? '130px' : '140px';
  const style = { gridTemplateColumns: `minmax(${nameW}, 1.4fr) ${(cw+'px ').repeat(cols.length).trim()}` };
  return (
    <div className={`t-card ${side}`}>
      <div className="t-hd">
        <span>{team.name}</span>
        <span className="pill">{side === 't' ? team.side : team.side}</span>
      </div>
      <div className="stat-table">
        <div className="h" style={style}>
          <div>PLAYER</div>
          {cols.map(c => <div key={c} className="v" style={{textTransform:'uppercase'}}>{c}</div>)}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="r" style={style}>
            <div className="name">
              {r.name}
              {r.note && <span className="note">{r.note}</span>}
            </div>
            {r.values.map((v, j) => (
              <div key={j} className="v" style={v.neg ? {color:'var(--lose)'} : v.pos ? {color:'var(--win)'} : {}}>{v.label ?? v}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function OpeningDuels({ match }) {
  const toRows = (list, team) => list.map(r => {
    const orig = team.players.find(p => p.name === r.name);
    return {
      name: r.name, note: orig?.note,
      values: [
        r.attempts,
        { label: r.wins, pos: r.wins > r.lost },
        { label: r.lost, neg: r.lost > r.wins },
        `${r.pct.toFixed(1)}%`,
        r.tSide,
        r.ctSide,
      ],
    };
  });
  return (
    <div className="two-col">
      <MiniTable team={match.teamA} side="t"
        cols={['ATT', 'W', 'L', '%', 'T-SIDE', 'CT-SIDE']}
        rows={toRows(match.openingDuels.teamA, match.teamA)}/>
      <MiniTable team={match.teamB} side="ct"
        cols={['ATT', 'W', 'L', '%', 'T-SIDE', 'CT-SIDE']}
        rows={toRows(match.openingDuels.teamB, match.teamB)}/>
    </div>
  );
}

function UtilitySection({ match }) {
  const toRows = (list, team) => list.map(r => {
    const orig = team.players.find(p => p.name === r.name);
    return {
      name: r.name, note: orig?.note,
      values: [r.heDmg, r.heEfh, r.fa, r.ef, r.blindTime + 's', r.smokes],
    };
  });
  return (
    <div className="two-col">
      <MiniTable team={match.teamA} side="t"
        cols={['HE', 'EF/HE', 'FA', 'EF', 'BLIND', 'SM']}
        rows={toRows(match.utility.teamA, match.teamA)}/>
      <MiniTable team={match.teamB} side="ct"
        cols={['HE', 'EF/HE', 'FA', 'EF', 'BLIND', 'SM']}
        rows={toRows(match.utility.teamB, match.teamB)}/>
    </div>
  );
}

function EconomySplit({ match }) {
  const { teamA, teamB, economy } = match;
  return (
    <div className="two-col">
      <div className="econ-tile t">
        <div className="econ-top">
          <div className="sd">T</div>
          <div className="n">{teamA.name}</div>
          <div className="sd" style={{marginLeft:'auto'}}>{teamA.score}</div>
        </div>
        <div className="econ-sub">HALF SPLIT · {economy.teamA.half}</div>
        <div className="econ-nums">
          <div className="econ-num"><div className={`v ${economy.teamA.pistols===0?'zero':''}`}>{economy.teamA.pistols}</div><div className="l">Pistols</div></div>
          <div className="econ-num"><div className={`v ${economy.teamA.ecos===0?'zero':''}`}>{economy.teamA.ecos}</div><div className="l">Ecos</div></div>
          <div className="econ-num"><div className={`v ${economy.teamA.forces===0?'zero':''}`}>{economy.teamA.forces}</div><div className="l">Force/Semi</div></div>
          <div className="econ-num"><div className={`v ${economy.teamA.fullBuys===0?'zero':''}`}>{economy.teamA.fullBuys}</div><div className="l">Full Buys</div></div>
        </div>
      </div>
      <div className="econ-tile ct">
        <div className="econ-top">
          <div className="sd">CT</div>
          <div className="n">{teamB.name}</div>
          <div className="sd" style={{marginLeft:'auto'}}>{teamB.score}</div>
        </div>
        <div className="econ-sub">HALF SPLIT · {economy.teamB.half}</div>
        <div className="econ-nums">
          <div className="econ-num"><div className={`v ${economy.teamB.pistols===0?'zero':''}`}>{economy.teamB.pistols}</div><div className="l">Pistols</div></div>
          <div className="econ-num"><div className={`v ${economy.teamB.ecos===0?'zero':''}`}>{economy.teamB.ecos}</div><div className="l">Ecos</div></div>
          <div className="econ-num"><div className={`v ${economy.teamB.forces===0?'zero':''}`}>{economy.teamB.forces}</div><div className="l">Force/Semi</div></div>
          <div className="econ-num"><div className={`v ${economy.teamB.fullBuys===0?'zero':''}`}>{economy.teamB.fullBuys}</div><div className="l">Full Buys</div></div>
        </div>
      </div>
    </div>
  );
}

function ClutchesSection({ match }) {
  const toRows = (list, team) => list.map(r => {
    const orig = team.players.find(p => p.name === r.name);
    return {
      name: r.name, note: orig?.note,
      values: [r.c1, r.c2, r.c3, r.c4, r.c5, r.k1, r.k2, r.k3, r.k4 || '·', r.ace || '·'],
    };
  });
  return (
    <div className="two-col">
      <MiniTable team={match.teamA} side="t"
        cols={['1V1','1V2','1V3','1V4','1V5','1K','2K','3K','4K','ACE']}
        rows={toRows(match.clutches.teamA, match.teamA)}/>
      <MiniTable team={match.teamB} side="ct"
        cols={['1V1','1V2','1V3','1V4','1V5','1K','2K','3K','4K','ACE']}
        rows={toRows(match.clutches.teamB, match.teamB)}/>
    </div>
  );
}

function EntryTradeSection({ match }) {
  const toRows = (list, team) => list.map(r => {
    const orig = team.players.find(p => p.name === r.name);
    return {
      name: r.name, note: orig?.note,
      values: [r.fk, r.fd, r.traded, r.tradeFor, r.opened, r.dmgGiven, r.dmgTaken],
    };
  });
  return (
    <div className="two-col">
      <MiniTable team={match.teamA} side="t"
        cols={['FK','FD','TR','TF','OPN','DMG+','DMG-']}
        rows={toRows(match.entryTrade.teamA, match.teamA)}/>
      <MiniTable team={match.teamB} side="ct"
        cols={['FK','FD','TR','TF','OPN','DMG+','DMG-']}
        rows={toRows(match.entryTrade.teamB, match.teamB)}/>
    </div>
  );
}

function WeaponsRecords({ match }) {
  const topMax = Math.max(...match.weaponTops.map(w => w.kills));
  return (
    <div className="grid-3-2">
      <div className="wp-card">
        <div className="wp-hd">Top Weapons</div>
        {match.weaponTops.map((w, i) => (
          <div key={i} className="wp-row">
            <div className="n">{w.name}</div>
            <div className="bar"><div className="f" style={{width: `${(w.kills / topMax) * 100}%`, animationDelay: `${i * 0.07}s`}}></div></div>
            <div className="meta"><b>{w.kills}k</b> {w.hs}%HS</div>
          </div>
        ))}
      </div>
      <div className="rec-card">
        <div className="rec-hd">Records</div>
        <div className="rec-row"><span className="k">Longest kill</span><span className="v"><b>{match.records.longestKill.player}</b> · {match.records.longestKill.distance}u</span></div>
        <div className="rec-row"><span className="k">Best round</span><span className="v"><b>{match.records.bestRound.player}</b> · {match.records.bestRound.kills}K · R{match.records.bestRound.roundNumber}</span></div>
        <div className="rec-row"><span className="k">Fastest round</span><span className="v">R{match.records.fastestRound.roundNumber} · {match.records.fastestRound.durationSec.toFixed(1)}s · {match.records.fastestRound.winnerSide}</span></div>
        <div className="rec-row"><span className="k">Slowest round</span><span className="v">R{match.records.slowestRound.roundNumber} · {match.records.slowestRound.durationSec.toFixed(1)}s · {match.records.slowestRound.winnerSide}</span></div>
      </div>
      <div className="rec-card">
        <div className="rec-hd">Novelty</div>
        <div className="rec-row"><span className="k">Wallbangs</span><span className="v">{match.records.novelty.wallbangs}</span></div>
        <div className="rec-row"><span className="k">No-scopes</span><span className="v">{match.records.novelty.noScopes}</span></div>
        <div className="rec-row"><span className="k">Through smoke</span><span className="v">{match.records.novelty.throughSmoke}</span></div>
        <div className="rec-row"><span className="k">Collaterals</span><span className="v">{match.records.novelty.collaterals}</span></div>
        <div className="rec-row"><span className="k">Blind kills</span><span className="v">{match.records.novelty.blindKills}</span></div>
      </div>
    </div>
  );
}

function AimAccuracy({ match }) {
  const toRows = (list, team) => list.map(r => {
    const orig = team.players.find(p => p.name === r.name);
    return {
      name: r.name, note: orig?.note,
      values: [r.shots, r.hitPct+'%', r.hsPct+'%', r.hsAccPct+'%', r.tapPct+'%', r.sprayPct+'%'],
    };
  });
  return (
    <div className="two-col">
      <MiniTable team={match.teamA} side="t"
        cols={['SHOTS','HIT%','HS%','HS-A%','TAP%','SPR%']}
        rows={toRows(match.aim.teamA, match.teamA)}/>
      <MiniTable team={match.teamB} side="ct"
        cols={['SHOTS','HIT%','HS%','HS-A%','TAP%','SPR%']}
        rows={toRows(match.aim.teamB, match.teamB)}/>
    </div>
  );
}

function BombPlays({ match }) {
  const { bomb } = match;
  return (
    <div className="bomb-strip">
      <div className="bomb-cell">
        <div className="l">Plants</div>
        <div className="v">{bomb.plants}</div>
        <div className="sub">A · {Math.floor(bomb.plants * bomb.siteSplit.A / 100)} · B · {bomb.plants - Math.floor(bomb.plants * bomb.siteSplit.A / 100)}</div>
      </div>
      <div className="bomb-cell">
        <div className="l">Defuses</div>
        <div className="v">{bomb.defuses}</div>
      </div>
      <div className="bomb-cell">
        <div className="l">Top Planter</div>
        <div className="v" style={{fontSize:26}}>{bomb.topPlanter.name}</div>
        <div className="sub">{bomb.topPlanter.n} plants</div>
      </div>
      <div className="bomb-cell">
        <div className="l">Top Defuser</div>
        <div className="v" style={{fontSize:26}}>{bomb.topDefuser.name}</div>
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

function DetailPage({ match }) {
  return (
    <div className="fade-in">
      <div className="sect" style={{marginTop: 8}}>
        <div className="sect-h"><div className="title">Opening Duels</div><div className="right">First blood of each round</div></div>
        <OpeningDuels match={match}/>
      </div>
      <div className="sect">
        <div className="sect-h"><div className="title">Utility</div><div className="right">Grenades & flashes</div></div>
        <UtilitySection match={match}/>
      </div>
      <div className="sect">
        <div className="sect-h"><div className="title">Economy & Half Split</div><div className="right">Buy breakdown</div></div>
        <EconomySplit match={match}/>
      </div>
      <div className="sect">
        <div className="sect-h"><div className="title">Clutches & Multi-Kills</div><div className="right">1vX & multi-frag rounds</div></div>
        <ClutchesSection match={match}/>
      </div>
      <div className="sect">
        <div className="sect-h"><div className="title">Entry & Trade</div><div className="right">First bloods, trade frags, open duels</div></div>
        <EntryTradeSection match={match}/>
      </div>
      <div className="sect">
        <div className="sect-h"><div className="title">Weapons & Records</div><div className="right">Match highlights</div></div>
        <WeaponsRecords match={match}/>
      </div>
      <div className="sect">
        <div className="sect-h"><div className="title">Aim & Accuracy</div><div className="right">Shots, hits, spray vs tap</div></div>
        <AimAccuracy match={match}/>
      </div>
      <div className="sect">
        <div className="sect-h"><div className="title">Bomb Plays</div><div className="right">Plants & defuses</div></div>
        <BombPlays match={match}/>
      </div>
    </div>
  );
}

Object.assign(window, { DetailPage });
