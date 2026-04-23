// 2D Round Viewer — animated playback of positions, deaths, grenades, with scrubber + sidebar
const { useState: useStV, useEffect: useEfV, useRef: useRfV, useMemo: useMemV } = React;

function RoundViewer({ match, initialRound = 1 }) {
  const ROUNDS = window.MOCK_EXTRA.ROUNDS;
  const INV = window.MOCK_EXTRA.ROUND_INV;
  const [roundN, setRoundN] = useStV(initialRound);
  const round = ROUNDS.find(r => r.n === roundN) || ROUNDS[0];

  // Start playback at the end of freeze time, matching cs-demo-manager's
  // 2D viewer. In CS2 freeze lasts ~20s (or ~26.6s for round-1/half-start),
  // and during freeze player positions are pinned at spawn — so opening at
  // t=0 makes the first ~20 real-world seconds look like the viewer is
  // broken. Jumping straight to freeze-end means motion begins within ~1
  // frame of the user clicking play.
  const [t, setT] = useStV(round.freezetimeEndT || 0);
  const [playing, setPlaying] = useStV(false);
  const [speed, setSpeed] = useStV(1);
  const tr = useRfV();
  const speedRef = useRfV(speed);
  const durationRef = useRfV(round.duration);
  speedRef.current = speed;
  durationRef.current = round.duration;

  useEfV(() => { setT(round.freezetimeEndT || 0); }, [roundN]);

  // Playback loop — only active while `playing` is true. Uses exactly one
  // timing source at a time: rAF for foreground (uniform ~16 ms frames,
  // smooth motion) and a 250 ms setInterval for hidden tabs (Chromium
  // throttles rAF on hidden tabs, so the fallback keeps `t` advancing for
  // users who switch away mid-round). Running rAF + setInterval
  // simultaneously, which the previous version did, causes the interval to
  // consume a small `dt` slice every ~100 ms and leaves an uneven
  // 16/4/12/16/4/12-ms cadence between renders — visible as sporadic dot
  // movement on a focused tab.
  useEfV(() => {
    if (!playing) return;
    let last = performance.now();
    let rafId = 0;
    let intervalId = 0;
    const advance = (now) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      if (dt > 0) {
        setT(prev => {
          const nx = prev + dt * speedRef.current;
          if (nx >= durationRef.current) { setPlaying(false); return durationRef.current; }
          return nx;
        });
      }
    };
    const tick = () => {
      advance(performance.now());
      rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (intervalId) clearInterval(intervalId);
      rafId = 0;
      intervalId = 0;
    };
    const start = () => {
      // Reset `last` each time we switch timing sources so the first tick
      // doesn't see a massive `dt` from the gap while nothing was running.
      last = performance.now();
      if (document.hidden) {
        intervalId = setInterval(() => advance(performance.now()), 250);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };
    const onVis = () => { stop(); start(); };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [playing]);

  // sample positions — bracket and lerp by point.t so movement animates
  // smoothly regardless of sample spacing. HP uses the left bracket (no lerp):
  // CS2 health is a step function that changes on damage events, and
  // interpolating across a hit produces nonsense fractional HP.
  const playerStates = useMemV(() => {
    return round.tracks.map(trk => {
      const pts = trk.points;
      let pos, hp = 100, alive = true;
      if (!pts || pts.length === 0) pos = { x: 300, y: 300 };
      else if (pts.length === 1) {
        pos = pts[0];
        hp = pts[0].hp ?? 100;
        alive = pts[0].alive !== false;
      } else {
        let i = 0;
        while (i < pts.length - 1 && pts[i + 1].t <= t) i++;
        const a = pts[i];
        const b = pts[Math.min(i + 1, pts.length - 1)];
        hp = a.hp ?? 100;
        alive = a.alive !== false;
        if (b.t === a.t) pos = a;
        else {
          const u = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
          pos = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
        }
      }
      const died = round.deaths.find(d => d.victim === trk.name && d.t <= t);
      return { ...trk, pos: died ? died.victimPos : pos, dead: !!died || !alive, hp };
    });
  }, [t, round]);

  // active grenades (within +-3s window)
  const activeGrens = round.grenades.filter(g => t >= g.t - 0.5 && t < g.t + 3.5);

  // kill feed — last ~5 kills before t
  const recentKills = round.deaths.filter(d => d.t <= t).slice(-5).reverse();

  // active grenade trajectory (being thrown this very moment)
  const flyingGren = round.grenades.find(g => t >= g.t - 0.6 && t < g.t);

  // Seek handler
  const onSeek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    setT(Math.max(0, Math.min(round.duration, x * round.duration)));
    setPlaying(false);
  };

  const teamA = match.teamA.players.map(p => p.name);

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">2D Round Viewer</div>
        <div className="rnav">
          <button className="rnav-btn" onClick={() => setRoundN(n => Math.max(1, n - 1))}>◀ PREV</button>
          <div className="cur">R {roundN.toString().padStart(2, '0')}</div>
          <button className="rnav-btn" onClick={() => setRoundN(n => Math.min(ROUNDS.length, n + 1))}>NEXT ▶</button>
        </div>
      </div>

      <div className="round-picker">
        {ROUNDS.map(r => {
          const aWinner = r.winner === (r.n <= 12 ? match.teamA.side : (match.teamA.side === 'T' ? 'CT' : 'T'));
          const cls = aWinner ? match.teamA.side.toLowerCase() : match.teamB.side.toLowerCase();
          return <button key={r.n} className={`rp-btn ${cls} ${r.n === roundN ? 'on' : ''}`} onClick={() => setRoundN(r.n)}>R{r.n}</button>;
        })}
      </div>

      <div className="viewer-shell">
        <div className="viewer-main">
          <div className="viewer-map">
            <div className="radar" data-map={`RADAR · ${(match.mapName || 'MAP').toUpperCase()}`} style={{aspectRatio: '1'}}>
              <div className="radar-grid"></div>
              <InfernoMap/>

              {/* grenades effects */}
              {activeGrens.map(g => (
                <div key={g.id} className={`nade-gfx ${g.type}`} style={{ ...pct(g.to) }} />
              ))}

              {/* flying grenade trajectory */}
              {flyingGren && (
                <svg className="radar-svg" style={{pointerEvents:'none'}}>
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                      <path d="M0,0 L10,5 L0,10 z" fill="var(--gold)"/>
                    </marker>
                  </defs>
                  <line x1={`${flyingGren.from.x/600*100}%`} y1={`${flyingGren.from.y/600*100}%`}
                        x2={`${flyingGren.to.x/600*100}%`} y2={`${flyingGren.to.y/600*100}%`}
                        stroke="var(--gold)" strokeWidth="2" markerEnd="url(#arrow)" className="traj-line"/>
                </svg>
              )}

              {/* player dots */}
              {playerStates.map(p => (
                <div key={p.name}
                     className={`player-dot ${p.side.toLowerCase()} ${p.dead ? 'dead' : ''}`}
                     style={{ ...pct(p.pos) }}>
                  {p.name.substring(0, 2).toUpperCase()}
                  {!p.dead && <div className="tip">{p.name}</div>}
                </div>
              ))}

              {/* recent deaths (past events — X markers) */}
              {round.deaths.filter(d => d.t <= t && t - d.t < 4).map((d, i) => (
                <div key={i} className={`death-x ${d.victimSide.toLowerCase()}`} style={{ ...pct(d.victimPos) }}/>
              ))}

              {/* kill feed */}
              <div className="killfeed">
                {recentKills.map((d, i) => (
                  <div key={`${d.t}-${i}`} className="kf-row">
                    <span className={`kn ${d.killerSide.toLowerCase()}`}>{d.killer}</span>
                    <span className="wp">{d.weapon.toUpperCase()}</span>
                    {d.headshot && <span className="hs">⊙HS</span>}
                    <span className={`kn ${d.victimSide.toLowerCase()}`}>{d.victim}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scrubber */}
          <div className="scrubber">
            <div className="scrub-ctrls">
              <button className="scrub-btn" onClick={() => setT(0)}>⏮</button>
              <button className="scrub-btn play" onClick={() => setPlaying(p => !p)}>{playing ? '❚❚' : '▶'}</button>
              <button className="scrub-btn" onClick={() => setT(round.duration)}>⏭</button>
              <div className="scrub-time"><b>{t.toFixed(1)}</b><span className="e"> / {round.duration.toFixed(1)}s</span></div>
              <div className="scrub-track" onClick={onSeek} ref={tr}>
                <div className="scrub-fill" style={{width: `${(t/round.duration)*100}%`}}/>
                {/* freeze time — actual end derived from csda freezeTimeEndTick */}
                <div className="scrub-mk freeze" style={{left: `${((round.freezetimeEndT || 0)/round.duration)*100}%`}}>
                  <span className="lbl" style={{color:'var(--subtle)'}}>FREEZE</span>
                </div>
                {round.bombPlantT != null && (
                  <div className="scrub-mk plant" style={{left: `${(round.bombPlantT/round.duration)*100}%`}}>
                    <span className="lbl" style={{color:'var(--t)'}}>PLANT</span>
                  </div>
                )}
                {round.bombDefuseT != null && (
                  <div className="scrub-mk defuse" style={{left: `${(round.bombDefuseT/round.duration)*100}%`}}>
                    <span className="lbl" style={{color:'var(--ct)'}}>DEFUSE</span>
                  </div>
                )}
                {round.deaths.map((d, i) => (
                  <div key={i} className="scrub-mk kill" style={{left: `${(d.t/round.duration)*100}%`}} title={`${d.killer} → ${d.victim}`}/>
                ))}
              </div>
              <div className="scrub-btn" onClick={() => setSpeed(s => s === 4 ? 0.5 : s === 0.5 ? 1 : s === 1 ? 2 : 4)} title="Speed">{speed}×</div>
            </div>
          </div>

          {/* Event timeline */}
          <div className="rtimeline">
            {round.events.map((ev, i) => {
              const passed = ev.t <= t;
              return (
                <div key={i} className={`rtl-ev ${ev.kind}`} style={{opacity: passed ? 1 : .4}}>
                  <div className="time">{ev.t.toFixed(1)}s</div>
                  <div className="ico"></div>
                  <div className="lbl">
                    {ev.kind === 'kill'
                      ? <><b style={{color: ev.killerSide==='T'?'var(--t-2)':'var(--ct-2)'}}>{ev.killer}</b> <span style={{color:'var(--muted)'}}>[{ev.weapon.toUpperCase()}]{ev.hs ? ' HS' : ''}</span> ▸ <b style={{color: ev.victimSide==='T'?'var(--t-2)':'var(--ct-2)'}}>{ev.victim}</b></>
                      : ev.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar — players HP / inv */}
        <div className="viewer-side">
          {['T','CT'].map(sideFilter => {
            const grp = playerStates.filter(p => p.side === sideFilter);
            const alive = grp.filter(p => !p.dead).length;
            return (
              <div key={sideFilter} className={`viewer-side-group ${sideFilter.toLowerCase()}`}>
                <div className="gh">{sideFilter === 'T' ? '◆' : '◇'} {sideFilter} SIDE <span className="n">{alive}/{grp.length}</span></div>
                {grp.map(p => {
                  const invEntry = INV[roundN]?.[p.name];
                  const inv = invEntry || { hp: 100, armor: 0, primary: null, secondary: 'usp_s', nades: [] };
                  const hp = p.dead ? 0 : p.hp;
                  return (
                    <div key={p.name} className={`pcard ${p.side.toLowerCase()} ${p.dead ? 'dead' : ''}`}>
                      <div className="pn">
                        {p.name}
                        <span className={`hp ${hp < 40 ? 'lo' : ''}`}>{hp}</span>
                      </div>
                      <div className="bar"><div className="f" style={{width: `${hp}%`, background: hp<40?'var(--lose)':'var(--win)'}}/></div>
                      {inv.armor > 0 && <div className="bar arm"><div className="f" style={{width: `${inv.armor}%`}}/></div>}
                      <div className="inv">
                        {inv.primary && <span className="w">{inv.primary.toUpperCase()}</span>}
                        <span className="w" style={{opacity:.7}}>{inv.secondary.toUpperCase()}</span>
                        {(inv.nades || []).map((n, i) => <span key={i} className={`nade ${n}`}/>)}
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

Object.assign(window, { RoundViewer });
