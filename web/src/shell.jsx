// Shell: sidebar + topbar + hero
const { useState: useStSh } = React;

function Icon({ name }) {
  const paths = {
    dash:       'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
    viewer:     'M3 3h18v14H3zM8 20l4-3 4 3v1H8z',
    nade:       'M12 2l2 3h3l-2 4 3 2-3 2 2 4h-3l-2 3-2-3H7l2-4-3-2 3-2-2-4h3z',
    rounds:     'M4 5h16v2H4zM4 11h16v2H4zM4 17h16v2H4zM1 5h2v2H1zM1 11h2v2H1zM1 17h2v2H1z',
    charts:     'M3 21V3h2v16h16v2zm4-3v-7h3v7zm5 0V7h3v11zm5 0v-4h3v4z',
    flash:      'M13 2L4 14h6l-1 8 9-12h-6z',
    duel:       'M14 2l6 6-2 2-2-2-7 7 2 2-2 2-6-6 2-2 2 2 7-7-2-2zM2 18l4-4 2 2-4 4zm14-14l4 4-2 2-4-4z',
    body:       'M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-4 8h8v4l-1 8h-2l-1-5-1 5H9l-1-8z',
    acc:        'M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8zM12 6v6h6a6 6 0 1 1-6-6z',
    team:       'M12 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM4 22a8 8 0 0 1 16 0z',
    settings:   'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm9 3l-2 .3-.5 1.3 1.3 1.6-1.4 1.4-1.6-1.3-1.3.5-.3 2h-2l-.3-2-1.3-.5-1.6 1.3-1.4-1.4 1.3-1.6-.5-1.3L4 12l2-.3.5-1.3-1.3-1.6 1.4-1.4 1.6 1.3 1.3-.5.3-2h2l.3 2 1.3.5 1.6-1.3 1.4 1.4-1.3 1.6.5 1.3z',
    hist:       'M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-2-5l-3 3h8V2z',
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d={paths[name] || paths.dash} />
    </svg>
  );
}

function Sidebar({ page, onNav }) {
  const groups = [
    { lbl: 'MATCH', items: [
      { id: 'dash',    label: 'Overview',        ic: 'dash' },
      { id: 'viewer',  label: '2D Round Viewer', ic: 'viewer', badge: 'NEW' },
      { id: 'rounds',  label: 'Rounds',          ic: 'rounds' },
      { id: 'nades',   label: 'Grenade Finder',  ic: 'nade',   badge: 'NEW' },
    ]},
    { lbl: 'ANALYTICS', items: [
      { id: 'charts',  label: 'Damage & Econ',   ic: 'charts' },
      { id: 'flash',   label: 'Flash Matrix',    ic: 'flash' },
      { id: 'duel',    label: 'Opening Duels',   ic: 'duel' },
      { id: 'accuracy',label: 'Accuracy',        ic: 'body' },
    ]},
    { lbl: 'PLAYERS', items: [
      { id: 'player',  label: 'Player Card',     ic: 'team' },
      { id: 'detail',  label: 'Deep Stats',      ic: 'acc' },
    ]},
    { lbl: 'HISTORY', items: [
      { id: 'history', label: 'Past Matches',    ic: 'hist' },
    ]},
  ];
  return (
    <aside className="side">
      <div className="side-logo">
        <div className="glyph">C2</div>
        <div>
          <div className="t1">CS2 · DECK</div>
          <div className="t2">MATCH ANALYTICS</div>
        </div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} className="side-section">
          <div className="lbl">{g.lbl}</div>
          {g.items.map(it => (
            <div key={it.id} className={`side-item ${page === it.id ? 'on' : ''}`} onClick={() => onNav(it.id)}>
              <span className="ic"><Icon name={it.ic}/></span>
              <span className="ltxt">{it.label}</span>
              {it.badge && <span className="badge">{it.badge}</span>}
            </div>
          ))}
        </div>
      ))}
      <div className="side-foot">
        <div className="av">MZ</div>
        <div className="info">
          <div className="n">MaZ</div>
          <div className="s">STEAM · RANK S+</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ match, onNavHistory }) {
  return (
    <div className="topbar">
      <div className="match-chip">
        <span className="dot"></span>
        <span>ACTIVE MATCH · {match.mapPretty}</span>
      </div>
      <input className="search" placeholder="SEARCH PLAYER · WEAPON · ROUND..." />
      <div className="spacer"></div>
      <div className="meta-bit">DATE <b>{match.date.split(' ')[0]}</b></div>
      <div className="meta-bit">DUR <b>{match.durationLabel}</b></div>
      <div className="meta-bit">TICK <b>64</b></div>
    </div>
  );
}

function HeroStrip({ match }) {
  const { teamA, teamB } = match;
  const aWon = teamA.score > teamB.score;
  const mvp = [...teamA.players, ...teamB.players].reduce((a, b) => a.rating > b.rating ? a : b);
  const winnerName = aWon ? teamA.name : teamB.name;
  return (
    <div className="hero-strip">
      <div className="hero-inner">
        <div className={`hero-team ${teamA.side.toLowerCase()}`}>
          <div className="sig">{teamA.side}</div>
          <div>
            <div className="hname">{teamA.name}</div>
            <div className="hmeta">{teamA.side === 'T' ? 'T ▸ CT' : 'CT ▸ T'}<span className="tag">5 PLAYERS</span></div>
          </div>
        </div>
        <div className="hero-score">
          <div className={`s ${aWon ? 'win' : 'lose'}`}>{teamA.score}</div>
          <div className="dash">–</div>
          <div className={`s ${!aWon ? 'win' : 'lose'}`}>{teamB.score}</div>
        </div>
        <div className={`hero-team right ${teamB.side.toLowerCase()}`}>
          <div>
            <div className="hname">{teamB.name}</div>
            <div className="hmeta"><span className="tag">5 PLAYERS</span>{teamB.side === 'CT' ? 'T ▸ CT' : 'CT ▸ T'}</div>
          </div>
          <div className="sig">{teamB.side}</div>
        </div>
      </div>
      <div className="hero-bottom">
        <div className="ribbon"><span className="dot"></span>{winnerName} WINS · {match.mapPretty} · {match.durationLabel}</div>
        <div className="split-meta">
          <span>1H<b>{teamA.firstHalf.score}–{teamB.firstHalf.score}</b></span>
          <span>2H<b>{teamA.secondHalf.score}–{teamB.secondHalf.score}</b></span>
          <span>MVP<b>{mvp.name}</b></span>
          <span>RATING<b>{mvp.rating.toFixed(2)}</b></span>
        </div>
      </div>
    </div>
  );
}

function FooterBar({ page, match }) {
  return (
    <div className="footer">
      <div>CS2 · {page.toUpperCase()}</div>
      <div>SRC VALVE · {match.serverName}</div>
      <div>{match.date}</div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, HeroStrip, FooterBar, Icon });
