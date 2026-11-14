// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDefaultData } from '../src/engine/data.ts';
import { memoryStorage } from '../src/state/persistence.ts';
import { createAppStore, setAppStore } from '../src/state/store.ts';
import { App, isContinueKey } from '../src/ui/App.tsx';
import { clubAccent, contrast } from '../src/ui/theme.ts';

const data = loadDefaultData();
function setup(clubId = 'slavia-praha') {
  const store = createAppStore({ data, storage: memoryStorage(), yieldToUi: async () => {} });
  setAppStore(store);
  store.getState().startNewGame({ clubId, managerName: 'Test', seed: 'ui' });
  render(<App />);
  return store;
}
afterEach(cleanup);

describe('UI', () => {
  it('Domů ukáže dalšího soupeře a kolo', () => {
    const store = setup();
    const game = store.getState().game!;
    const fixture = game.competitions[0]!.fixtures.find((f) => f.round === 1 && (f.homeId === 'slavia-praha' || f.awayId === 'slavia-praha'))!;
    const opponent = data.clubs.find((c) => c.id === (fixture.homeId === 'slavia-praha' ? fixture.awayId : fixture.homeId))!;
    expect(screen.getByRole('heading', { name: 'Další zápas' })).toBeTruthy();
    expect(screen.getAllByText(new RegExp(opponent.shortName)).length).toBeGreaterThan(0);
    expect(screen.getByText(/1\. kolo · sobota 25\. července/)).toBeTruthy();
  });

  it('soupiska se řadí podle CEL', () => {
    setup();
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Soupiska' }));
    fireEvent.click(screen.getByRole('columnheader', { name: /CEL/ }));
    const cel = screen.getAllByRole('row').slice(1).map((r) => Number(within(r).getAllByRole('cell')[3]!.textContent));
    expect(cel).toEqual([...cel].sort((a, b) => b - a));
  });

  it('taktika: klik na dva sloty prohodí hráče', () => {
    setup();
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Taktika' }));
    const a = screen.getByTestId('slot-1');
    const b = screen.getByTestId('slot-2');
    const [ta, tb] = [a.textContent, b.textContent];
    fireEvent.click(a);
    fireEvent.click(b);
    expect(screen.getByTestId('slot-1').textContent).not.toBe(ta);
    expect(screen.getByTestId('slot-2').textContent).not.toBe(tb);
  });

  it('mezerník spustí Pokračovat a ukáže výsledek zápasu', async () => {
    setup();
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByTestId('score')).toBeTruthy();
    expect(screen.getByTestId('explanation').textContent).toMatch(/xG/);
  });

  it('mezerník při psaní do pole nebo na tlačítku nic nespustí', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    const div = document.createElement('div');
    const ev = (target: EventTarget) => ({ key: ' ', code: 'Space', target }) as unknown as KeyboardEvent;
    expect(isContinueKey(ev(input))).toBe(false);
    expect(isContinueKey(ev(button))).toBe(false);
    expect(isContinueKey(ev(div))).toBe(true);
  });

  it('akcentová barva klubu je vždy čitelná s bílým textem', () => {
    for (const club of data.clubs) {
      const { accent, onAccent } = clubAccent(club);
      expect(contrast(accent, onAccent), club.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});
