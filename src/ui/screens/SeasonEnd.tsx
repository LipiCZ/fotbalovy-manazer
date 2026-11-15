import { useMemo } from 'react';
import { competitionOfClub, finalStandings, squadOf } from '../../engine/game/advance.ts';
import { averageRating, bestRated, topScorers } from '../../engine/game/stats.ts';
import { computeMovements } from '../../engine/game/transition.ts';
import { overall } from '../../engine/players/rating.ts';
import { getAppStore, useApp, useGame } from '../../state/store.ts';
import { ClubLabel, clubOf, playerOf, PlayerLink } from '../components.tsx';
import { num, seasonLabel } from '../format.ts';

const REASON: Record<string, string> = {
  promoted: 'postup',
  relegated: 'sestup',
  barrage: 'baráž',
  forced: 'sestup B-týmu (A-tým sestoupil)',
  regrouped: 'přeřazení do jiné skupiny',
  removed: 'B-tým vyřazen ze soutěží',
};

export function SeasonEndScreen() {
  const { game, data, revision } = useGame();
  const busy = useApp((s) => s.busy);
  const store = getAppStore().getState();
  const userClubId = game.userClubId as string;
  const my = competitionOfClub(game, userClubId);
  const standings = useMemo(() => finalStandings(game, data), [game, data, revision]);
  const movements = useMemo(() => (game.finished ? computeMovements(game, data).movements : []), [game, data, revision]);
  if (!my) return null;
  const competition = data.competitions.find((c) => c.id === my.id)!;
  const order = standings[my.id] ?? [];
  const position = order.indexOf(userClubId) + 1;
  const scorer = topScorers(game, my.id, 1)[0];
  const best = bestRated(game, my.id, 10, 1)[0];
  const myMove = movements.find((m) => m.clubId === userClubId);
  // Development of my players this season (CEL now vs. 11 months ago).
  const risers = squadOf(game, userClubId)
    .map((p) => ({ p, delta: overall(p, data.balance) - (p.celHistory?.at(-12) ?? p.celHistory?.[0] ?? overall(p, data.balance)) }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);
  const compName = (id: string | null) => data.competitions.find((c) => c.id === id)?.shortName ?? 'mimo soutěže';

  return (
    <div className="grid">
      <section className="card">
        <h2>{game.finished ? `Konec sezóny ${seasonLabel(game.seasonYear)}` : 'Sezóna ještě běží'}</h2>
        {position > 0 && (
          <p className="big" data-testid="final-position">
            {clubOf(data, userClubId)?.name}: {position}. místo, {competition.name}
          </p>
        )}
        {myMove && (
          <p className="big">
            {myMove.reason === 'promoted' || (myMove.reason === 'barrage' && (data.competitions.find((c) => c.id === myMove.to)?.level ?? 9) < competition.level)
              ? `🎉 Postup do soutěže ${compName(myMove.to)}!`
              : `Sestup do soutěže ${compName(myMove.to)}.`}
          </p>
        )}
        <div className="row">
          {game.finished && (
            <button className="primary" disabled={busy !== null} onClick={() => void store.startNextSeason()}>
              Začít sezónu {seasonLabel(game.seasonYear + 1)}
            </button>
          )}
          <button onClick={() => store.navigate({ name: 'competitions', competitionId: my.id })}>Konečné tabulky</button>
        </div>
        {game.finished && (
          <p className="help">
            V nové sezóně: postupy a sestupy, konce kariér, nábor do akademie, nový los ligy i MOL Cupu. Žluté karty se nulují, stopky za červené zůstávají.
          </p>
        )}
      </section>
      <div className="grid cols-3">
        <section className="card">
          <h3>Vítězové</h3>
          <table className="data">
            <tbody>
              {data.competitions.map((c) => (
                <tr key={c.id}>
                  <td>{c.shortName}</td>
                  <td>
                    <ClubLabel club={clubOf(data, standings[c.id]?.[0])} />
                  </td>
                </tr>
              ))}
              <tr>
                <td>{data.pyramid.cup.name}</td>
                <td>{game.cup?.winnerId ? <ClubLabel club={clubOf(data, game.cup.winnerId)} /> : <span className="muted">nehrálo se</span>}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>Nejlepší hráči ({competition.shortName})</h3>
          {scorer && (
            <p>
              Střelec: <PlayerLink player={playerOf(game, scorer.playerId)!} /> ({clubOf(data, scorer.clubId)?.shortName}), <strong>{scorer.stats.goals} gólů</strong>
            </p>
          )}
          {best && (
            <p>
              Průměrná známka: <PlayerLink player={playerOf(game, best.playerId)!} /> ({clubOf(data, best.clubId)?.shortName}),{' '}
              <strong>{num(averageRating(best.stats) ?? 0, 2)}</strong>
            </p>
          )}
        </section>
        <section className="card">
          <h3>Největší zlepšení v kádru</h3>
          <table className="data">
            <tbody>
              {risers.map(({ p, delta }) => (
                <tr key={p.id}>
                  <td>
                    <PlayerLink player={p} />
                  </td>
                  <td className={`num ${delta > 0 ? 'good' : delta < 0 ? 'bad' : ''}`}>
                    {delta > 0 ? '+' : ''}
                    {Math.round(delta)}
                  </td>
                  <td className="num">CEL {overall(p, data.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {movements.length > 0 && (
        <section className="card">
          <h3>Postupy a sestupy</h3>
          <table className="data">
            <tbody>
              {movements
                .filter((m) => m.reason !== 'regrouped')
                .map((m) => (
                  <tr key={`${m.clubId}-${m.reason}`} className={m.clubId === userClubId ? 'me' : ''}>
                    <td>
                      <ClubLabel club={clubOf(data, m.clubId)} />
                    </td>
                    <td>
                      {compName(m.from)} → {compName(m.to)}
                    </td>
                    <td className="muted">{REASON[m.reason]}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
      {game.history.length > 0 && (
        <section className="card">
          <h3>Moje sezóny</h3>
          <table className="data">
            <tbody>
              {[...game.history].reverse().map((h) => (
                <tr key={h.seasonYear}>
                  <td>{seasonLabel(h.seasonYear)}</td>
                  <td>{compName(h.userCompetitionId)}</td>
                  <td className="num">{h.userPosition ? `${h.userPosition}. místo` : '–'}</td>
                  <td className="muted">{h.cupWinnerId === h.userClubId ? `🏆 ${data.pyramid.cup.name}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
