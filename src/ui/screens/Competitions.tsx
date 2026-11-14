import { useState } from 'react';
import { competitionOfClub, tableFor } from '../../engine/game/advance.ts';
import { topScorers } from '../../engine/game/stats.ts';
import type { CompetitionId } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ClubLabel, clubOf, FormBadges, outcomeFor, playerOf, PlayerLink } from '../components.tsx';
import { formatDate } from '../format.ts';

type Tab = 'table' | 'fixtures' | 'scorers';

export function CompetitionsScreen({ competitionId }: { competitionId?: CompetitionId }) {
  const { game, data } = useGame();
  const userClubId = game.userClubId as string;
  const [compId, setCompId] = useState<CompetitionId>(competitionId ?? competitionOfClub(game, userClubId)?.id ?? 'chance-liga');
  const [tab, setTab] = useState<Tab>('table');
  const progress = game.competitions.find((c) => c.id === compId)!;
  const [round, setRound] = useState(Math.max(1, Math.min(progress.playedRounds + 1, progress.roundDates.length)));
  const table = tableFor(game, compId, data);
  const shownRound = Math.min(round, progress.roundDates.length);

  return (
    <div className="card">
      <div className="tabs">
        {data.competitions.map((c) => (
          <button
            key={c.id}
            className={c.id === compId ? 'active' : ''}
            onClick={() => {
              setCompId(c.id);
              const p = game.competitions.find((x) => x.id === c.id)!;
              setRound(Math.max(1, Math.min(p.playedRounds + 1, p.roundDates.length)));
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="tabs">
        {(
          [
            ['table', 'Tabulka'],
            ['fixtures', 'Rozpis a výsledky'],
            ['scorers', 'Střelci'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        <span className="muted" style={{ alignSelf: 'center' }}>
          odehráno {progress.playedRounds} z {progress.roundDates.length} kol
        </span>
      </div>

      {tab === 'table' && (
        <table className="data" aria-label="tabulka">
          <thead>
            <tr>
              <th>#</th>
              <th>Klub</th>
              <th className="num">Z</th>
              <th className="num">V</th>
              <th className="num">R</th>
              <th className="num">P</th>
              <th className="num">Skóre</th>
              <th className="num">+/−</th>
              <th className="num">Body</th>
              <th>Forma</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => {
              const results = progress.results.filter((x) => x.homeId === r.clubId || x.awayId === r.clubId).slice(-5);
              return (
                <tr key={r.clubId} className={r.clubId === userClubId ? 'me' : ''}>
                  <td>{i + 1}.</td>
                  <td>
                    <ClubLabel club={clubOf(data, r.clubId)} />
                  </td>
                  <td className="num">{r.played}</td>
                  <td className="num">{r.won}</td>
                  <td className="num">{r.drawn}</td>
                  <td className="num">{r.lost}</td>
                  <td className="num">
                    {r.goalsFor}:{r.goalsAgainst}
                  </td>
                  <td className="num">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                  <td className="num">
                    <strong>{r.points}</strong>
                  </td>
                  <td>
                    <FormBadges outcomes={results.map((x) => outcomeFor(x, r.clubId))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tab === 'fixtures' && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <button disabled={shownRound <= 1} onClick={() => setRound(shownRound - 1)}>
              ←
            </button>
            <strong>
              {shownRound}. kolo · {formatDate(progress.roundDates[shownRound - 1]!)}
            </strong>
            <button disabled={shownRound >= progress.roundDates.length} onClick={() => setRound(shownRound + 1)}>
              →
            </button>
          </div>
          <table className="data">
            <tbody>
              {progress.fixtures
                .filter((f) => f.round === shownRound)
                .map((f) => {
                  const r = progress.results.find((x) => x.round === f.round && x.homeId === f.homeId);
                  const mine = f.homeId === userClubId || f.awayId === userClubId;
                  const reportIndex = mine && r ? progress.results.filter((x) => x.homeId === userClubId || x.awayId === userClubId).indexOf(r) : -1;
                  return (
                    <tr key={f.homeId} className={mine ? 'me' : ''}>
                      <td style={{ width: '35%' }}>{clubOf(data, f.homeId)?.shortName}</td>
                      <td className="num">
                        {r ? (
                          <strong>
                            {r.homeGoals}:{r.awayGoals}
                          </strong>
                        ) : (
                          <span className="muted">–:–</span>
                        )}
                      </td>
                      <td style={{ width: '35%' }}>{clubOf(data, f.awayId)?.shortName}</td>
                      <td>
                        {reportIndex >= 0 && (
                          <button className="link muted" onClick={() => getAppStore().getState().navigate({ name: 'match', reportIndex })}>
                            detail
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </>
      )}

      {tab === 'scorers' && (
        <table className="data" aria-label="střelci">
          <thead>
            <tr>
              <th>#</th>
              <th>Hráč</th>
              <th>Klub</th>
              <th className="num">Góly</th>
              <th className="num">Asistence</th>
              <th className="num">Zápasy</th>
            </tr>
          </thead>
          <tbody>
            {topScorers(game, compId, 25).map((row, i) => {
              const p = playerOf(game, row.playerId)!;
              return (
                <tr key={row.playerId} className={row.clubId === userClubId ? 'me' : ''}>
                  <td>{i + 1}.</td>
                  <td>
                    <PlayerLink player={p} />
                  </td>
                  <td>
                    <ClubLabel club={clubOf(data, row.clubId)} />
                  </td>
                  <td className="num">
                    <strong>{row.stats.goals}</strong>
                  </td>
                  <td className="num">{row.stats.assists}</td>
                  <td className="num">{row.stats.apps}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
