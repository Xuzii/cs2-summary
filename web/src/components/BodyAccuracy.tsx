import type { ViewModel } from '../lib/adapter';

function BodyFig({ head, chest, stomach, legs, arms }: { head: number; chest: number; stomach: number; legs: number; arms: number }) {
  const color = (v: number): string => {
    if (v >= 40) return 'var(--gold)';
    if (v >= 25) return 'var(--win)';
    if (v >= 15) return 'var(--ct)';
    if (v >= 5) return 'var(--muted)';
    return 'var(--panel-3)';
  };
  return (
    <svg viewBox="0 0 60 100" width="60" height="100" style={{ display: 'block' }}>
      <circle cx="30" cy="14" r="10" fill={color(head)} opacity="0.85" />
      <rect x="22" y="24" width="16" height="28" fill={color(chest)} opacity="0.85" />
      <rect x="22" y="52" width="16" height="14" fill={color(stomach)} opacity="0.85" />
      <rect x="14" y="28" width="8" height="26" fill={color(arms)} opacity="0.85" />
      <rect x="38" y="28" width="8" height="26" fill={color(arms)} opacity="0.85" />
      <rect x="22" y="66" width="7" height="28" fill={color(legs)} opacity="0.85" />
      <rect x="31" y="66" width="7" height="28" fill={color(legs)} opacity="0.85" />
    </svg>
  );
}

export function BodyAccuracyPage({ match }: { match: ViewModel }) {
  const ba = match.bodyAccuracy;
  if (!ba || Object.keys(ba).length === 0) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">Accuracy</div>
          <div className="right">No hit-group data available for this match</div>
        </div>
      </div>
    );
  }
  const entries = Object.entries(ba);
  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Body Accuracy</div>
        <div className="right">Hit-group distribution per player</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {entries.map(([name, v]) => (
          <div
            key={name}
            style={{ display: 'flex', gap: 14, background: 'var(--panel)', padding: 14, border: '1px solid var(--line)' }}
          >
            <BodyFig head={v.head} chest={v.chest} stomach={v.stomach} legs={v.legs} arms={v.arms} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, letterSpacing: '.08em', marginBottom: 6 }}>{name}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
                {v.shots} shots · {v.hits} hits
              </div>
              {[
                { k: 'Head', v: v.head },
                { k: 'Chest', v: v.chest },
                { k: 'Stomach', v: v.stomach },
                { k: 'Arms', v: v.arms },
                { k: 'Legs', v: v.legs },
              ].map((row) => (
                <div key={row.k} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                  <span style={{ width: 60, fontSize: 11, color: 'var(--muted)' }}>{row.k}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--panel-2)' }}>
                    <div style={{ width: `${row.v}%`, height: '100%', background: 'var(--gold)' }} />
                  </div>
                  <span style={{ width: 36, fontSize: 11, textAlign: 'right', fontFamily: 'JetBrains Mono' }}>
                    {row.v}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
