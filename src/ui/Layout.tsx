import type { ReactNode } from 'react';
import { nextUserMatch } from '../engine/game/advance.ts';
import { getAppStore, useApp, useGame, type Screen } from '../state/store.ts';
import { clubOf } from './components.tsx';
import { formatDate, seasonLabel } from './format.ts';
import { clubAccent } from './theme.ts';

const NAV: { label: string; screen: Screen }[] = [
  { label: 'Domů', screen: { name: 'home' } },
  { label: 'Soupiska', screen: { name: 'squad' } },
  { label: 'Taktika', screen: { name: 'tactics' } },
  { label: 'Soutěže', screen: { name: 'competitions' } },
];

export function Layout({ children }: { children: ReactNode }) {
  const { game, data } = useGame();
  const screen = useApp((s) => s.screen);
  const busy = useApp((s) => s.busy);
  const club = clubOf(data, game.userClubId);
  const { accent, onAccent } = club ? clubAccent(club) : { accent: '#1f6f43', onAccent: '#fff' };
  const store = getAppStore().getState();
  const next = nextUserMatch(game);

  return (
    <div className="app" style={{ ['--accent' as string]: accent, ['--on-accent' as string]: onAccent }}>
      <header className="topbar">
        <span className="club">{club?.name}</span>
        <span>Sezóna {seasonLabel(game.seasonYear)}</span>
        <span>{formatDate(game.date)}</span>
        <span className="spacer" />
        <button onClick={() => store.setSaveDialog(true)}>Uložit / načíst</button>
        {!game.finished && (
          <button onClick={() => void store.skipToEnd()} disabled={busy !== null} title="Odehraje zbytek sezóny, sestavy vybírá asistent podle tvé taktiky">
            Přeskočit na konec sezóny
          </button>
        )}
        <button className="primary" onClick={() => void store.continueGame()} disabled={busy !== null}>
          {game.finished ? 'Konec sezóny' : next ? `Pokračovat · ${next.round}. kolo` : 'Pokračovat'}
          <kbd>mezerník</kbd>
        </button>
      </header>
      <nav className="sidebar" aria-label="hlavní menu">
        {NAV.map((n) => (
          <button key={n.label} className={screen.name === n.screen.name ? 'active' : ''} onClick={() => store.navigate(n.screen)}>
            {n.label}
          </button>
        ))}
        {game.finished && (
          <button className={screen.name === 'seasonEnd' ? 'active' : ''} onClick={() => store.navigate({ name: 'seasonEnd' })}>
            Konec sezóny
          </button>
        )}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
