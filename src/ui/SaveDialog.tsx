import { useRef } from 'react';
import { SLOT_LABEL, SLOTS, type Slot } from '../state/persistence.ts';
import { getAppStore, useApp } from '../state/store.ts';
import { formatDate } from './format.ts';

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SaveDialog() {
  const saves = useApp((s) => s.saves);
  const store = getAppStore().getState();
  const file = useRef<HTMLInputElement>(null);
  const meta = (slot: Slot) => saves.find((s) => s.slot === slot)?.meta;

  return (
    <div className="overlay" onClick={() => store.setSaveDialog(false)}>
      <div className="modal" role="dialog" aria-label="uložit a načíst" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Uložit a načíst</h2>
          <button onClick={() => store.setSaveDialog(false)} aria-label="zavřít">
            ✕
          </button>
        </div>
        <p className="help">Hra se ukládá automaticky po každém zápase. Uložené hry jsou jen v tomto prohlížeči, na jiný počítač je přenese export do souboru.</p>
        <table className="data">
          <tbody>
            {SLOTS.map((slot) => {
              const m = meta(slot);
              return (
                <tr key={slot}>
                  <td>
                    <strong>{SLOT_LABEL[slot]}</strong>
                    <br />
                    <span className="muted">{m ? `${m.clubName} · ${formatDate(m.date)} · uloženo ${new Date(m.savedAt).toLocaleString('cs-CZ')}` : 'prázdné'}</span>
                  </td>
                  <td className="num">
                    {slot !== 'auto' && <button onClick={() => void store.saveTo(slot)}>Uložit sem</button>}{' '}
                    <button disabled={!m} onClick={() => void store.loadFrom(slot)}>
                      Načíst
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 14 }}>
          <button
            onClick={() => {
              const out = store.exportGame();
              if (out) downloadText(out.fileName, out.text);
            }}
          >
            Exportovat do souboru
          </button>
          <button onClick={() => file.current?.click()}>Importovat ze souboru…</button>
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
          <span style={{ flex: 1 }} />
          <button onClick={() => store.navigate({ name: 'start' })}>Hlavní menu</button>
        </div>
      </div>
    </div>
  );
}
