// Data adapter: reads the pipeline's MatchDocument JSON (the same file the
// old TS/Vite UI consumed) and rewrites it into the shape the target .jsx
// components expect — window.MOCK = { MATCH, MATCH_LIST } and
// window.MOCK_EXTRA = { ROUNDS, FLASH_MATRIX, ... }. Once both globals are
// populated we inject the babel <script type="text/babel"> tags for the JSX
// files in dependency order and kick off Babel.transformScriptTags().
//
// The adapter runs as a plain <script> so it executes synchronously before
// Babel even sees the JSX; the JSX tags are appended only after the fetch
// chain resolves, because app.jsx eagerly destructures window.MOCK at module
// eval time.

(function () {
  const params = new URLSearchParams(location.search);
  // Pipeline posts links as `?m=<id>`; accept `?id=<id>` too for back-compat.
  const requestedId = params.get('m') || params.get('id');

  const loadJson = (path) => fetch(path, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`Fetch ${path} failed: ${r.status}`);
    return r.json();
  });

  loadJson('matches/index.json')
    .then((indexList) => {
      if (!Array.isArray(indexList) || indexList.length === 0) {
        throw new Error('matches/index.json is empty — run the pipeline first.');
      }
      const chosen = requestedId
        ? indexList.find((e) => e.id === requestedId) || indexList[0]
        : indexList[0];
      return Promise.all([indexList, loadJson(`matches/${chosen.id}.json`), chosen]);
    })
    .then(([indexList, doc, chosen]) => {
      const { MATCH, MATCH_LIST, MOCK_EXTRA } = transform(doc, indexList, chosen.id);
      window.MOCK = { MATCH, MATCH_LIST };
      window.MOCK_EXTRA = MOCK_EXTRA;
      injectBabelScripts();
    })
    .catch((err) => {
      console.error('[adapter] fatal', err);
      document.getElementById('root').innerHTML =
        `<div style="padding:40px;font-family:system-ui;color:#fff;background:#1a0e00;">
           <h1 style="font-family:'Barlow Condensed',sans-serif;letter-spacing:.1em;color:#ffd66b">Failed to load match</h1>
           <pre style="white-space:pre-wrap;color:#ef6b6b">${String(err && err.stack || err)}</pre>
           <p style="color:#8b9dc3">Check the browser console and confirm matches/ is populated.</p>
         </div>`;
    });

  // --------------------------------------------------------------------
  // Transform
  // --------------------------------------------------------------------
  function transform(doc, indexList, activeId) {
    const R = window.CS2_RADAR;
    const m = doc.match;

    // Resolve mapName lowercase once so every lookup + remap uses a single key.
    const mapNameLc = (m.mapName || '').toLowerCase();
    const remap = (p) => {
      if (!p) return { x: 300, y: 300 };
      return R.worldTo600(mapNameLc, p.x, p.y);
    };

    // ----- MATCH_LIST from MatchIndexEntry[] -----
    const MATCH_LIST = indexList.map((e) => {
      const result = e.winner === 'draw'
        ? `D ${e.teamA.score}-${e.teamB.score}`
        : (e.winner === 'A'
            ? `W ${e.teamA.score}-${e.teamB.score}`
            : `L ${e.teamA.score}-${e.teamB.score}`);
      return {
        id: e.id,
        map: `DE_${(e.mapPretty || e.mapName || '').replace(/^de_/i, '').toUpperCase()}`,
        score: `${e.teamA.score}—${e.teamB.score}`,
        result,
        opponent: e.winner === 'A' ? e.teamB.name : e.teamA.name,
        date: (e.date || '').slice(0, 10),
        dur: (e.durationLabel || '').toUpperCase().replace(/M /, 'M ').replace(/S$/, 'S'),
        mvp: e.mvp || '',
        active: e.id === activeId,
      };
    });

    // ----- Teams (pass-through; add mvpFlag already present, add note slot) -----
    const teamA = {
      ...m.teamA,
      code: 'A',
      resultLabel: m.teamA.score > m.teamB.score ? 'WINNER · ' + toSideLabel(m.teamA.side) : 'DEFEAT · ' + toSideLabel(m.teamA.side),
      players: m.teamA.players.map(addPlayerDefaults),
    };
    const teamB = {
      ...m.teamB,
      code: 'B',
      resultLabel: m.teamB.score > m.teamA.score ? 'WINNER · ' + toSideLabel(m.teamB.side) : 'DEFEAT · ' + toSideLabel(m.teamB.side),
      players: m.teamB.players.map(addPlayerDefaults),
    };

    const allPlayers = [...teamA.players, ...teamB.players];

    // ----- Opening duels: att/wins/losses/pct/ct/t -> attempts/wins/lost/pct/ctSide/tSide -----
    const mapDuelSide = (arr) => (arr || []).map((r) => ({
      name: r.name,
      attempts: r.att,
      wins: r.wins,
      lost: r.losses,
      pct: r.pct,
      tSide: r.t,
      ctSide: r.ct,
    }));
    const openingDuels = {
      teamA: mapDuelSide(m.openingDuels?.teamA),
      teamB: mapDuelSide(m.openingDuels?.teamB),
    };

    // ----- Utility -----
    const mapUtilSide = (arr) => (arr || []).map((r) => ({
      name: r.name,
      heDmg: r.heDmg,
      heEfh: r.hePerRnd,
      fa: r.flashAssists,
      ef: r.enemiesFlashed,
      blindTime: r.blindTime,
      smokes: r.smokes,
    }));
    const utility = { teamA: mapUtilSide(m.utility?.teamA), teamB: mapUtilSide(m.utility?.teamB) };

    // ----- Economy (shape matches target) -----
    const economy = m.economy || { teamA: { half: '', pistols: 0, ecos: 0, forces: 0, fullBuys: 0 }, teamB: { half: '', pistols: 0, ecos: 0, forces: 0, fullBuys: 0 } };

    // ----- Clutches -----
    const mapClutchSide = (arr) => (arr || []).map((r) => {
      const vstr = (v) => `${v?.won ?? 0}/${v?.att ?? 0}`;
      const totalMultis = (r.twoK || 0) + (r.threeK || 0) + (r.fourK || 0) + (r.ace || 0);
      // k1 = rounds with exactly one kill for this player; we don't have that
      // cleanly so fallback to "0" (mock data uses big numbers but real-world
      // honest answer is unknown without per-round kill counts).
      return {
        name: r.name,
        c1: vstr(r.v1),
        c2: vstr(r.v2),
        c3: vstr(r.v3),
        c4: vstr(r.v4),
        c5: vstr(r.v5),
        k1: 0,
        k2: r.twoK || 0,
        k3: r.threeK || 0,
        k4: r.fourK || 0,
        ace: r.ace || 0,
        _multis: totalMultis,
      };
    });
    const clutches = { teamA: mapClutchSide(m.clutchMulti?.teamA), teamB: mapClutchSide(m.clutchMulti?.teamB) };
    // Derive k1 from playerImpact rounds where kills === 1 so the rows aren't
    // always zero.
    if (m.playerImpact) {
      for (const side of ['teamA', 'teamB']) {
        for (const row of clutches[side]) {
          const per = m.playerImpact[row.name] || [];
          row.k1 = per.filter((r) => r.kills === 1).length;
        }
      }
    }

    // ----- Entry / Trade -----
    const mapEntrySide = (arr) => (arr || []).map((r) => ({
      name: r.name,
      fk: r.firstKills,
      fd: r.firstDeaths,
      traded: r.tradeDeaths,
      tradeFor: r.tradeKills,
      opened: r.firstKills,
      dmgGiven: r.dmgGiven ?? 0,
      dmgTaken: r.dmgTaken ?? 0,
    }));
    const entryTrade = { teamA: mapEntrySide(m.entryTrade?.teamA), teamB: mapEntrySide(m.entryTrade?.teamB) };

    // ----- Aim (rename hsAcc->hsAccPct, tapAcc->tapPct, sprayAcc->sprayPct) -----
    const mapAimSide = (arr) => (arr || []).map((r) => ({
      name: r.name,
      shots: r.shots,
      hitPct: r.hitPct,
      hsPct: r.hsPct ?? 0,
      hsAccPct: r.hsAcc,
      tapPct: r.tapAcc,
      sprayPct: r.sprayAcc,
      movingPct: r.movingPct,
      avgDist: r.avgDist,
    }));
    const aim = { teamA: mapAimSide(m.aim?.teamA), teamB: mapAimSide(m.aim?.teamB) };

    // ----- Heatmap: already in radar-pixel space (size 600); reuse directly -----
    const heatmap = (m.heatmap?.dots || []).map((d) => ({
      x: d.x, y: d.y, side: d.side, round: 0,
    }));

    // ----- Records + bomb + weaponTops (shape-compatible; patch missing fields) -----
    const records = m.records ? {
      longestKill: m.records.longestKill ?? { player: '—', weapon: '—', distance: 0 },
      bestRound: m.records.bestRound ?? { player: '—', kills: 0, roundNumber: 0 },
      fastestRound: m.records.fastestRound ?? { roundNumber: 0, durationSec: 0, winnerSide: '—' },
      slowestRound: m.records.slowestRound ?? { roundNumber: 0, durationSec: 0, winnerSide: '—' },
      novelty: m.records.novelty ?? { wallbangs: 0, noScopes: 0, throughSmoke: 0, collaterals: 0, blindKills: 0 },
    } : null;

    const bp = m.bombPlays || { plantsA: 0, plantsB: 0, plantsTotal: 0, defuses: 0, topPlanter: null, topDefuser: null };
    const bombPlantsTotal = bp.plantsTotal || (bp.plantsA + bp.plantsB);
    const bomb = {
      plants: bombPlantsTotal,
      defuses: bp.defuses,
      topPlanter: { name: bp.topPlanter?.name || '—', n: bp.topPlanter?.count || 0 },
      topDefuser: { name: bp.topDefuser?.name || '—', n: bp.topDefuser?.count || 0 },
      siteSplit: {
        A: bombPlantsTotal ? Math.round((bp.plantsA / bombPlantsTotal) * 100) : 50,
        B: bombPlantsTotal ? Math.round((bp.plantsB / bombPlantsTotal) * 100) : 50,
      },
    };

    const weaponTops = (m.weaponTops || []).map((w) => ({
      name: w.name,
      kills: w.kills,
      hs: w.hs,
    }));

    // ----- MATCH: top-level document -----
    const MATCH = {
      id: doc.id,
      date: m.date,
      mapName: mapNameLc,
      mapPretty: (m.mapPretty || mapNameLc.replace(/^de_/, '')).toUpperCase(),
      durationLabel: (m.durationLabel || '').toUpperCase(),
      serverName: m.serverName || 'UNKNOWN SERVER',
      shareCode: m.shareCode || '',
      winner: m.winner,
      teamA,
      teamB,
      roundFlow: m.roundFlow || [],
      roundDetails: (m.roundDetails || []).map((rd) => ({
        ...rd,
        econA: normaliseEcon(rd.econA),
        econB: normaliseEcon(rd.econB),
      })),
      playerRoundImpact: m.playerImpact || {},
      highlights: m.highlights || [],
      heatmap,
      duelMatrix: m.duelMatrix || { players: [], kills: [] },
      openingDuels,
      utility,
      economy,
      clutches,
      entryTrade,
      aim,
      weaponTops,
      records,
      bomb,
    };

    // --------------------------------------------------------------------
    // MOCK_EXTRA
    // --------------------------------------------------------------------
    const playbackRounds = m.playback?.rounds || [];
    const roundDetailsByN = new Map((m.roundDetails || []).map((r) => [r.n, r]));

    const ROUNDS = playbackRounds.map((pr) => {
      const detail = roundDetailsByN.get(pr.n) || {};
      // csda reports round duration in milliseconds, while every other time
      // field (deaths.t, grenades.t, bombPlantT, events.t) is in seconds.
      // Normalise to seconds so the target JSX's scrubber + event timeline
      // share one unit system.
      const rawDur = pr.duration || detail.duration || 0;
      const durationSec = rawDur > 300 ? rawDur / 1000 : rawDur || 115;
      const tracks = (pr.tracks || [])
        .map((trk) => {
          const points = (trk.points || []).map((p) => {
            const r = remap(p);
            return { t: p.t ?? 0, x: r.x, y: r.y };
          });
          // Ensure every track has at least one point so the viewer can
          // sample without a guard. Tracks with no recorded positions get a
          // centre-of-radar anchor as a fallback; the viewer still shows the
          // player dot, just statically.
          if (points.length === 0) points.push({ t: 0, x: 300, y: 300 });
          return { name: trk.name, side: trk.side, team: trk.team, points };
        });

      const deaths = (pr.deaths || []).map((d) => ({
        t: d.t,
        killer: d.killer,
        killerSide: d.killerSide,
        victim: d.victim,
        victimSide: d.victimSide,
        weapon: stripWeaponPrefix(d.weapon),
        headshot: d.headshot,
        wallbang: d.wallbang,
        firstKill: d.firstKill,
        killerPos: remap(d.killerPos),
        victimPos: remap(d.victimPos),
      }));

      const grenades = (pr.grenades || []).map((g) => ({
        id: g.id,
        t: g.t,
        thrower: g.thrower,
        throwerSide: g.throwerSide,
        type: g.type,
        from: remap(g.from),
        to: remap(g.to),
      }));

      const flashes = (pr.flashes || []).map((f) => ({ ...f }));
      const events = (pr.events || []).map((ev) => ({
        ...ev,
        weapon: ev.weapon ? stripWeaponPrefix(ev.weapon) : ev.weapon,
      }));

      // Freeze-time end (seconds). Prefer the field emitted by playback.ts.
      // For JSON files generated before that field existed, derive it from
      // the position data: the first sample timestamp where any player's
      // (x,y) diverges from their frame-0 position. This keeps old exports
      // working without a re-parse (which for some matches isn't possible —
      // the raw analyzer JSON is gigabytes and may not be retained on disk).
      let freezetimeEndT = typeof pr.freezetimeEndT === 'number' ? pr.freezetimeEndT : 0;
      if (!freezetimeEndT) {
        let firstMove = Infinity;
        for (const trk of tracks) {
          const pts = trk.points;
          if (!pts || pts.length < 2) continue;
          const x0 = pts[0].x;
          const y0 = pts[0].y;
          for (let i = 1; i < pts.length; i++) {
            if (Math.abs(pts[i].x - x0) > 1 || Math.abs(pts[i].y - y0) > 1) {
              if (pts[i].t < firstMove) firstMove = pts[i].t;
              break;
            }
          }
        }
        if (Number.isFinite(firstMove)) freezetimeEndT = firstMove;
      }

      // Extend duration to cover the full position capture window. csda
      // writes position frames through `endOfficiallyTick` (~7s past the
      // end of round events), but round.duration only spans start→end. If
      // the scrubber clamps at durationSec the last few seconds of walking
      // back to cover / post-plant never render.
      let effectiveDuration = durationSec;
      const maxPointT = Math.max(0, ...tracks.flatMap((t) => t.points.map((p) => p.t ?? 0)));
      if (maxPointT > effectiveDuration) effectiveDuration = maxPointT;

      return {
        n: pr.n,
        winner: pr.winner,
        halftime: !!pr.halftime,
        endReason: pr.endReason || detail.endReason || 'Eliminated',
        duration: effectiveDuration,
        freezetimeEndT,
        bomb: pr.bomb || { planted: false },
        bombPlantT: pr.bombPlantT ?? null,
        bombDefuseT: pr.bombDefuseT ?? null,
        tracks,
        deaths,
        grenades,
        flashes,
        events,
        eqA: pr.eqA ?? 0,
        eqB: pr.eqB ?? 0,
        econA: normaliseEcon(pr.econA),
        econB: normaliseEcon(pr.econB),
        damageDealt: pr.damageDealt || {},
        topDamage: detail.topDamage || [],
      };
    });

    const OPENING_DUELS_MAP = (m.openingsSpatial || []).map((e) => {
      const r = remap({ x: e.x, y: e.y });
      return {
        n: e.n,
        x: r.x,
        y: r.y,
        winnerSide: e.winnerSide,
        killer: e.killer,
        victim: e.victim,
        weapon: stripWeaponPrefix(e.weapon),
      };
    });

    const MOCK_EXTRA = {
      ROUNDS,
      FLASH_MATRIX: m.flashMatrix || {},
      OPENING_DUELS_MAP,
      END_REASONS: m.endReasonCounts || { 'Eliminated': 0, 'Bomb detonated': 0, 'Bomb defused': 0, 'Time ran out': 0 },
      BODY_ACCURACY: ensureBodyAccuracy(m.bodyAccuracy, allPlayers),
      DAMAGE_PER_ROUND: m.damagePerRound || {},
      EQ_TIMELINE: m.eqTimeline || [],
      ROUND_INV: m.roundInventory || {},
      allPlayers,
    };

    return { MATCH, MATCH_LIST, MOCK_EXTRA };
  }

  function addPlayerDefaults(p) {
    return {
      steamId: p.steamId || '',
      note: p.note || '',
      mvpFlag: !!p.mvpFlag,
      ...p,
    };
  }

  function toSideLabel(side) {
    return side === 'T' ? 'TERRORIST' : 'COUNTER-TERRORIST';
  }

  // Map the backend's five-way economy classifier down to the three-way
  // bucket the target UI (styling + copy) expects: full | eco | force.
  function normaliseEcon(e) {
    if (!e) return 'eco';
    const l = String(e).toLowerCase();
    if (l === 'full' || l === 'pistol') return 'full';
    if (l === 'force' || l === 'force-buy' || l === 'semi') return 'force';
    return 'eco';
  }

  function stripWeaponPrefix(w) {
    return w ? String(w).replace(/^weapon_/i, '') : w;
  }

  function ensureBodyAccuracy(src, players) {
    if (src && Object.keys(src).length) return src;
    // Filler so the page renders even when the backend had no hitgroup data.
    const out = {};
    for (const p of players) {
      out[p.name] = { head: 20, chest: 35, stomach: 20, legs: 15, arms: 10, shots: 0, hits: 0 };
    }
    return out;
  }

  // --------------------------------------------------------------------
  // Babel-scripts injection — must wait until MOCK is on window.
  //
  // We inline each JSX file as script textContent rather than relying on
  // Babel.transformScriptTags() to fetch src="..." — which races against
  // dynamic append + has caching quirks. Fetching + inlining keeps the
  // transform fully synchronous once content is in the DOM.
  // --------------------------------------------------------------------
  function injectBabelScripts() {
    const files = ['map', 'shell', 'overview', 'rounds', 'viewer', 'players', 'features', 'app'];
    const v = 'v=' + Date.now();
    Promise.all(
      files.map((name) =>
        fetch(`src/${name}.jsx?${v}`, { cache: 'no-cache' }).then((r) => r.text()),
      ),
    ).then((sources) => {
      sources.forEach((source, i) => {
        const s = document.createElement('script');
        s.type = 'text/babel';
        s.setAttribute('data-name', files[i]);
        s.textContent = source;
        document.body.appendChild(s);
      });
      window.Babel.transformScriptTags();
    });
  }
})();
