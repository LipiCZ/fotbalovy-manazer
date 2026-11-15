import { useEffect } from 'react';
import { getAppStore, useApp, type Screen } from '../state/store.ts';
import { Layout } from './Layout.tsx';
import { SaveDialog } from './SaveDialog.tsx';
import { CompetitionsScreen } from './screens/Competitions.tsx';
import { FinanceScreen } from './screens/Finance.tsx';
import { ScoutingScreen } from './screens/Scouting.tsx';
import { ClubScreen } from './screens/Club.tsx';
import { LiveScreen } from './screens/Live.tsx';
import { CareerScreen } from './screens/Career.tsx';
import { TransfersScreen } from './screens/Transfers.tsx';
import { HomeScreen } from './screens/Home.tsx';
import { MatchScreen } from './screens/Match.tsx';
import { NewGameScreen } from './screens/NewGame.tsx';
import { PlayerScreen } from './screens/Player.tsx';
import { SeasonEndScreen } from './screens/SeasonEnd.tsx';
import { SquadScreen } from './screens/Squad.tsx';
import { StartScreen } from './screens/Start.tsx';
import { TacticsScreen } from './screens/Tactics.tsx';

function GameScreen({ screen }: { screen: Screen }) {
  switch (screen.name) {
    case 'home':
      return <HomeScreen />;
    case 'squad':
      return <SquadScreen />;
    case 'player':
      return <PlayerScreen key={screen.playerId} playerId={screen.playerId} />;
    case 'tactics':
      return <TacticsScreen />;
    case 'match':
      return <MatchScreen key={screen.reportIndex} reportIndex={screen.reportIndex} />;
    case 'competitions':
      return <CompetitionsScreen key={screen.competitionId ?? ''} {...(screen.competitionId ? { competitionId: screen.competitionId } : {})} />;
    case 'seasonEnd':
      return <SeasonEndScreen />;
    case 'finance':
      return <FinanceScreen />;
    case 'transfers':
      return <TransfersScreen key={screen.tab ?? ''} {...(screen.tab ? { tab: screen.tab } : {})} />;
    case 'scouting':
      return <ScoutingScreen />;
    case 'club':
      return <ClubScreen />;
    case 'live':
      return <LiveScreen />;
    case 'career':
      return <CareerScreen />;
    default:
      return <HomeScreen />;
  }
}

/** Space = Continue (design, section 15), except while typing or when a button has focus. */
export function isContinueKey(e: KeyboardEvent): boolean {
  if (e.code !== 'Space' && e.key !== ' ') return false;
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName?.toLowerCase();
  return !(tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || t?.isContentEditable);
}

export function App() {
  const screen = useApp((s) => s.screen);
  const game = useApp((s) => s.game);
  const busy = useApp((s) => s.busy);
  const message = useApp((s) => s.message);
  const saveDialog = useApp((s) => s.saveDialog);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getAppStore().getState();
      if (!s.game || s.busy || s.saveDialog || s.live || s.screen.name === 'start' || s.screen.name === 'newGame') return;
      if (!isContinueKey(e)) return;
      e.preventDefault();
      void s.continueGame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (message?.kind !== 'info') return;
    const t = setTimeout(() => getAppStore().getState().showMessage(null), 3000);
    return () => clearTimeout(t);
  }, [message]);

  const content =
    screen.name === 'newGame' ? (
      <NewGameScreen />
    ) : screen.name === 'start' || !game ? (
      <StartScreen />
    ) : (
      <Layout>
        <GameScreen screen={screen} />
      </Layout>
    );

  return (
    <>
      {content}
      {saveDialog && game && <SaveDialog />}
      {busy && (
        <div className="overlay">
          <div className="modal" role="status">
            <h3>{busy.label}</h3>
            <div className="progress">
              <div style={{ width: `${Math.round(busy.progress * 100)}%` }} />
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className={`message ${message.kind}`} role="alert">
          <span style={{ flex: 1 }}>{message.text}</span>
          <button className="link" onClick={() => getAppStore().getState().showMessage(null)} aria-label="zavřít zprávu">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
