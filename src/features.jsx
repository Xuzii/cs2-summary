// Grenade Finder + Round Detail + Charts + Flash Matrix + Body Accuracy + Opening Duels map
const { useState: useStP, useMemo: useMeP } = React;

// ================= GRENADE FINDER =================
function GrenadeFinder({ match }) {
  const ROUNDS = window.MOCK_EXTRA.ROUNDS;
  const all = window.MOCK_EXTRA.allPlayers;
  const [types, setTypes] = useStP({ smoke: true, flash: true, he: true, molotov: true });
  const [roundFilter, setRoundFilter] = useStP('all'); // 'all' or number
  const [playerFilter, setPlayerFilter] = useStP('all');

  const visible = useMeP(() => {
    const out = [];
    ROUNDS.forEach(rd => {
      if (roundFilter !== 'all' && rd.n !== roundFilter) return;
      rd.grenades.forEach(g => {
        if (!types[g.type]) return;
        if (playerFilter !== 'all' && g.thrower !== playerFilter) return;
        out.push({ ...g, round: rd.n });
      });
    });
    return out;
  }, [types, roundFilter, playerFilter]);

  const typeColor = (type) => ({ smoke: '#b8c4d8', flash: '#ffffff', he: '#ffd66b', molotov: '#ff7830' }[type]);

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Grenade Finder</div>
        <div className="right">{visible.length} throws visible</div>
      </div>
      <div className="filter-bar">
        {['smoke','flash','he','molotov'].map(t => (
          <button key={t} className={`fchip ${t} ${types[t] ? 'on' : ''}`} onClick={() => setTypes(s => ({...s, [t]: !s[t]}))}>{t}</button>
        ))}
        <div style={{width: 14}}/>
        <button className={`fchip ${roundFilter === 'all' ? 'on' : ''}`} onClick={() => setRoundFilter('all')}>ALL ROUNDS</button>
        <select value={roundFilter} onChange={e => setRoundFilter(e.target.value === 'all' ? 'all' : +e.target.value)} className="fchip" style={{padding: '5px 10px'}}>
          <option value="all">ROUND</option>
          {ROUNDS.map(r => <option key={r.n} value={r.n}>R{r.n}</option>)}
        </select>
        <select value={playerFilter} onChange={e => setPlayerFilter(e.target.value)} className="fchip" style={{padding: '5px 10px'}}>
          <option value="all">ALL PLAYERS</option>
          {all.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid-2-1">
        <div className="radar" data-map={`GRENADE TRAJECTORIES · ${(match.mapName || 'MAP').toUpperCase()}`} style={{aspectRatio: '1'}}>
          <div className="radar-grid"></div>
          <InfernoMap/>
          <svg className="radar-svg" viewBox="0 0 600 600" style={{position:'absolute', inset: 0}}>
            {visible.map((g, i) => (
              <g key={g.id} style={{animation: `fadeIn .4s ease both`, animationDelay: `${i * 0.005}s`}}>
                <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y}
                      stroke={typeColor(g.type)} strokeWidth="1.2" strokeOpacity=".55"
                      strokeDasharray={g.type === 'flash' ? '3 3' : undefined}/>
                <circle cx={g.from.x} cy={g.from.y} r="2" fill={typeColor(g.type)} opacity=".4"/>
                <circle cx={g.to.x} cy={g.to.y} r="4" fill={typeColor(g.type)} stroke="#0b1019" strokeWidth="1"/>
              </g>
            ))}
          </svg>
        </div>
        <div className="card">
          <div className="card-hd"><div className="t">Throws · Breakdown</div></div>
          <div style={{padding: 14, display:'flex', flexDirection:'column', gap: 10}}>
            {['smoke','flash','he','molotov'].map(t => {
              const n = visible.filter(v => v.type === t).length;
              const total = visible.length || 1;
              return (
                <div key={t} style={{display:'flex', alignItems:'center', gap: 10}}>
                  <span style={{width: 14, height: 14, background: typeColor(t), display:'inline-block'}}></span>
                  <span style={{flex: 1, fontSize: 12, fontWeight: 700, letterSpacing: '.14em', textTransform:'uppercase', color: 'var(--text)'}}>{t}</span>
                  <span style={{fontFamily:'JetBrains Mono', fontWeight: 700}}>{n}</span>
                  <span style={{fontFamily:'JetBrains Mono', color: 'var(--muted)', fontSize: 11}}>{Math.round(n/total*100)}%</span>
                </div>
              );
            })}
            <div style={{borderTop: '1px dashed var(--line)', paddingTop: 10, marginTop: 4}}>
              <div style={{fontSize: 10, color: 'var(--muted)', letterSpacing: '.22em', fontWeight: 700, textTransform:'uppercase', marginBottom: 8}}>TOP THROWERS</div>
              {(() => {
                const byP = {};
                visible.forEach(v => byP[v.thrower] = (byP[v.thrower]||0)+1);
                return Object.entries(byP).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n, c]) => (
                  <div key={n} style={{display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize: 12}}>
                    <span style={{fontWeight: 600}}>{n}</span>
                    <span style={{fontFamily:'JetBrains Mono', color:'var(--gold)', fontWeight: 700}}>{c}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= ROUND DETAIL =================
function RoundDetailPage({ match, initialRound = 1, onJumpToTick }) {
  const ROUNDS = window.MOCK_EXTRA.ROUNDS;
  const INV = window.MOCK_EXTRA.ROUND_INV;
  const [roundN, setRoundN] = useStP(initialRound);
  const round = ROUNDS.find(r => r.n === roundN) || ROUNDS[0];
  const detail = match.roundDetails.find(r => r.n === roundN) || match.roundDetails[0];

  const firstHalf = roundN <= 12;
  const aSide = firstHalf ? match.teamA.side : (match.teamA.side === 'T' ? 'CT' : 'T');
  const aWin = round.winner === aSide;

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Round {roundN.toString().padStart(2, '0')} · Detail</div>
        <div className="rnav">
          <button className="rnav-btn" onClick={() => setRoundN(n => Math.max(1, n - 1))}>◀</button>
          <div className="cur">R {roundN.toString().padStart(2, '0')}</div>
          <button className="rnav-btn" onClick={() => setRoundN(n => Math.min(ROUNDS.length, n + 1))}>▶</button>
        </div>
      </div>

      <div className="round-picker">
        {ROUNDS.map(r => {
          const aWinner = r.winner === (r.n <= 12 ? match.teamA.side : (match.teamA.side === 'T' ? 'CT' : 'T'));
          const cls = aWinner ? match.teamA.side.toLowerCase() : match.teamB.side.toLowerCase();
          return <button key={r.n} className={`rp-btn ${cls} ${r.n === roundN ? 'on' : ''}`} onClick={() => setRoundN(r.n)}>R{r.n}</button>;
        })}
      </div>

      <div className="kpi-strip" style={{marginBottom: 14}}>
        <div className={`kpi ${aWin ? 'win' : 'lose'}`}><div className="l">WINNER</div><div className="v">{aWin ? match.teamA.name : match.teamB.name}</div><div className="sub">{round.winner} SIDE</div></div>
        <div className="kpi"><div className="l">END REASON</div><div className="v" style={{fontSize: 20}}>{round.endReason}</div></div>
        <div className="kpi"><div className="l">DURATION</div><div className="v">{round.duration.toFixed(1)}s</div></div>
        <div className="kpi"><div className="l">TOTAL KILLS</div><div className="v">{round.deaths.length}</div></div>
        <div className="kpi t"><div className="l">ECON · T</div><div className="v" style={{fontSize: 22}}>${(round.eqA/1000).toFixed(1)}K</div><div className="sub">{round.econA}</div></div>
        <div className="kpi ct"><div className="l">ECON · CT</div><div className="v" style={{fontSize: 22}}>${(round.eqB/1000).toFixed(1)}K</div><div className="sub">{round.econB}</div></div>
      </div>

      <div className="grid-2">
        {/* Kill feed sequence */}
        <div className="card">
          <div className="card-hd"><div className="t">Kill Feed · Sequence</div><div className="r">{round.deaths.length} kills</div></div>
          <div style={{padding: 8, display:'flex', flexDirection:'column', gap: 6, maxHeight: 360, overflowY:'auto'}}>
            {round.deaths.map((d, i) => (
              <div key={i} onClick={() => onJumpToTick?.(roundN, d.t)}
                   style={{display:'grid', gridTemplateColumns: '52px 1fr auto', gap: 10, alignItems: 'center',
                           padding: '8px 10px', background: 'var(--panel-2)', borderLeft: `3px solid ${d.killerSide === 'T' ? 'var(--t)' : 'var(--ct)'}`,
                           fontSize: 12, cursor:'pointer'}}>
                <div style={{fontFamily: 'JetBrains Mono', color:'var(--muted)', fontWeight:700, fontSize: 11}}>{d.t.toFixed(1)}s</div>
                <div>
                  <b style={{color: d.killerSide === 'T' ? 'var(--t-2)' : 'var(--ct-2)'}}>{d.killer}</b>
                  <span style={{color:'var(--muted)', fontFamily:'JetBrains Mono', fontSize: 10, margin:'0 6px'}}>[{d.weapon.toUpperCase()}]</span>
                  {d.headshot && <span style={{color:'var(--gold)', fontSize:10, marginRight:6}}>⊙HS</span>}
                  {d.wallbang && <span style={{color:'var(--purple)', fontSize:10, marginRight:6}}>◐WB</span>}
                  ▸ <b style={{color: d.victimSide === 'T' ? 'var(--t-2)' : 'var(--ct-2)'}}>{d.victim}</b>
                </div>
                <div style={{fontSize: 10, color:'var(--subtle)', letterSpacing:'.14em'}}>→ TICK</div>
              </div>
            ))}
          </div>
        </div>

        {/* Equipment in + damage */}
        <div style={{display:'flex', flexDirection:'column', gap: 14}}>
          <div className="card">
            <div className="card-hd"><div className="t">Equipment Going In</div></div>
            <div style={{padding: 12}}>
              {[...match.teamA.players, ...match.teamB.players].map((p, pi) => {
                const inv = INV[roundN]?.[p.name];
                if (!inv) return null;
                const onA = pi < 5;
                const nadeBg = (n) => n === 'flash' ? '#fff' : n === 'smoke' ? '#8fa0b8' : n === 'he' ? 'var(--gold)' : n === 'molotov' ? '#ff7a1e' : n === 'decoy' ? '#b07bff' : 'var(--muted)';
                return (
                  <div key={p.name} style={{display:'grid', gridTemplateColumns: '110px 1fr auto auto', gap: 10, alignItems:'center', padding: '5px 0', fontSize: 12, borderLeft: `2px solid ${onA ? 'var(--t)' : 'var(--ct)'}`, paddingLeft: 10, marginBottom: 3}}>
                    <span style={{fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</span>
                    <span style={{fontFamily:'JetBrains Mono', fontSize: 11, color:'var(--muted)'}}>
                      {inv.primary ? <span style={{color:'var(--text)', marginRight: 8}}>{inv.primary.toUpperCase()}</span> : <span style={{color:'var(--subtle)', marginRight: 8}}>—</span>}
                      {inv.secondary.toUpperCase()} {inv.armor > 0 ? ` · K${inv.helmet?'H':''}` : ''}
                    </span>
                    <span style={{display:'inline-flex', gap: 3, alignItems:'center', minWidth: 40, justifyContent:'flex-end'}}>
                      {(inv.nades || []).length === 0
                        ? <span style={{color:'var(--subtle)', fontFamily:'JetBrains Mono', fontSize: 10}}>—</span>
                        : (inv.nades || []).map((n, i) => (
                            <span key={i} title={n} style={{width: 8, height: 8, borderRadius: '50%', display:'inline-block', background: nadeBg(n)}}/>
                          ))
                      }
                    </span>
                    <span style={{fontFamily:'JetBrains Mono', color:'var(--gold)', fontWeight: 700}}>${(inv.money/1000).toFixed(1)}K</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><div className="t">Plant / Defuse / Clutch</div></div>
            <div style={{padding: 14, display:'flex', flexDirection: 'column', gap: 8}}>
              {round.bomb.planted ? (
                <>
                  <div style={{display:'flex', justifyContent:'space-between'}}><span style={{color:'var(--muted)', fontSize: 10, letterSpacing:'.22em', fontWeight: 700, textTransform:'uppercase'}}>BOMB PLANTED · SITE {round.bomb.site}</span><b style={{fontFamily:'JetBrains Mono'}}>{round.bombPlantT?.toFixed(1)}s</b></div>
                  <div style={{fontSize: 11, color:'var(--muted)'}}>Planted by <b style={{color:'var(--text)'}}>{round.deaths.find(d => d.killerSide === 'T')?.killer || 'eternal'}</b></div>
                  {round.bomb.defused && (
                    <div style={{display:'flex', justifyContent:'space-between', marginTop: 6}}><span style={{color:'var(--ct)', fontSize: 10, letterSpacing:'.22em', fontWeight: 700, textTransform:'uppercase'}}>BOMB DEFUSED</span><b style={{fontFamily:'JetBrains Mono'}}>{round.bombDefuseT?.toFixed(1)}s</b></div>
                  )}
                </>
              ) : (
                <div style={{color:'var(--muted)', fontSize: 11, letterSpacing:'.14em', fontWeight: 700, textTransform:'uppercase'}}>NO BOMB PLANTED</div>
              )}
              <div style={{borderTop:'1px dashed var(--line)', paddingTop: 8, marginTop: 4}}>
                <div style={{fontSize: 10, color:'var(--muted)', letterSpacing: '.22em', fontWeight: 700, textTransform:'uppercase', marginBottom: 6}}>CLUTCH SNAPSHOT</div>
                <div style={{fontFamily:'Barlow Condensed', fontSize: 22, fontWeight: 700, color: 'var(--gold)'}}>
                  {round.deaths.length >= 3 ? `${round.deaths[round.deaths.length-1].killer} · 1vX` : '—'}
                </div>
                <div style={{fontSize: 10, color:'var(--muted)', marginTop: 3}}>{round.deaths.length >= 3 ? 'final kill pattern suggests a clutch attempt' : 'no clutch attempt'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sect">
        <div className="sect-h"><div className="title">Top Damage · This Round</div></div>
        <div className="card">
          <div style={{padding: 14, display:'flex', flexDirection:'column', gap: 8}}>
            {detail.topDamage.map((d, i) => (
              <div key={i} style={{display:'grid', gridTemplateColumns: '140px 1fr 60px', gap: 14, alignItems:'center', fontSize: 12}}>
                <span style={{fontWeight:700, letterSpacing:'.02em'}}>{d.name}</span>
                <div style={{height: 10, background:'var(--panel-3)', position:'relative'}}>
                  <div style={{position:'absolute', inset: 0, right:'auto', width: `${(d.dmg/200)*100}%`, background:'linear-gradient(90deg, var(--gold), #f39321)', animation:'fillIn .6s ease both', animationDelay: `${i*0.1}s`}}/>
                </div>
                <span style={{fontFamily:'JetBrains Mono', fontWeight: 700, textAlign:'right'}}>{d.dmg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= CHARTS (Damage & Econ) =================
function EqTimelineChart() {
  const eq = window.MOCK_EXTRA.EQ_TIMELINE;
  const W = 800, H = 260, PAD = 40;
  const maxV = Math.max(...eq.flatMap(r => [r.eqA, r.eqB])) * 1.1;
  const xAt = i => PAD + (i / (eq.length - 1)) * (W - PAD * 2);
  const yAt = v => H - PAD - (v / maxV) * (H - PAD * 2);
  const pathA = eq.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(r.eqA)}`).join(' ');
  const pathB = eq.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(r.eqB)}`).join(' ');
  return (
    <div className="chart-wrap">
      <div className="chart-hd">
        <div className="title">Equipment Value · Over Time</div>
        <div className="leg">
          <span className="lg t"><i/>TEAM A</span>
          <span className="lg ct"><i/>TEAM B</span>
        </div>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}>
        {[0, .25, .5, .75, 1].map((f, i) => <line key={i} className="gridline" x1={PAD} x2={W-PAD} y1={H-PAD-f*(H-PAD*2)} y2={H-PAD-f*(H-PAD*2)}/>)}
        {eq.map((r, i) => i % 4 === 0 && <text key={i} x={xAt(i)} y={H-PAD+16} textAnchor="middle">R{r.n}</text>)}
        {[0, .5, 1].map((f, i) => <text key={i} x={PAD-6} y={H-PAD-f*(H-PAD*2)+4} textAnchor="end" fill="var(--muted)">${Math.round(maxV*f/1000)}K</text>)}
        <path d={pathA} stroke="var(--t)" strokeWidth="2" fill="none"/>
        <path d={pathB} stroke="var(--ct)" strokeWidth="2" fill="none"/>
        {eq.map((r, i) => <circle key={`a${i}`} cx={xAt(i)} cy={yAt(r.eqA)} r="2.5" fill="var(--t)"/>)}
        {eq.map((r, i) => <circle key={`b${i}`} cx={xAt(i)} cy={yAt(r.eqB)} r="2.5" fill="var(--ct)"/>)}
      </svg>
    </div>
  );
}

function DamagePerRoundChart({ match }) {
  const DPR = window.MOCK_EXTRA.DAMAGE_PER_ROUND;
  const all = [...match.teamA.players, ...match.teamB.players];
  const [selected, setSelected] = useStP(all[0].name);
  const data = DPR[selected] || [];
  const W = 800, H = 240, PAD = 40;
  const maxV = Math.max(...data) * 1.1 || 1;
  const BW = (W - PAD * 2) / data.length;
  const onA = match.teamA.players.some(p => p.name === selected);
  const color = onA ? 'var(--t)' : 'var(--ct)';
  return (
    <div className="chart-wrap">
      <div className="chart-hd">
        <div className="title">Damage Dealt · Per Round</div>
        <select value={selected} onChange={e => setSelected(e.target.value)} className="fchip" style={{padding:'5px 10px'}}>
          {all.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}>
        {[0, .5, 1].map((f, i) => <line key={i} className="gridline" x1={PAD} x2={W-PAD} y1={H-PAD-f*(H-PAD*2)} y2={H-PAD-f*(H-PAD*2)}/>)}
        {data.map((v, i) => (
          <g key={i}>
            <rect x={PAD + i*BW + 2} y={H-PAD-(v/maxV)*(H-PAD*2)} width={BW-4} height={(v/maxV)*(H-PAD*2)}
                  fill={color} opacity=".8" style={{animation:'fillIn .6s ease both', animationDelay:`${i*0.02}s`, transformOrigin: 'bottom'}}/>
            {(i+1) % 4 === 1 && <text x={PAD + i*BW + BW/2} y={H-PAD+16} textAnchor="middle">R{i+1}</text>}
          </g>
        ))}
        {[0, .5, 1].map((f, i) => <text key={i} x={PAD-6} y={H-PAD-f*(H-PAD*2)+4} textAnchor="end" fill="var(--muted)">{Math.round(maxV*f)}</text>)}
      </svg>
    </div>
  );
}

function ChartsPage({ match }) {
  return (
    <div className="fade-in">
      <div className="sect-h"><div className="title">Damage & Economy</div><div className="right">per round timelines</div></div>
      <EqTimelineChart/>
      <div className="sect"><DamagePerRoundChart match={match}/></div>
      <div className="sect">
        <div className="sect-h"><div className="title">Economy Advantage</div></div>
        <EconAdvChart/>
      </div>
    </div>
  );
}

function EconAdvChart() {
  const eq = window.MOCK_EXTRA.EQ_TIMELINE;
  const W = 800, H = 200, PAD = 40;
  const diffs = eq.map(r => r.eqA - r.eqB);
  const maxAbs = Math.max(...diffs.map(Math.abs)) * 1.1 || 1;
  const BW = (W - PAD*2) / eq.length;
  return (
    <div className="chart-wrap">
      <div className="chart-hd">
        <div className="title">Eq Advantage · (T – CT)</div>
        <div className="leg">
          <span className="lg t"><i/>T AHEAD</span>
          <span className="lg ct"><i/>CT AHEAD</span>
        </div>
      </div>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`}>
        <line className="gridline" x1={PAD} x2={W-PAD} y1={H/2} y2={H/2} stroke="var(--line-2)"/>
        {diffs.map((d, i) => {
          const h = Math.abs(d)/maxAbs * (H/2 - PAD);
          const y = d >= 0 ? H/2 - h : H/2;
          return (
            <rect key={i} x={PAD + i*BW + 2} y={y} width={BW-4} height={h}
                  fill={d >= 0 ? 'var(--t)' : 'var(--ct)'} opacity=".75"
                  style={{animation:'fillIn .6s ease both', animationDelay:`${i*0.02}s`}}/>
          );
        })}
        {eq.map((r, i) => (i+1)%4===1 && <text key={i} x={PAD + i*BW + BW/2} y={H-8} textAnchor="middle">R{r.n}</text>)}
      </svg>
    </div>
  );
}

// ================= FLASH MATRIX =================
function FlashMatrixPage({ match }) {
  const all = window.MOCK_EXTRA.allPlayers;
  const F = window.MOCK_EXTRA.FLASH_MATRIX;
  const teamAIds = match.teamA.players.map(p => p.name);
  const vals = all.flatMap(t => all.map(v => F[t.name]?.[v.name] || 0));
  const max = Math.max(1, ...vals);
  const sideOf = (name) => teamAIds.includes(name) ? 'T' : 'CT';
  const teamFlashCount = all.reduce((acc, t) => acc + all.reduce((a, v) => a + (sideOf(t.name) === sideOf(v.name) && t.name !== v.name ? (F[t.name]?.[v.name]||0) : 0), 0), 0);
  const cls = (v, isTeam, diag) => {
    if (diag) return 'diag';
    if (isTeam && v > 0) return 'team';
    if (!v) return 'zero';
    const r = v/max;
    if (r > .75) return 'hot-4';
    if (r > .5) return 'hot-3';
    if (r > .25) return 'hot-2';
    return 'hot-1';
  };
  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Flash Matrix</div>
        <div className="right">who flashed whom · <span style={{color:'var(--lose)'}}>{teamFlashCount} team flashes</span></div>
      </div>
      <div className="flash-grid" style={{gridTemplateColumns: `160px repeat(${all.length}, 1fr)`}}>
        <div className="fm-hd"></div>
        {all.map(p => (
          <div key={p.name} className={`fm-hd ${sideOf(p.name).toLowerCase()}`}>
            <span className="rot">{p.name}</span>
          </div>
        ))}
        {all.map((t, ri) => (
          <React.Fragment key={t.name}>
            <div className={`fm-rlbl ${sideOf(t.name).toLowerCase()}`}>{t.name}</div>
            {all.map((v, ci) => {
              const val = F[t.name]?.[v.name] || 0;
              const diag = t.name === v.name;
              const isTeam = sideOf(t.name) === sideOf(v.name) && !diag;
              return (
                <div key={v.name} className={`fm-cell ${cls(val, isTeam, diag)}`}
                     title={`${t.name} flashed ${v.name} · ${val} times${isTeam ? ' [TEAM FLASH]' : ''}`}>
                  {diag ? '·' : val || '·'}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{display:'flex', gap: 16, marginTop: 14, fontSize: 10, letterSpacing:'.22em', fontWeight: 700, textTransform:'uppercase', color:'var(--muted)'}}>
        <span><i style={{display:'inline-block', width: 10, height: 10, background:'var(--gold)', marginRight: 6}}></i>ENEMY FLASH</span>
        <span><i style={{display:'inline-block', width: 10, height: 10, background:'rgba(239,107,107,.3)', outline: '1px solid rgba(239,107,107,.5)', marginRight: 6}}></i>TEAM FLASH (lol)</span>
      </div>
    </div>
  );
}

// ================= OPENING DUELS MAP =================
function OpeningDuelsMap() {
  const duels = window.MOCK_EXTRA.OPENING_DUELS_MAP;
  const tW = duels.filter(d => d.winnerSide === 'T').length;
  const ctW = duels.filter(d => d.winnerSide === 'CT').length;
  return (
    <div className="fade-in">
      <div className="sect-h"><div className="title">Opening Duels · Spatial</div><div className="right">First duel of each round</div></div>
      <div className="grid-2-1">
        <div className="radar" data-map={`OPENING DUELS · ${(window.MOCK?.MATCH?.mapName || 'MAP').toUpperCase()}`} style={{aspectRatio: 1}}>
          <div className="radar-grid"></div>
          <InfernoMap/>
          <svg className="radar-svg" viewBox="0 0 600 600" style={{position:'absolute', inset:0}}>
            {duels.map((d, i) => (
              <g key={i} style={{animation:'dotIn .4s ease both', animationDelay: `${i*0.03}s`}}>
                <circle cx={d.x} cy={d.y} r="10" fill={d.winnerSide==='T'?'var(--t)':'var(--ct)'} opacity=".2"/>
                <circle cx={d.x} cy={d.y} r="5" fill={d.winnerSide==='T'?'var(--t)':'var(--ct)'}/>
                <text x={d.x + 8} y={d.y + 3} fill="var(--muted)" fontSize="9" fontFamily="JetBrains Mono" fontWeight="700">R{d.n}</text>
              </g>
            ))}
          </svg>
        </div>
        <div className="card">
          <div className="card-hd"><div className="t">Outcome Split</div></div>
          <div style={{padding: 18}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding: '10px 0'}}>
              <span style={{color:'var(--t)', fontFamily:'Barlow Condensed', fontSize: 16, letterSpacing:'.12em', fontWeight:700}}>T WON FIRST DUEL</span>
              <span style={{fontFamily:'Barlow Condensed', fontSize: 34, fontWeight:700, color:'var(--t)'}}>{tW}</span>
            </div>
            <div style={{height: 6, background:'var(--panel-3)', position:'relative'}}>
              <div style={{position:'absolute', inset:0, right:'auto', width: `${(tW/(tW+ctW))*100}%`, background:'var(--t)'}}/>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding: '14px 0 10px'}}>
              <span style={{color:'var(--ct)', fontFamily:'Barlow Condensed', fontSize: 16, letterSpacing:'.12em', fontWeight:700}}>CT WON FIRST DUEL</span>
              <span style={{fontFamily:'Barlow Condensed', fontSize: 34, fontWeight:700, color:'var(--ct)'}}>{ctW}</span>
            </div>
            <div style={{height: 6, background:'var(--panel-3)', position:'relative'}}>
              <div style={{position:'absolute', inset:0, right:'auto', width: `${(ctW/(tW+ctW))*100}%`, background:'var(--ct)'}}/>
            </div>
            <div style={{marginTop: 18, fontSize: 10, letterSpacing:'.22em', color:'var(--muted)', textTransform:'uppercase', fontWeight:700}}>TOP WEAPONS IN OPENING</div>
            {(() => {
              const byW = {};
              duels.forEach(d => byW[d.weapon] = (byW[d.weapon]||0)+1);
              return Object.entries(byW).sort((a,b)=>b[1]-a[1]).slice(0, 5).map(([w, c]) => (
                <div key={w} style={{display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize: 12, borderBottom:'1px dashed var(--line)'}}>
                  <span style={{fontWeight:700}}>{w.toUpperCase()}</span>
                  <span style={{fontFamily:'JetBrains Mono', color:'var(--gold)', fontWeight: 700}}>{c}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= BODY HIT ACCURACY =================
function BodyAccuracyPage({ match }) {
  const BA = window.MOCK_EXTRA.BODY_ACCURACY;
  const all = [...match.teamA.players, ...match.teamB.players];
  const BodyFig = ({ pct }) => (
    <svg viewBox="0 0 40 80">
      <circle cx="20" cy="10" r="7" fill={`rgba(255,214,107,${Math.min(1,pct.head/50)})`} stroke="var(--line-2)" strokeWidth="1"/>
      <rect x="12" y="18" width="16" height="20" fill={`rgba(255,214,107,${Math.min(1,pct.chest/45)})`} stroke="var(--line-2)" strokeWidth="1"/>
      <rect x="13" y="38" width="14" height="12" fill={`rgba(255,214,107,${Math.min(1,pct.stomach/35)})`} stroke="var(--line-2)" strokeWidth="1"/>
      <rect x="6" y="20" width="5" height="16" fill={`rgba(255,214,107,${Math.min(1,pct.arms/25)})`} stroke="var(--line-2)" strokeWidth="1"/>
      <rect x="29" y="20" width="5" height="16" fill={`rgba(255,214,107,${Math.min(1,pct.arms/25)})`} stroke="var(--line-2)" strokeWidth="1"/>
      <rect x="13" y="52" width="5" height="22" fill={`rgba(255,214,107,${Math.min(1,pct.legs/30)})`} stroke="var(--line-2)" strokeWidth="1"/>
      <rect x="22" y="52" width="5" height="22" fill={`rgba(255,214,107,${Math.min(1,pct.legs/30)})`} stroke="var(--line-2)" strokeWidth="1"/>
    </svg>
  );
  return (
    <div className="fade-in">
      <div className="sect-h"><div className="title">Weapon Accuracy · Body Hit</div><div className="right">where shots landed</div></div>
      <div className="body-grid">
        {all.map(p => {
          const b = BA[p.name];
          return (
            <div key={p.name} className="body-card">
              <div className="fig"><BodyFig pct={b}/></div>
              <div className="meta">
                <div className="pn">{p.name}</div>
                {[['HEAD', b.head],['CHEST', b.chest],['STOMACH', b.stomach],['LEGS', b.legs],['ARMS', b.arms]].map(([k, v]) => (
                  <div key={k} className="row">
                    <span className="k">{k}</span>
                    <div className="bar"><div className="f" style={{width: `${v*2}%`, animation:'fillIn .7s ease both'}}/></div>
                    <span className="v">{v}%</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { GrenadeFinder, RoundDetailPage, ChartsPage, FlashMatrixPage, OpeningDuelsMap, BodyAccuracyPage });
