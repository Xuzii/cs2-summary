import { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewModel } from '../lib/adapter';
import type { PlaybackDeath, PlaybackRound } from '../types';
import { Radar } from './Radar';

function sampleTrack(round: PlaybackRound, playerName: string, t: number): { x: number; y: number } | null {
  const trk = round.tracks.find((x) => x.name === playerName);
  if (!trk || trk.points.length === 0) return null;
  if (trk.points.length === 1) return trk.points[0]!;
  let i = 0;
  while (i < trk.points.length - 1 && trk.points[i + 1]!.t <= t) i++;
  const a = trk.points[i]!;
  const b = trk.points[Math.min(i + 1, trk.points.length - 1)]!;
  if (b.t === a.t) return a;
  const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

export function Viewer2DPage({ match, initialRound = 1 }: { match: ViewModel; initialRound?: number }) {
  const pb = match.playback;
  const rounds: PlaybackRound[] = pb?.rounds ?? [];

  if (!pb || rounds.length === 0) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">2D Round Viewer</div>
          <div className="right">Position data unavailable — set INCLUDE_POSITIONS=true and re-parse</div>
        </div>
        <div style={{ background: 'var(--panel)', padding: 24, border: '1px solid var(--line)', color: 'var(--muted)' }}>
          Playback data isn't available for this match. Re-parse the demo with <code>INCLUDE_POSITIONS=true</code> in .env.
        </div>
      </div>
    );
  }

  const [roundN, setRoundN] = useState(initialRound);
  const round = rounds.find((r) => r.n === roundN) ?? rounds[0]!;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    setT(0);
  }, [round.n]);

  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = (now: number) => {
      if (!lastTsRef.current) lastTsRef.current = now;
      const dt = (now - lastTsRef.current) / 1000;
      lastTsRef.current = now;
      setT((prev) => {
        const nx = prev + dt * speed;
        if (nx >= round.duration) {
          setPlaying(false);
          return round.duration;
        }
        return nx;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      lastTsRef.current = 0;
    };
  }, [playing, speed, round.duration]);

  const playerStates = useMemo(() => {
    return round.tracks.map((trk) => {
      const died = round.deaths.find((d) => d.victim === trk.name && d.t <= t);
      const pos = died
        ? died.victimPos
        : sampleTrack(round, trk.name, t) ?? (trk.points[0] ? { x: trk.points[0].x, y: trk.points[0].y } : { x: 0, y: 0 });
      return { ...trk, pos, dead: !!died };
    });
  }, [round, t]);

  const activeGrens = round.grenades.filter((g) => t >= g.t - 0.5 && t < g.t + 3.5);
  const recentKills: PlaybackDeath[] = round.deaths.filter((d) => d.t <= t).slice(-5).reverse();
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    setT(Math.max(0, Math.min(round.duration, x * round.duration)));
    setPlaying(false);
  };

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">2D Round Viewer</div>
        <div className="rnav">
          <button className="rnav-btn" onClick={() => setRoundN((n) => Math.max(1, n - 1))}>
            ◀ PREV
          </button>
          <div className="cur">R {String(roundN).padStart(2, '0')}</div>
          <button className="rnav-btn" onClick={() => setRoundN((n) => Math.min(rounds.length, n + 1))}>
            NEXT ▶
          </button>
        </div>
      </div>

      <div className="round-picker">
        {rounds.map((r) => {
          const aWinnerSide = r.n <= 12 ? match.teamA.side : match.teamA.side === 'T' ? 'CT' : 'T';
          const aWon = r.winner === aWinnerSide;
          const cls = aWon ? match.teamA.side.toLowerCase() : match.teamB.side.toLowerCase();
          return (
            <button
              key={r.n}
              className={`rp-btn ${cls} ${r.n === roundN ? 'on' : ''}`}
              onClick={() => setRoundN(r.n)}
            >
              R{r.n}
            </button>
          );
        })}
      </div>

      <div className="viewer-shell">
        <div className="viewer-main">
          <div className="viewer-map">
            <Radar mapName={match.mapName}>
              {(toPct) => (
                <>
                  {activeGrens.map((g) => {
                    const p = toPct(g.to.x, g.to.y);
                    return (
                      <div
                        key={g.id}
                        className={`nade-gfx ${g.type}`}
                        style={{ position: 'absolute', left: p.left, top: p.top, transform: 'translate(-50%,-50%)' }}
                      />
                    );
                  })}
                  {playerStates.map((p) => {
                    const pos = toPct(p.pos.x, p.pos.y);
                    return (
                      <div
                        key={p.name}
                        className={`player-dot ${p.side.toLowerCase()} ${p.dead ? 'dead' : ''}`}
                        style={{
                          position: 'absolute',
                          left: pos.left,
                          top: pos.top,
                          transform: 'translate(-50%,-50%)',
                        }}
                      >
                        {p.name.substring(0, 2).toUpperCase()}
                        {!p.dead && <div className="tip">{p.name}</div>}
                      </div>
                    );
                  })}
                  {round.deaths
                    .filter((d) => d.t <= t && t - d.t < 4)
                    .map((d, i) => {
                      const p = toPct(d.victimPos.x, d.victimPos.y);
                      return (
                        <div
                          key={i}
                          className={`death-x ${d.victimSide.toLowerCase()}`}
                          style={{ position: 'absolute', left: p.left, top: p.top, transform: 'translate(-50%,-50%)' }}
                        />
                      );
                    })}
                  <div className="killfeed">
                    {recentKills.map((d, i) => (
                      <div key={`${d.t}-${i}`} className="kf-row">
                        <span className={`kn ${d.killerSide.toLowerCase()}`}>{d.killer}</span>
                        <span className="wp">{(d.weapon || '').toUpperCase()}</span>
                        {d.headshot && <span className="hs">⊙HS</span>}
                        <span className={`kn ${d.victimSide.toLowerCase()}`}>{d.victim}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Radar>
          </div>

          <div className="scrubber">
            <div className="scrub-ctrls">
              <button className="scrub-btn" onClick={() => setT(0)}>
                ⏮
              </button>
              <button className="scrub-btn play" onClick={() => setPlaying((p) => !p)}>
                {playing ? '❚❚' : '▶'}
              </button>
              <button className="scrub-btn" onClick={() => setT(round.duration)}>
                ⏭
              </button>
              <div className="scrub-time">
                <b>{t.toFixed(1)}</b>
                <span className="e"> / {round.duration.toFixed(1)}s</span>
              </div>
              <div className="scrub-track" onClick={seek}>
                <div className="scrub-fill" style={{ width: `${(t / Math.max(0.001, round.duration)) * 100}%` }} />
                <div
                  className="scrub-mk freeze"
                  style={{ left: `${(7 / Math.max(0.001, round.duration)) * 100}%` }}
                >
                  <span className="lbl">FREEZE</span>
                </div>
                {round.bombPlantT !== null && (
                  <div
                    className="scrub-mk plant"
                    style={{ left: `${(round.bombPlantT / Math.max(0.001, round.duration)) * 100}%` }}
                  >
                    <span className="lbl" style={{ color: 'var(--t)' }}>
                      PLANT
                    </span>
                  </div>
                )}
                {round.bombDefuseT !== null && (
                  <div
                    className="scrub-mk defuse"
                    style={{ left: `${(round.bombDefuseT / Math.max(0.001, round.duration)) * 100}%` }}
                  >
                    <span className="lbl" style={{ color: 'var(--ct)' }}>
                      DEFUSE
                    </span>
                  </div>
                )}
                {round.deaths.map((d, i) => (
                  <div
                    key={i}
                    className="scrub-mk kill"
                    style={{ left: `${(d.t / Math.max(0.001, round.duration)) * 100}%` }}
                    title={`${d.killer} → ${d.victim}`}
                  />
                ))}
              </div>
              <div
                className="scrub-btn"
                onClick={() => setSpeed((s) => (s === 4 ? 0.5 : s === 0.5 ? 1 : s === 1 ? 2 : 4))}
              >
                {speed}×
              </div>
            </div>
          </div>

          <div className="rtimeline">
            {round.events.map((ev, i) => {
              const passed = ev.t <= t;
              return (
                <div key={i} className={`rtl-ev ${ev.kind}`} style={{ opacity: passed ? 1 : 0.4 }}>
                  <div className="time">{ev.t.toFixed(1)}s</div>
                  <div className="ico" />
                  <div className="lbl">
                    {ev.kind === 'kill' ? (
                      <>
                        <b style={{ color: ev.killerSide === 'T' ? 'var(--t-2)' : 'var(--ct-2)' }}>{ev.killer}</b>{' '}
                        <span style={{ color: 'var(--muted)' }}>
                          [{(ev.weapon || '').toUpperCase()}]{ev.hs ? ' HS' : ''}
                        </span>{' '}
                        ▸{' '}
                        <b style={{ color: ev.victimSide === 'T' ? 'var(--t-2)' : 'var(--ct-2)' }}>{ev.victim}</b>
                      </>
                    ) : (
                      ev.label
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="viewer-side">
          {(['T', 'CT'] as const).map((sideFilter) => {
            const grp = playerStates.filter((p) => p.side === sideFilter);
            const alive = grp.filter((p) => !p.dead).length;
            return (
              <div key={sideFilter} className={`viewer-side-group ${sideFilter.toLowerCase()}`}>
                <div className="gh">
                  {sideFilter === 'T' ? '◆' : '◇'} {sideFilter} SIDE{' '}
                  <span className="n">
                    {alive}/{grp.length}
                  </span>
                </div>
                {grp.map((p) => {
                  const invEntry = match.roundInventory[roundN]?.[p.name];
                  const inv = invEntry ?? { hp: 100, armor: 0, helmet: false, primary: null, secondary: 'usp_s', nades: [], money: 0 };
                  const hp = p.dead ? 0 : Math.max(0, inv.hp - Math.floor((t / Math.max(0.001, round.duration)) * 30));
                  return (
                    <div key={p.name} className={`pcard ${p.side.toLowerCase()} ${p.dead ? 'dead' : ''}`}>
                      <div className="pn">
                        {p.name}
                        <span className={`hp ${hp < 40 ? 'lo' : ''}`}>{hp}</span>
                      </div>
                      <div className="bar">
                        <div
                          className="f"
                          style={{ width: `${hp}%`, background: hp < 40 ? 'var(--lose)' : 'var(--win)' }}
                        />
                      </div>
                      {inv.armor > 0 && (
                        <div className="bar arm">
                          <div className="f" style={{ width: `${inv.armor}%` }} />
                        </div>
                      )}
                      <div className="inv">
                        {inv.primary && <span className="w">{inv.primary.toUpperCase()}</span>}
                        <span className="w" style={{ opacity: 0.7 }}>
                          {inv.secondary.toUpperCase()}
                        </span>
                        {inv.nades.map((n, i) => (
                          <span key={i} className={`nade ${n}`} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
