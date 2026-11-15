import type { ReactNode } from 'react';
import { nextUserMatch } from '../engine/game/advance.ts';
import { getAppStore, useApp, useGame, type Screen } from '../state/store.ts';
import { clubOf } from './components.tsx';
import { formatDate, money, seasonLabel } from './format.ts';
import { runwayMonths } from '../engine/game/finance.ts';
import { clubAccent } from './theme.ts';

const NAV: { label: string; screen: Screen }[] = [
  { label: 'Domů', screen: { name: 'home' } },
  { label: 'Soupiska', screen: { name: 'squad' } },
  { label: 'Taktika', screen: { name: 'tactics' } },
  { label: 'Soutěže', screen: { name: 'competitions' } },
  { label: 'Přestupy', screen: { name: 'transfers' } },
  { label: 'Skauting', screen: { name: 'scouting' } },
  { label: 'Klub', screen: { name: 'club' } },
  { label: 'Finance', screen: { name: 'finance' } },
];

export function Layout({ children }: { children: ReactNode }) {
  const { game, data } = useGame();
  const screen = useApp((s) => s.screen);
  const busy = useApp((s) => s.busy);
  const club = clubOf(data, game.userClubId);
  const { accent, onAccent } = club ? clubAccent(club) : { accent: '#1f6f43', onAccent: '#fff' };
  const store = getAppStore().getState();
  const next = nextUserMatch(game, data);
  const finance = game.userClubId ? game.finances[game.userClubId] : undefined;
  const runway = finance ? runwayMonths(finance) : null;

  return (
    <div className="app" style={{ ['--accent' as string]: accent, ['--on-accent' as string]: onAccent }}>
      <header className="topbar">
        <span className="club">{club?.name}</span>
        <span>Sezóna {seasonLabel(game.seasonYear)}</span>
        <span>{formatDate(game.date)}</span>
        {finance && (
          <button className="link" style={{ color: 'inherit' }} onClick={() => store.navigate({ name: 'finance' })} title="Peníze na účtu a na kolik měsíců vydrží">
            💰 {money(finance.cash)}
            {runway !== null && runway < 12 ? ` · vydrží ${Math.floor(runway)} měs.` : ''}
          </button>
        )}
        <span className="spacer" />
        <button onClick={() => store.setSaveDialog(true)}>Uložit / načíst</button>
        {!game.finished && (
          <button onClick={() => void store.skipToEnd()} disabled={busy !== null} title="Odehraje zbytek sezóny, sestavy vybírá asistent podle tvé taktiky">
            Přeskočit na konec sezóny
          </button>
        )}
        <button className="primary" onClick={() => void store.continueGame()} disabled={busy !== null}>
          {game.finished ? 'Konec sezóny' : next ? `Pokračovat · ${next.label.split(', ').at(-1)}` : 'Pokračovat'}
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
