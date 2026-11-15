import { acceptTip, declineTip, fireScout, hireScout, setScoutTask } from '../../engine/game/scouting.ts';
import { Rng } from '../../engine/rng.ts';
import type { Scout } from '../../engine/game/state.ts';
import { POSITION_LABEL_CS } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { money } from '../format.ts';
import { rangeLabel } from '../market.tsx';
import { estimateOf } from '../../engine/game/scouting.ts';
import { exactAge } from '../../engine/game/development.ts';

function taskValue(t: Scout['task']): string {
  if (!t) return '';
  if (t.kind === 'region') return `region:${t.regionId}`;
  if (t.kind === 'competition') return `competition:${t.competitionId}:${t.focus}`;
  return `player:${t.playerId}`;
}

function parseTask(v: string): Scout['task'] {
  const [kind, a, b] = v.split(':');
  if (kind === 'region' && a) return { kind: 'region', regionId: a };
  if (kind === 'competition' && a) return { kind: 'competition', competitionId: a as never, focus: b === 'bargains' ? 'bargains' : 'talents' };
  if (kind === 'player' && a) return { kind: 'player', playerId: a };
  return null;
}

export function ScoutingScreen() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const s = data.balance.scouting;
  const sc = game.scouting;
  const known = Object.keys(sc.knowledge).length;
  const playerName = (id: string) => {
    const p = game.players.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : 'hráč';
  };
  return (
    <div className="grid">
      <section className="card">
        <h2>Skauting</h2>
        <p className="help">
          Skaut zpřesňuje odhad CEL a POT: začátečník ±{s.levels.začátečník.accuracy}, zkušený ±{s.levels.zkušený.accuracy}, elitní ±{s.levels.elitní.accuracy}. Opakované sledování a víc skautů
          odhad zužuje. V kraji hledá mladé talenty (i mimo akademie – tipy), v soutěži talenty nebo levné hráče. Klub teď zná {known} hráčů.
        </p>
      </section>
      <section className="card">
        <h3>Moji skauti</h3>
        {sc.scouts.length === 0 ? (
          <p className="muted">Zatím žádní. Najmi je z kandidátů níže (max. {s.maxScouts}).</p>
        ) : (
          <table className="data">
            <tbody>
              {sc.scouts.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.level}</td>
                  <td className="num">{money(x.salary)}/měs.</td>
                  <td>
                    <select value={taskValue(x.task)} onChange={(e) => store.market((g) => setScoutTask(g, x.id, parseTask(e.target.value)))} aria-label={`úkol skauta ${x.name}`}>
                      <option value="">bez úkolu</option>
                      {x.task?.kind === 'player' && <option value={taskValue(x.task)}>sleduje: {playerName(x.task.playerId)}</option>}
                      <optgroup label="Kraj (mládež a tipy)">
                        {data.regions.map((r) => (
                          <option key={r.id} value={`region:${r.id}`}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Soutěž – talenty do 21 let">
                        {data.competitions.map((c) => (
                          <option key={c.id} value={`competition:${c.id}:talents`}>
                            {c.shortName}: talenty
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Soutěž – končící smlouvy a hráči na prodej">
                        {data.competitions.map((c) => (
                          <option key={c.id} value={`competition:${c.id}:bargains`}>
                            {c.shortName}: příležitosti
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => store.market((g) => fireScout(g, x.id))}>Propustit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {sc.tips.length > 0 && (
        <section className="card">
          <h3>Tipy na talenty</h3>
          <table className="data">
            <tbody>
              {sc.tips.map((t) => {
                const e = estimateOf(game, data, t.player);
                return (
                  <tr key={t.id}>
                    <td>
                      {t.player.firstName} {t.player.lastName}
                    </td>
                    <td>{POSITION_LABEL_CS[t.player.positions[0]!]}</td>
                    <td className="num">{Math.floor(exactAge(t.player.birthDate, game.date))} let</td>
                    <td>{data.regions.find((r) => r.id === t.regionId)?.name}</td>
                    <td className="num">POT {rangeLabel(e?.pot)}</td>
                    <td className="num">{money(t.cost)}</td>
                    <td className="row">
                      <button className="primary" onClick={() => store.market((g, d) => acceptTip(g, d, t.id, new Rng(`${g.seed}/tip/${t.id}`)))}>
                        Přivést do akademie
                      </button>
                      <button onClick={() => store.market((g) => declineTip(g, t.id))}>Nezájem</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="help">Peníze jdou na jednání s rodinou; přesvědčit ji se podaří zhruba v {Math.round(s.tips.persuadeChance * 100)} % případů.</p>
        </section>
      )}
      <section className="card">
        <h3>Kandidáti</h3>
        <table className="data">
          <tbody>
            {sc.candidates.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.level}</td>
                <td className="num">{money(c.salary)}/měs.</td>
                <td>
                  <button onClick={() => store.market((g, d) => hireScout(g, d, c.id) ?? `${c.name} nastupuje jako skaut.`)}>Najmout</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help">Nabídka kandidátů se obnoví každý červenec. Bývalí hráči klubu se po konci kariéry nabízejí sami.</p>
      </section>
    </div>
  );
}
