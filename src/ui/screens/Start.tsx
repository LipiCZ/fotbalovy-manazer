import { useEffect, useRef } from 'react';
import { SLOT_LABEL } from '../../state/persistence.ts';
import { getAppStore, useApp } from '../../state/store.ts';
import { formatDate, seasonLabel } from '../format.ts';

export function StartScreen() {
  const saves = useApp((s) => s.saves);
  const file = useRef<HTMLInputElement>(null);
  const store = getAppStore().getState();
  useEffect(() => void getAppStore().getState().refreshSaves(), []);
  const auto = saves.find((s) => s.slot === 'auto');

  return (
    <div className="start">
      <h1>⚽ Fotbalový manažer CZ</h1>
      <p className="muted">Chance Liga, Chance Národní Liga, ČFL a MSFL. 82 klubů, fiktivní hráči.</p>
      <div className="card grid">
        {auto && (
          <button className="primary" onClick={() => void store.loadFrom('auto')}>
            Pokračovat: {auto.meta.clubName} · {seasonLabel(auto.meta.seasonYear)} · {formatDate(auto.meta.date)}
          </button>
        )}
        <button className={auto ? '' : 'primary'} onClick={() => store.navigate({ name: 'newGame' })}>
          Nová hra
        </button>
        {saves.filter((s) => s.slot !== 'auto').length > 0 && (
          <div>
            <h3>Uložené hry</h3>
            <div className="grid">
              {saves
                .filter((s) => s.slot !== 'auto')
                .map((s) => (
                  <button key={s.slot} onClick={() => void store.loadFrom(s.slot)}>
                    {SLOT_LABEL[s.slot]}: {s.meta.clubName} · {formatDate(s.meta.date)} · trenér {s.meta.managerName}
                  </button>
                ))}
            </div>
          </div>
        )}
        <button onClick={() => file.current?.click()}>Načíst ze souboru…</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="soubor s uloženou hrou"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) store.importGame(await f.text());
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
