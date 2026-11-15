import { useMemo } from 'react';
import { evaluateSeason } from '../../engine/game/board.ts';
import { captainDamps, captainOf, cityShare, projectCost, requestCityDeal, requiredStadiumLevel, resolveDecision, startStadiumProject } from '../../engine/game/club.ts';
import type { EventsSetting } from '../../engine/data.ts';
import type { RelationId } from '../../engine/game/state.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { formatDate, money } from '../format.ts';

const RELATIONS: { id: RelationId; label: string; help: string }[] = [
  { id: 'fans', label: 'Fanoušci', help: 'Výhry (derby dvojnásob), levné vstupenky, nová tribuna. Vliv: návštěva ±10 %.' },
  { id: 'board', label: 'Vedení', help: 'Ukazuje průběžné hodnocení sezóny podle cílů a zdravých financí.' },
  { id: 'city', label: 'Město', help: 'Akademie s dětmi z města, akce pro komunitu, splněné dohody. Vliv: podíl města na stavbě stadionu.' },
  { id: 'squad', label: 'Kabina', help: 'Výhry, minuty pro hráče ve formě. Vliv: síla týmu ±3 %. Kapitán s vůdcovstvím 70+ tlumí propady.' },
];

const EVENTS: EventsSetting[] = ['vypnuto', 'občas', 'často'];

function Bar({ value }: { value: number }) {
  const cls = value >= 60 ? 'good' : value < 40 ? 'bad' : '';
  return (
    <span className="row" style={{ gap: 8 }}>
      <div className="bar" style={{ width: 140 }}>
        <div style={{ width: `${value}%` }} />
      </div>
      <strong className={cls}>{Math.round(value)}</strong>
    </span>
  );
}

export function ClubScreen() {
  const { game, data, revision } = useGame();
  const store = getAppStore().getState();
  const club = game.club;
  const userId = game.userClubId as string;
  const f = game.finances[userId];
  const projection = useMemo(() => ((game.user?.matches.length ?? 0) >= 3 ? evaluateSeason(game, data, false) : null), [game, data, revision]);
  if (!club || !f) return <p>Klub nenalezen.</p>;
  const levels = data.balance.club.stadium.levels;
  const current = levels[club.stadiumLevel - 1];
  const next = levels[club.stadiumLevel];
  const required = requiredStadiumLevel(game, data);
  const captain = captainOf(game);
  const media = game.news.filter((n) => n.kind === 'media').slice(-8).reverse();
  const share = cityShare(game, data);
  return (
    <div className="grid cols-2">
      {club.decisions.length > 0 && (
        <section className="card" style={{ gridColumn: '1 / -1' }} data-testid="club-decisions">
          <h3>K rozhodnutí</h3>
          {club.decisions.map((d) => (
            <div key={d.id} style={{ marginBottom: 12 }}>
              <strong>{d.title}</strong> <span className="muted">({formatDate(d.date)})</span>
              <p>{d.text}</p>
              <div className="row wrap">
                {d.options.map((o, i) => (
                  <button key={o.label} className={i === 0 ? 'primary' : ''} onClick={() => store.market((g, dd) => resolveDecision(g, dd, d.id, i))}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="card">
        <h3>Vztahy</h3>
        <table className="data">
          <tbody>
            {RELATIONS.map((r) => (
              <tr key={r.id} title={r.help}>
                <td>{r.label}</td>
                <td>
                  <Bar value={club.relations[r.id]} />
                </td>
                <td className="muted">{r.id === 'board' ? (projection ? `průběžně: ${projection.overall}` : 'hodnotí se po 3 zápasech') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help">
          Kapitán: {captain ? `${captain.firstName} ${captain.lastName} (vůdcovství ${Math.round(captain.leadership)})` : 'není určen'}
          {captainDamps(game, data) ? ' – tlumí propady nálady kabiny.' : '.'} Najetím myší na řádek se ukáže, co vztah ovlivňuje.
        </p>
      </section>
      <section className="card">
        <h3>Stadion</h3>
        <p>
          Úroveň {club.stadiumLevel} – {current?.label}, kapacita {f.capacity.toLocaleString('cs-CZ')}. Soutěž vyžaduje úroveň {required}.
        </p>
        {club.rented && <p className="warn">Hrajeme v pronajatém stadionu (nájem, nižší návštěva). Do příští sezóny musí být rozestavěno, jinak hrozí odečet bodů.</p>}
        {club.project ? (
          <p>
            Stavba: {levels[club.project.targetLevel - 1]?.label}, zbývá {club.project.monthsLeft} měs., cena {money(club.project.cost)}
            {club.project.cityShare > 0 ? `, město platí ${Math.round(club.project.cityShare * 100)} %` : ''}.
          </p>
        ) : next ? (
          <>
            <p>
              Další úroveň: {next.label} (kapacita {next.capacity.toLocaleString('cs-CZ')}+), cena {money(projectCost(game, data))}, stavba {current?.months ?? 0} měs. Platí se měsíčně, stavba se aktivuje a odepisuje.
            </p>
            <div className="row wrap">
              <button onClick={() => store.market((g, d) => startStadiumProject(g, d, false))}>Stavět z vlastních peněz</button>
              <button className="primary" onClick={() => store.market((g, d) => requestCityDeal(g, d))} disabled={share <= 0}>
                Požádat město ({Math.round(share * 100)} %)
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Stadion má nejvyšší úroveň.</p>
        )}
        {club.cityDeal && (
          <p className="help">
            Dohoda s městem: {club.cityDeal.label} – {club.cityDeal.status === 'active' ? 'platí' : club.cityDeal.status === 'met' ? 'splněno' : 'nesplněno'}.
          </p>
        )}
      </section>
      <section className="card">
        <h3>Klub</h3>
        <p>
          Právní forma: <strong>{club.legalForm === 'spolek' ? 'spolek' : 'akciová společnost'}</strong>
          {club.investor ? `, investor ${club.investor.name} (vložil ${money(club.investor.deposit)}, chce výsledky do sezóny ${club.investor.untilSeason}/${String(club.investor.untilSeason + 1).slice(2)})` : ''}.
        </p>
        <label className="row" style={{ gap: 8 }}>
          Náhodné události:
          <select value={club.events} onChange={(e) => store.market((g) => { if (g.club) g.club.events = e.target.value as EventsSetting; })} aria-label="náhodné události">
            {EVENTS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <h3 style={{ marginTop: 12 }}>Média</h3>
        {media.length === 0 ? (
          <p className="muted">Zatím nic.</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {media.map((n, i) => (
              <li key={i}>
                <span className="muted">{formatDate(n.date)}</span> {n.text}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h3>Sociální sítě</h3>
        {club.social.length === 0 ? (
          <p className="muted">Fanoušci zatím mlčí.</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {[...club.social]
              .reverse()
              .slice(0, 12)
              .map((s, i) => (
                <li key={i}>
                  <strong>{s.author}</strong> {s.text}
                </li>
              ))}
          </ul>
        )}
        <p className="help">Jen pro náladu, čísla to nemění.</p>
      </section>
    </div>
  );
}
