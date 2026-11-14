import { competitionOfClub, tableFor } from '../../engine/game/advance.ts';
import { averageRating, bestRated, topScorers } from '../../engine/game/stats.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ClubLabel, clubOf, playerOf, PlayerLink } from '../components.tsx';
import { num, seasonLabel } from '../format.ts';

export function SeasonEndScreen() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const userClubId = game.userClubId as string;
  const my = competitionOfClub(game, userClubId)!;
  const myTable = tableFor(game, my.id, data);
  const position = myTable.findIndex((r) => r.clubId === userClubId) + 1;
  const myRow = myTable[position - 1];
  const competition = data.competitions.find((c) => c.id === my.id)!;
  const scorer = topScorers(game, my.id, 1)[0];
  const best = bestRated(game, my.id, 10, 1)[0];
  const myBest = topScorers(game, my.id, 200).find((r) => r.clubId === userClubId);

  return (
    <div className="grid">
      <section className="card">
        <h2>{game.finished ? `Konec sezóny ${seasonLabel(game.seasonYear)}` : 'Sezóna ještě běží'}</h2>
        {myRow && (
          <p className="big" data-testid="final-position">
            {clubOf(data, userClubId)?.name}: {position}. místo v soutěži {competition.name} ({myRow.points} bodů, skóre {myRow.goalsFor}:{myRow.goalsAgainst})
          </p>
        )}
        <p className="muted">
          Trenér {game.managerName}. Přechod do další sezóny (postupy, sestupy, vývoj hráčů) přijde v další fázi hry.
        </p>
        <div className="row">
          <button onClick={() => store.navigate({ name: 'competitions', competitionId: my.id })}>Konečné tabulky</button>
          <button onClick={() => store.navigate({ name: 'start' })}>Hlavní menu</button>
        </div>
      </section>
      <div className="grid cols-3">
        <section className="card">
          <h3>Vítězové soutěží</h3>
          <table className="data">
            <tbody>
              {data.competitions.map((c) => {
                const winner = tableFor(game, c.id, data)[0];
                return (
                  <tr key={c.id}>
                    <td>{c.shortName}</td>
                    <td>
                      <ClubLabel club={clubOf(data, winner?.clubId)} />
                    </td>
                    <td className="num">{winner?.points} b.</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>Nejlepší střelec ({competition.shortName})</h3>
          {scorer && (
            <p>
              <PlayerLink player={playerOf(game, scorer.playerId)!} /> ({clubOf(data, scorer.clubId)?.shortName}): <strong>{scorer.stats.goals} gólů</strong>
            </p>
          )}
          {myBest && (
            <p className="muted">
              Nejlepší střelec tvého týmu: <PlayerLink player={playerOf(game, myBest.playerId)!} />, {myBest.stats.goals} gólů
            </p>
          )}
        </section>
        <section className="card">
          <h3>Nejlepší průměrná známka</h3>
          {best && (
            <p>
              <PlayerLink player={playerOf(game, best.playerId)!} /> ({clubOf(data, best.clubId)?.shortName}): <strong>{num(averageRating(best.stats) ?? 0, 2)}</strong> v{' '}
              {best.stats.apps} zápasech
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
