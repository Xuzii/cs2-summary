import type { ReactNode } from 'react';
import { Icon } from './Icons';
import type { ViewModel } from '../lib/adapter';

export type PageId =
  | 'dash'
  | 'viewer'
  | 'rounds'
  | 'roundDetail'
  | 'nades'
  | 'charts'
  | 'flash'
  | 'duel'
  | 'accuracy'
  | 'player'
  | 'detail'
  | 'history';

const GROUPS: Array<{
  lbl: string;
  items: Array<{ id: PageId; label: string; ic: string; badge?: string }>;
}> = [
  {
    lbl: 'MATCH',
    items: [
      { id: 'dash', label: 'Overview', ic: 'dash' },
      { id: 'viewer', label: '2D Round Viewer', ic: 'viewer', badge: 'NEW' },
      { id: 'rounds', label: 'Rounds', ic: 'rounds' },
      { id: 'roundDetail', label: 'Round Detail', ic: 'rounds', badge: 'NEW' },
      { id: 'nades', label: 'Grenade Finder', ic: 'nade', badge: 'NEW' },
    ],
  },
  {
    lbl: 'ANALYTICS',
    items: [
      { id: 'charts', label: 'Damage & Econ', ic: 'charts' },
      { id: 'flash', label: 'Flash Matrix', ic: 'flash' },
      { id: 'duel', label: 'Opening Duels', ic: 'duel' },
      { id: 'accuracy', label: 'Accuracy', ic: 'body' },
    ],
  },
  {
    lbl: 'PLAYERS',
    items: [
      { id: 'player', label: 'Player Card', ic: 'team' },
      { id: 'detail', label: 'Deep Stats', ic: 'acc' },
    ],
  },
  {
    lbl: 'HISTORY',
    items: [{ id: 'history', label: 'Past Matches', ic: 'hist' }],
  },
];

export function Sidebar({ page, onNav }: { page: PageId; onNav: (p: PageId) => void }) {
  return (
    <aside className="side">
      <div className="side-logo">
        <div className="glyph">C2</div>
        <div>
          <div className="t1">CS2 · DECK</div>
          <div className="t2">MATCH ANALYTICS</div>
        </div>
      </div>
      {GROUPS.map((g) => (
        <div key={g.lbl} className="side-section">
          <div className="lbl">{g.lbl}</div>
          {g.items.map((it) => (
            <div
              key={it.id}
              className={`side-item ${page === it.id ? 'on' : ''}`}
              onClick={() => onNav(it.id)}
            >
              <span className="ic">
                <Icon name={it.ic} />
              </span>
              <span className="ltxt">{it.label}</span>
              {it.badge && <span className="badge">{it.badge}</span>}
            </div>
          ))}
        </div>
      ))}
      <div className="side-foot">
        <div className="av">C2</div>
        <div className="info">
          <div className="n">VIEWER</div>
          <div className="s">MATCH ANALYTICS</div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ match }: { match: ViewModel }) {
  const dateDay = (match.date || '').split(' ')[0] ?? '';
  return (
    <div className="topbar">
      <div className="match-chip">
        <span className="dot"></span>
        <span>ACTIVE MATCH · {match.mapPretty}</span>
      </div>
      <input className="search" placeholder="SEARCH PLAYER · WEAPON · ROUND..." />
      <div className="spacer"></div>
      <div className="meta-bit">
        DATE <b>{dateDay}</b>
      </div>
      <div className="meta-bit">
        DUR <b>{match.durationLabel}</b>
      </div>
      <div className="meta-bit">
        TICK <b>{match.playback?.tickrate ?? 64}</b>
      </div>
    </div>
  );
}

export function HeroStrip({ match }: { match: ViewModel }) {
  const { teamA, teamB } = match;
  const aWon = teamA.score > teamB.score;
  const mvp = [...teamA.players, ...teamB.players].reduce((a, b) => (a.rating > b.rating ? a : b));
  const winnerName = aWon ? teamA.name : teamB.name;
  return (
    <div className="hero-strip">
      <div className="hero-inner">
        <div className={`hero-team ${teamA.side.toLowerCase()}`}>
          <div className="sig">{teamA.side}</div>
          <div>
            <div className="hname">{teamA.name}</div>
            <div className="hmeta">
              {teamA.side === 'T' ? 'T ▸ CT' : 'CT ▸ T'}
              <span className="tag">5 PLAYERS</span>
            </div>
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
            <div className="hmeta">
              <span className="tag">5 PLAYERS</span>
              {teamB.side === 'CT' ? 'T ▸ CT' : 'CT ▸ T'}
            </div>
          </div>
          <div className="sig">{teamB.side}</div>
        </div>
      </div>
      <div className="hero-bottom">
        <div className="ribbon">
          <span className="dot"></span>
          {winnerName} WINS · {match.mapPretty} · {match.durationLabel}
        </div>
        <div className="split-meta">
          <span>
            1H
            <b>
              {teamA.firstHalf.score}–{teamB.firstHalf.score}
            </b>
          </span>
          <span>
            2H
            <b>
              {teamA.secondHalf.score}–{teamB.secondHalf.score}
            </b>
          </span>
          <span>
            MVP<b>{mvp.name}</b>
          </span>
          <span>
            RATING<b>{mvp.rating.toFixed(2)}</b>
          </span>
        </div>
      </div>
    </div>
  );
}

export function FooterBar({ page, match }: { page: PageId; match: ViewModel }) {
  return (
    <div className="footer">
      <div>CS2 · {page.toUpperCase()}</div>
      <div>SRC · {match.serverName}</div>
      <div>{match.date}</div>
    </div>
  );
}

export function Shell({
  page,
  onNav,
  match,
  children,
}: {
  page: PageId;
  onNav: (p: PageId) => void;
  match: ViewModel;
  children: ReactNode;
}) {
  return (
    <div className="app" data-density="cozy">
      <Sidebar page={page} onNav={onNav} />
      <div className="main">
        <Topbar match={match} />
        <HeroStrip match={match} />
        <div className="page">{children}</div>
        <FooterBar page={page} match={match} />
      </div>
    </div>
  );
}
