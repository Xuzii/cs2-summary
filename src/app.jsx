const { useState: useStateApp, useEffect: useEffectApp } = React;

function TweaksPanel({ cfg, setCfg }) {
  return (
    <div className="tw-panel">
      <div className="tw-hdr">Tweaks</div>
      <div className="tw-body">
        <div className="tw-row">
          <label>Accent</label>
          <div className="tw-seg">
            {['gold','blue','orange','purple'].map(c => (
              <button key={c} className={cfg.accent===c?'on':''} onClick={()=>setCfg({...cfg, accent:c})}>{c}</button>
            ))}
          </div>
        </div>
        <div className="tw-row">
          <label>Density</label>
          <div className="tw-seg">
            {['cozy','compact'].map(d => (
              <button key={d} className={cfg.density===d?'on':''} onClick={()=>setCfg({...cfg, density:d})}>{d}</button>
            ))}
          </div>
        </div>
        <div className="tw-row">
          <label>Radar Style</label>
          <div className="tw-seg">
            {['tactical','neon','classic'].map(d => (
              <button key={d} className={cfg.radar===d?'on':''} onClick={()=>setCfg({...cfg, radar:d})}>{d}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PastMatchesPage({ match }) {
  const matches = (window.MOCK?.MATCH_LIST) || [
    { id: 'm1', map: 'DE_INFERNO', date: '2025-11-21', result: 'W 13-9',  mvp: 'turd.exe', dur: '34:12' },
    { id: 'm2', map: 'DE_MIRAGE',  date: '2025-11-19', result: 'L 8-13',  mvp: 'Viper',    dur: '30:45' },
    { id: 'm3', map: 'DE_ANCIENT', date: '2025-11-17', result: 'W 13-11', mvp: 'turd.exe', dur: '38:20' },
    { id: 'm4', map: 'DE_NUKE',    date: '2025-11-14', result: 'W 13-7',  mvp: 'ghostline', dur: '28:30' },
    { id: 'm5', map: 'DE_DUST2',   date: '2025-11-11', result: 'L 10-13', mvp: 'Bravo01', dur: '36:02' },
    { id: 'm6', map: 'DE_VERTIGO', date: '2025-11-08', result: 'W 13-5',  mvp: 'turd.exe', dur: '24:50' },
  ];
  return (
    <div className="fade-in">
      <div className="sect-h"><div className="title">Past Matches</div><div className="right">Recent playlist · 6 matches</div></div>
      <div style={{background:'var(--panel)', border:'1px solid var(--line)'}}>
        <div style={{display:'grid', gridTemplateColumns:'80px 1fr 120px 120px 140px 100px', padding:'10px 16px', background:'var(--panel-2)', fontSize:9, color:'var(--subtle)', letterSpacing:'.24em', fontWeight:700, textTransform:'uppercase', borderBottom:'1px solid var(--line)'}}>
          <div>STATUS</div><div>MAP</div><div>RESULT</div><div>MVP</div><div>DATE</div><div style={{textAlign:'right'}}>DURATION</div>
        </div>
        {matches.map((m, i) => (
          <div key={m.id} style={{display:'grid', gridTemplateColumns:'80px 1fr 120px 120px 140px 100px', padding:'14px 16px', borderBottom:'1px solid var(--line)', fontSize:13, cursor:'pointer', alignItems:'center'}}>
            <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:14, letterSpacing:'.18em', color: m.result.startsWith('W') ? 'var(--win)' : 'var(--lose)'}}>{m.result.startsWith('W') ? 'WON' : 'LOST'}</div>
            <div style={{fontFamily:'Barlow Condensed', fontWeight:700, fontSize:18, letterSpacing:'.04em'}}>{m.map}{i === 0 && <span style={{fontSize:9, background:'var(--gold)', color:'#1a0e00', padding:'2px 6px', marginLeft:10, letterSpacing:'.12em', fontWeight:800}}>CURRENT</span>}</div>
            <div style={{fontFamily:'JetBrains Mono', fontWeight:700}}>{m.result}</div>
            <div>{m.mvp}</div>
            <div style={{fontFamily:'JetBrains Mono', color:'var(--muted)', fontSize:11, letterSpacing:'.1em'}}>{m.date}</div>
            <div style={{textAlign:'right', fontFamily:'JetBrains Mono', color:'var(--muted)'}}>{m.dur}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const { MATCH } = window.MOCK;
  const [page, setPage] = useStateApp(() => localStorage.getItem('cs2_page2') || 'dash');
  const [playerName, setPlayerName] = useStateApp('turd.exe');
  const [tweaksOn, setTweaksOn] = useStateApp(false);
  const [cfg, setCfg] = useStateApp({ accent: 'gold', density: 'cozy', radar: 'tactical' });
  const [activeRound, setActiveRound] = useStateApp(1);

  useEffectApp(() => localStorage.setItem('cs2_page2', page), [page]);

  useEffectApp(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOn(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOn(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({type:'__edit_mode_available'}, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffectApp(() => {
    const map = { gold:'#ffd66b', blue:'#4aa3ff', orange:'#f39321', purple:'#c27bff' };
    document.documentElement.style.setProperty('--gold', map[cfg.accent] || '#ffd66b');
  }, [cfg.accent]);

  const openPlayer = (p) => { setPlayerName(p.name); setPage('player'); };
  const openRound = (n) => { setActiveRound(n); setPage('viewer'); };

  return (
    <div className="app" data-density={cfg.density}>
      <Sidebar page={page} onNav={setPage}/>
      <div className="main">
        <Topbar match={MATCH}/>
        <HeroStrip match={MATCH}/>
        <div className="page">
          {page === 'dash'     && <OverviewPage match={MATCH} onPlayerClick={openPlayer} onRoundClick={openRound}/>}
          {page === 'viewer'   && <RoundViewer match={MATCH} initialRound={activeRound}/>}
          {page === 'rounds'   && <RoundDetailPage match={MATCH} initialRound={activeRound} onJumpToTick={(n)=>openRound(n)}/>}
          {page === 'nades'    && <GrenadeFinder match={MATCH}/>}
          {page === 'charts'   && <ChartsPage match={MATCH}/>}
          {page === 'flash'    && <FlashMatrixPage match={MATCH}/>}
          {page === 'duel'     && <OpeningDuelsMap/>}
          {page === 'accuracy' && <BodyAccuracyPage match={MATCH}/>}
          {page === 'player'   && <PlayerCardPage match={MATCH} playerName={playerName} onPlayerChange={setPlayerName}/>}
          {page === 'detail'   && <DetailPage match={MATCH}/>}
          {page === 'history'  && <PastMatchesPage match={MATCH}/>}
        </div>
        <FooterBar page={page} match={MATCH}/>
      </div>
      {tweaksOn && <TweaksPanel cfg={cfg} setCfg={setCfg}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
