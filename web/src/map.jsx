// Shared map rendering + radar component.
//
// The target UI originally shipped a hand-drawn Inferno SVG at 600x600 space.
// We replace it with a real per-map radar PNG sourced from /static/radars/,
// keeping the 600x600 coordinate contract so every .jsx consumer (viewer,
// features) can keep computing positions with the unchanged `pct()` helper.
//
// The adapter normalises real world coords into 0-600 space at load time via
// worldTo600(), so nothing downstream needs to know about raw world coords.

function RadarPng({ mapName }) {
  const m = (mapName || window.MOCK?.MATCH?.mapName || 'de_inferno').toLowerCase();
  return (
    <img
      className="radar-png"
      src={`static/radars/${m}.png`}
      alt={m}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        pointerEvents: 'none',
        opacity: 0.92,
      }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

// Back-compat alias: the target JSX imports `InfernoMap`. Keeping the same
// name means viewer.jsx / features.jsx don't need to change. The mapName is
// pulled from the MATCH the adapter wrote to window.MOCK.
function InfernoMap() {
  return <RadarPng mapName={window.MOCK?.MATCH?.mapName} />;
}

const pct = (v) => ({ left: `${(v.x / 600) * 100}%`, top: `${(v.y / 600) * 100}%` });

Object.assign(window, { InfernoMap, RadarPng, pct });
