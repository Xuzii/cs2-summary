import type { ViewModel } from '../lib/adapter';

export function FlashMatrixPage({ match }: { match: ViewModel }) {
  const fm = match.flashMatrix;
  const all = [...match.teamA.players, ...match.teamB.players].map((p) => p.name);
  if (!fm) {
    return (
      <div className="fade-in">
        <div className="sect-h">
          <div className="title">Flash Matrix</div>
          <div className="right">No flash events recorded for this match</div>
        </div>
      </div>
    );
  }
  const rows = all.map((thrower) => {
    const row = fm[thrower] ?? {};
    return { thrower, counts: all.map((victim) => row[victim] ?? 0) };
  });
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));
  const teamA = match.teamA.players.map((p) => p.name);

  const cellColor = (n: number, sameTeam: boolean): string => {
    if (n === 0) return 'rgba(255,255,255,0.02)';
    const t = n / max;
    if (sameTeam) return `rgba(239,107,107,${0.3 + t * 0.6})`;
    return `rgba(255,214,107,${0.3 + t * 0.6})`;
  };

  return (
    <div className="fade-in">
      <div className="sect-h">
        <div className="title">Flash Matrix</div>
        <div className="right">Thrower × Victim — team flashes in red</div>
      </div>
      <div style={{ overflowX: 'auto', background: 'var(--panel)', padding: 16, border: '1px solid var(--line)' }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: 'JetBrains Mono', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: 8, textAlign: 'left' }}></th>
              {all.map((v) => (
                <th
                  key={v}
                  style={{
                    padding: 6,
                    color: teamA.includes(v) ? 'var(--t-2)' : 'var(--ct-2)',
                    fontWeight: 600,
                    writingMode: 'vertical-rl',
                    letterSpacing: '.1em',
                  }}
                >
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const thrAOn = teamA.includes(r.thrower);
              return (
                <tr key={r.thrower}>
                  <td
                    style={{
                      padding: '6px 10px',
                      color: thrAOn ? 'var(--t-2)' : 'var(--ct-2)',
                      fontWeight: 600,
                      letterSpacing: '.08em',
                    }}
                  >
                    {r.thrower}
                  </td>
                  {r.counts.map((n, i) => {
                    const vAOn = teamA.includes(all[i]!);
                    const sameTeam = thrAOn === vAOn;
                    return (
                      <td
                        key={i}
                        style={{
                          width: 32,
                          height: 28,
                          textAlign: 'center',
                          color: n > 0 ? 'var(--text)' : 'var(--subtle)',
                          background: cellColor(n, sameTeam),
                          border: '1px solid var(--line)',
                        }}
                      >
                        {n || ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
