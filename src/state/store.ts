// Application state (Zustand). The engine mutates the GameState in place; `revision` is bumped
// after every change so that React re-renders.

import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { GameData } from '../engine/data.ts';
import { advanceDay, advanceToNextUserMatch, invalidateRuntime, newGame, runtimeOf, squadOf } from '../engine/game/advance.ts';
import { exactAge } from '../engine/game/development.ts';
import { startNewSeason } from '../engine/game/transition.ts';
import { repayLoan, setTicketPrice, takeLoan } from '../engine/game/finance.ts';
import { moveUserPlayer, type SquadTarget } from '../engine/game/userTeam.ts';
import { makeSave, parseSave, serializeSave } from '../engine/game/saveFormat.ts';
import type { GameState, NewsItem, TrainingSetting, UserTeamState } from '../engine/game/state.ts';
import type { CompetitionId, Player } from '../engine/types.ts';
import type { SaveListItem, SaveStorage, Slot } from './persistence.ts';

export type Screen =
  | { name: 'start' }
  | { name: 'newGame' }
  | { name: 'home' }
  | { name: 'squad' }
  | { name: 'player'; playerId: string }
  | { name: 'tactics' }
  | { name: 'match'; reportIndex: number }
  | { name: 'competitions'; competitionId?: CompetitionId }
  | { name: 'seasonEnd' }
  | { name: 'finance' }
  | { name: 'transfers'; tab?: TransfersTab }
  | { name: 'scouting' };

export type TransfersTab = 'search' | 'offers' | 'free' | 'mine';

/** Result of a market action: a message for the manager (ok = good news). */
export type MarketAction = (game: GameState, data: GameData, news: NewsItem[]) => { ok?: boolean; message: string } | string | null | void;

export interface Message {
  kind: 'info' | 'warn' | 'error';
  text: string;
}

export interface AppState {
  data: GameData;
  game: GameState | null;
  revision: number;
  screen: Screen;
  history: Screen[];
  busy: { label: string; progress: number } | null;
  message: Message | null;
  saves: SaveListItem[];
  saveDialog: boolean;

  navigate(screen: Screen): void;
  back(): void;
  startNewGame(opts: { clubId: string; managerName: string; seed: string }): void;
  continueGame(): Promise<void>;
  skipToEnd(): Promise<void>;
  /** Changes the manager's team (tactics screen). */
  editUser(fn: (user: UserTeamState, squad: Player[]) => void): void;
  startNextSeason(): Promise<void>;
  movePlayer(playerId: string, target: SquadTarget): void;
  releaseFromAcademy(playerId: string): void;
  setTraining(training: TrainingSetting): void;
  setTicketPrice(price: number): void;
  takeLoan(amount: number): void;
  repayLoan(amount: number): void;
  /** Transfers, contracts and scouting (engine functions in game/market.ts and game/scouting.ts). */
  market(fn: MarketAction): void;
  saveTo(slot: Slot): Promise<void>;
  loadFrom(slot: Slot): Promise<void>;
  refreshSaves(): Promise<void>;
  exportGame(): { fileName: string; text: string } | null;
  importGame(text: string): void;
  setSaveDialog(open: boolean): void;
  showMessage(message: Message | null): void;
}

export interface StoreDeps {
  data: GameData;
  storage: SaveStorage;
  now?: () => Date;
  /** Yields to the browser between simulated days (keeps the UI responsive). */
  yieldToUi?: () => Promise<void>;
}

export function createAppStore(deps: StoreDeps): StoreApi<AppState> {
  const now = deps.now ?? (() => new Date());
  const yieldToUi = deps.yieldToUi ?? (() => new Promise<void>((r) => setTimeout(r, 0)));

  return createStore<AppState>((set, get) => {
    const bump = () => set((s) => ({ revision: s.revision + 1 }));
    const persist = async (slot: Slot, label: string) => {
      const { game, data } = get();
      if (!game) return;
      const save = makeSave(game, data, label, now().toISOString());
      await deps.storage.write(slot, save.meta, serializeSave(save));
    };
    const autosave = async () => {
      try {
        await persist('auto', 'Automatické uložení');
        await get().refreshSaves();
      } catch (e) {
        set({ message: { kind: 'warn', text: `Automatické uložení selhalo: ${(e as Error).message}` } });
      }
    };
    const openGame = (game: GameState, warnings: string[]) => {
      set({
        game,
        revision: get().revision + 1,
        screen: game.finished ? { name: 'seasonEnd' } : { name: 'home' },
        history: [],
        message: warnings.length > 0 ? { kind: 'warn', text: warnings.join(' ') } : null,
        saveDialog: false,
      });
    };

    return {
      data: deps.data,
      game: null,
      revision: 0,
      screen: { name: 'start' },
      history: [],
      busy: null,
      message: null,
      saves: [],
      saveDialog: false,

      navigate(screen) {
        set((s) => ({ screen, history: [...s.history, s.screen].slice(-30) }));
      },
      back() {
        set((s) => {
          const history = [...s.history];
          const prev = history.pop();
          return prev ? { screen: prev, history } : {};
        });
      },
      startNewGame({ clubId, managerName, seed }) {
        const game = newGame(get().data, { seed, clubId, managerName });
        openGame(game, []);
        void autosave();
      },
      async continueGame() {
        const { game, data, busy } = get();
        if (!game || busy) return;
        if (game.finished) return get().navigate({ name: 'seasonEnd' });
        const days = advanceToNextUserMatch(game, data);
        bump();
        const last = days.at(-1);
        if (last?.userReport && game.user) get().navigate({ name: 'match', reportIndex: game.user.matches.length - 1 });
        else if (game.finished) get().navigate({ name: 'seasonEnd' });
        await autosave();
      },
      async skipToEnd() {
        const { game, data, busy } = get();
        if (!game || busy || game.finished) return;
        const total = game.competitions.reduce((s, c) => s + c.roundDates.length, 0);
        set({ busy: { label: 'Simuluji zbytek sezóny…', progress: 0 } });
        // While skipping the manager cannot react, so the assistant picks the line-ups (with the manager's style).
        const autoBefore = game.user?.autoLineup ?? false;
        if (game.user) game.user.autoLineup = true;
        try {
          while (advanceDay(game, data)) {
            const done = game.competitions.reduce((s, c) => s + c.playedRounds, 0);
            set({ busy: { label: 'Simuluji zbytek sezóny…', progress: done / total } });
            await yieldToUi();
          }
        } finally {
          if (game.user) game.user.autoLineup = autoBefore;
          set({ busy: null });
        }
        bump();
        get().navigate({ name: 'seasonEnd' });
        await autosave();
      },
      async startNextSeason() {
        const { game, data } = get();
        if (!game || !game.finished) return;
        startNewSeason(game, data);
        bump();
        set({ screen: { name: 'home' }, history: [] });
        await autosave();
      },
      movePlayer(playerId, target) {
        const { game, data } = get();
        if (!game?.user || !game.userClubId) return;
        const p = runtimeOf(game).byId.get(playerId);
        if (!p) return;
        const error = moveUserPlayer(p, target, game.userClubId, game.user, data, game.membership, exactAge(p.birthDate, game.date));
        if (error) return set({ message: { kind: 'warn', text: error } });
        invalidateRuntime(game);
        bump();
      },
      releaseFromAcademy(playerId) {
        const { game } = get();
        if (!game) return;
        const p = runtimeOf(game).byId.get(playerId);
        if (!p?.academy || p.clubId !== game.userClubId) return;
        game.players = game.players.filter((x) => x.id !== playerId);
        invalidateRuntime(game);
        bump();
      },
      setTicketPrice(price) {
        const { game, data } = get();
        if (!game) return;
        const error = setTicketPrice(game, data, price);
        if (error) set({ message: { kind: 'warn', text: error } });
        bump();
      },
      takeLoan(amount) {
        const { game, data } = get();
        if (!game) return;
        const error = takeLoan(game, data, amount);
        set({ message: error ? { kind: 'warn', text: error } : { kind: 'info', text: 'Úvěr přijat.' } });
        bump();
      },
      market(fn) {
        const { game, data } = get();
        if (!game) return;
        const news: NewsItem[] = [];
        const r = fn(game, data, news);
        game.news.push(...news);
        invalidateRuntime(game);
        if (typeof r === 'string') set({ message: { kind: 'info', text: r } });
        else if (r) set({ message: { kind: r.ok === false ? 'warn' : 'info', text: r.message } });
        bump();
      },
      repayLoan(amount) {
        const { game } = get();
        if (!game) return;
        const error = repayLoan(game, amount);
        set({ message: error ? { kind: 'warn', text: error } : { kind: 'info', text: 'Splátka provedena.' } });
        bump();
      },
      setTraining(training) {
        const { game } = get();
        if (!game?.user) return;
        game.user.training = training;
        bump();
      },
      editUser(fn) {
        const { game } = get();
        if (!game?.user || !game.userClubId) return;
        fn(game.user, squadOf(game, game.userClubId));
        bump();
      },
      async saveTo(slot) {
        try {
          await persist(slot, slot === 'auto' ? 'Automatické uložení' : 'Ruční uložení');
          await get().refreshSaves();
          set({ message: { kind: 'info', text: 'Hra uložena.' } });
        } catch (e) {
          set({ message: { kind: 'error', text: `Uložení selhalo: ${(e as Error).message}` } });
        }
      },
      async loadFrom(slot) {
        try {
          const text = await deps.storage.read(slot);
          if (!text) throw new Error('Na této pozici není uložená hra.');
          const { save, warnings } = parseSave(text, get().data);
          openGame(save.game, warnings);
        } catch (e) {
          set({ message: { kind: 'error', text: (e as Error).message } });
        }
      },
      async refreshSaves() {
        try {
          set({ saves: await deps.storage.list() });
        } catch {
          set({ saves: [] });
        }
      },
      exportGame() {
        const { game, data } = get();
        if (!game) return null;
        const save = makeSave(game, data, 'Export', now().toISOString());
        const club = data.clubs.find((c) => c.id === game.userClubId)?.id ?? 'hra';
        return { fileName: `fotbalovy-manazer-${club}-${game.date}.json`, text: serializeSave(save) };
      },
      importGame(text) {
        try {
          const { save, warnings } = parseSave(text, get().data);
          openGame(save.game, warnings);
          void autosave();
        } catch (e) {
          set({ message: { kind: 'error', text: (e as Error).message } });
        }
      },
      setSaveDialog(open) {
        set({ saveDialog: open });
        if (open) void get().refreshSaves();
      },
      showMessage(message) {
        set({ message });
      },
    };
  });
}

// ---------------------------------------------------------------- React binding

let appStore: StoreApi<AppState> | null = null;

export function setAppStore(store: StoreApi<AppState>): void {
  appStore = store;
}

export function getAppStore(): StoreApi<AppState> {
  if (!appStore) throw new Error('Store není inicializovaný');
  return appStore;
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(getAppStore(), selector);
}

/** The game state; re-renders on every engine change. Throws when no game is open. */
export function useGame(): { game: GameState; data: GameData; revision: number } {
  const game = useApp((s) => s.game);
  const data = useApp((s) => s.data);
  const revision = useApp((s) => s.revision);
  if (!game) throw new Error('Není otevřená žádná hra');
  return { game, data, revision };
}
