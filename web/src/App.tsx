import { useEffect, useState, type ReactElement } from 'react';
import type { MatchDocument } from './types';
import { toViewModel } from './lib/adapter';
import { Shell, type PageId } from './components/Shell';
import { OverviewPage } from './components/Overview';
import { PlayerCardPage } from './components/Players';
import { RoundsPage, DetailPage } from './components/Rounds';
import { RoundDetailPage } from './components/RoundDetail';
import { Viewer2DPage } from './components/Viewer2D';
import { GrenadeFinderPage } from './components/GrenadeFinder';
import { FlashMatrixPage } from './components/FlashMatrix';
import { OpeningDuelsMapPage } from './components/OpeningDuelsMap';
import { BodyAccuracyPage } from './components/BodyAccuracy';
import { ChartsPage } from './components/Charts';
import { PastMatchesPage } from './components/PastMatches';
import './styles/new.css';

type Status =
  | { kind: 'loading' }
  | { kind: 'missing-id' }
  | { kind: 'not-found'; id: string; url: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; doc: MatchDocument };

function parseQuery(): { matchId: string | null; playerSteamId: string | null } {
  const params = new URLSearchParams(window.location.search);
  return {
    matchId: params.get('m'),
    playerSteamId: params.get('p'),
  };
}

function parseHashPage(): PageId {
  const h = (window.location.hash || '').replace(/^#/, '');
  const valid: PageId[] = ['dash', 'viewer', 'rounds', 'roundDetail', 'nades', 'charts', 'flash', 'duel', 'accuracy', 'player', 'detail', 'history'];
  return (valid as string[]).includes(h) ? (h as PageId) : 'dash';
}

function matchJsonUrl(id: string): string {
  return `${import.meta.env.BASE_URL}matches/${encodeURIComponent(id)}.json`;
}

const PAGES: PageId[] = ['dash', 'viewer', 'rounds', 'roundDetail', 'nades', 'charts', 'flash', 'duel', 'accuracy', 'player', 'detail', 'history'];

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [page, setPage] = useState<PageId>(parseHashPage());
  const [playerName, setPlayerName] = useState<string>('');
  const [activeRound, setActiveRound] = useState(1);

  // URL hash sync
  useEffect(() => {
    const onHash = () => setPage(parseHashPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (parseHashPage() !== page) {
      window.history.replaceState(null, '', `#${page}`);
    }
  }, [page]);

  useEffect(() => {
    const { matchId } = parseQuery();
    if (!matchId) {
      setStatus({ kind: 'missing-id' });
      return;
    }
    const url = matchJsonUrl(matchId);
    let cancelled = false;
    fetch(url, { cache: 'no-cache' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setStatus({ kind: 'not-found', id: matchId, url });
          return;
        }
        if (!res.ok) {
          setStatus({ kind: 'error', message: `${res.status} ${res.statusText}` });
          return;
        }
        const doc = (await res.json()) as MatchDocument;
        setStatus({ kind: 'ready', doc });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status.kind === 'loading') {
    return (
      <div className="app-loading">
        <div className="brand">CS2 · LOADING MATCH</div>
        <div>Fetching match data…</div>
      </div>
    );
  }
  if (status.kind === 'missing-id') {
    // Show Past Matches directly if no id is provided.
    return (
      <div className="app" data-density="cozy">
        <div className="main">
          <div style={{ padding: 40 }}>
            <div className="sect-h">
              <div className="title">CS2 Match Analytics</div>
              <div className="right">Pick a match below</div>
            </div>
            <div style={{ color: 'var(--muted)', marginBottom: 24 }}>
              Append <code>?m=&lt;matchId&gt;</code> to the URL to open a specific match, or click one below.
            </div>
            <PastMatchesPage currentMatchId="" />
          </div>
        </div>
      </div>
    );
  }
  if (status.kind === 'not-found') {
    return (
      <div className="app-error">
        <div className="brand">CS2 · MATCH NOT FOUND</div>
        <div>
          No match with id <code>{status.id}</code>.
        </div>
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div className="app-error">
        <div className="brand">CS2 · ERROR</div>
        <div>
          Failed to load match: <code>{status.message}</code>
        </div>
      </div>
    );
  }

  const match = toViewModel(status.doc);
  const all = [...match.teamA.players, ...match.teamB.players];
  const currentPlayer = all.find((p) => p.name === playerName) ?? all[0];
  const effectivePlayer = currentPlayer?.name ?? '';

  const openPlayer = (p: { name: string }) => {
    setPlayerName(p.name);
    setPage('player');
  };
  const openRound = (n: number) => {
    setActiveRound(n);
    setPage('viewer');
  };

  let content: ReactElement;
  switch (page) {
    case 'dash':
      content = <OverviewPage match={match} onPlayerClick={openPlayer} onRoundClick={openRound} />;
      break;
    case 'viewer':
      content = <Viewer2DPage match={match} initialRound={activeRound} />;
      break;
    case 'rounds':
      content = <RoundsPage match={match} />;
      break;
    case 'roundDetail':
      content = (
        <RoundDetailPage
          match={match}
          initialRound={activeRound}
          onJumpToTick={(n) => {
            setActiveRound(n);
            setPage('viewer');
          }}
        />
      );
      break;
    case 'nades':
      content = <GrenadeFinderPage match={match} />;
      break;
    case 'charts':
      content = <ChartsPage match={match} />;
      break;
    case 'flash':
      content = <FlashMatrixPage match={match} />;
      break;
    case 'duel':
      content = <OpeningDuelsMapPage match={match} />;
      break;
    case 'accuracy':
      content = <BodyAccuracyPage match={match} />;
      break;
    case 'player':
      content = <PlayerCardPage match={match} playerName={effectivePlayer} onPlayerChange={setPlayerName} />;
      break;
    case 'detail':
      content = <DetailPage match={match} />;
      break;
    case 'history':
      content = <PastMatchesPage currentMatchId={match.id} />;
      break;
    default:
      content = <OverviewPage match={match} onPlayerClick={openPlayer} onRoundClick={openRound} />;
  }

  return (
    <Shell page={page} onNav={setPage} match={match}>
      {content}
    </Shell>
  );
}
// Keeps TS happy in strict mode for the unused PAGES constant (used for its
// type check against the valid-list set by parseHashPage).
void PAGES;
