import type { JSX } from 'react';

const PATHS: Record<string, string> = {
  dash: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  viewer: 'M3 3h18v14H3zM8 20l4-3 4 3v1H8z',
  nade: 'M12 2l2 3h3l-2 4 3 2-3 2 2 4h-3l-2 3-2-3H7l2-4-3-2 3-2-2-4h3z',
  rounds: 'M4 5h16v2H4zM4 11h16v2H4zM4 17h16v2H4zM1 5h2v2H1zM1 11h2v2H1zM1 17h2v2H1z',
  charts: 'M3 21V3h2v16h16v2zm4-3v-7h3v7zm5 0V7h3v11zm5 0v-4h3v4z',
  flash: 'M13 2L4 14h6l-1 8 9-12h-6z',
  duel: 'M14 2l6 6-2 2-2-2-7 7 2 2-2 2-6-6 2-2 2 2 7-7-2-2zM2 18l4-4 2 2-4 4zm14-14l4 4-2 2-4-4z',
  body: 'M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-4 8h8v4l-1 8h-2l-1-5-1 5H9l-1-8z',
  acc: 'M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8zM12 6v6h6a6 6 0 1 1-6-6z',
  team: 'M12 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM4 22a8 8 0 0 1 16 0z',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm9 3l-2 .3-.5 1.3 1.3 1.6-1.4 1.4-1.6-1.3-1.3.5-.3 2h-2l-.3-2-1.3-.5-1.6 1.3-1.4-1.4 1.3-1.6-.5-1.3L4 12l2-.3.5-1.3-1.3-1.6 1.4-1.4 1.6 1.3 1.3-.5.3-2h2l.3 2 1.3.5 1.6-1.3 1.4 1.4-1.3 1.6.5 1.3z',
  hist: 'M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-2-5l-3 3h8V2z',
};

export function Icon({ name }: { name: string }): JSX.Element {
  const d = PATHS[name] ?? PATHS.dash;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}
