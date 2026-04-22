import { useEffect, useState } from 'react';
import type { MatchIndexEntry } from '../types';

export function PastMatchesPage({ currentMatchId }: { currentMatchId: string }) {
  const [entries, setEntries] = useState<MatchIndexEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}matches/index.json`;
    fetch(url, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((data) => setEntries(Array.isArray(data) ? (data as MatchIndexEntry[]) : []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  if (err) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">Past Matches</div>
          <div className="right">Index not available</div>
        </div>
        <div style={{ padding: 16, background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
          Could not load matches/index.json: {err}. The index is written by the pipeline on publish; once you've
          published at least one match, this page will populate.
        </div>
      </div>
    );
  }
  if (!entries) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">Past Matches</div>
          <div className="right">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Past Matches</div>
        <div className="right">
          Recent playlist · {entries.length} match{entries.length === 1 ? '' : 'es'}
        </div>
      </div>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 120px 140px 140px 100px',
            padding: '10px 16px',
            background: 'var(--panel-2)',
            fontSize: 9,
            color: 'var(--subtle)',
            letterSpacing: '.24em',
            fontWeight: 700,
            textTransform: 'uppercase',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div>STATUS</div>
          <div>MAP</div>
          <div>RESULT</div>
          <div>MVP</div>
          <div>DATE</div>
          <div style={{ textAlign: 'right' }}>DURATION</div>
        </div>
        {entries.map((m) => {
          const result = `${m.teamA.score}—${m.teamB.score}`;
          const won = m.winner === 'A';
          const isCurrent = m.id === currentMatchId;
          const dateDisplay = m.date ? m.date.slice(0, 10) : '—';
          return (
            <a
              key={m.id}
              href={`?m=${encodeURIComponent(m.id)}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 120px 140px 140px 100px',
                padding: '14px 16px',
                borderBottom: '1px solid var(--line)',
                fontSize: 13,
                cursor: 'pointer',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'inherit',
                background: isCurrent ? 'rgba(255, 214, 107, 0.05)' : 'transparent',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: '.18em',
                  color: won ? 'var(--win)' : 'var(--lose)',
                }}
              >
                {won ? 'WON' : 'LOST'}
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '.04em' }}>
                {m.mapPretty.toUpperCase()}
                {isCurrent && (
                  <span
                    style={{
                      fontSize: 9,
                      background: 'var(--gold)',
                      color: '#1a0e00',
                      padding: '2px 6px',
                      marginLeft: 10,
                      letterSpacing: '.12em',
                      fontWeight: 800,
                    }}
                  >
                    CURRENT
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{result}</div>
              <div>{m.mvp ?? '—'}</div>
              <div style={{ fontFamily: 'JetBrains Mono', color: 'var(--muted)', fontSize: 11, letterSpacing: '.1em' }}>
                {dateDisplay}
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: 'var(--muted)' }}>
                {m.durationLabel}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
