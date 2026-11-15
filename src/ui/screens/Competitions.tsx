import { useState } from 'react';
import { competitionOfClub, tableFor } from '../../engine/game/advance.ts';
import { groupTable, knockoutWinner, stageOf } from '../../engine/game/postseason.ts';
import type { GameState, MatchSummary } from '../../engine/game/state.ts';
import { topScorers } from '../../engine/game/stats.ts';
import type { GameData } from '../../engine/data.ts';
import type { TableRow } from '../../engine/types.ts';
import type { CompetitionId } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ClubLabel, clubOf, FormBadges, outcomeFor, playerOf, PlayerLink } from '../components.tsx';
import { formatDate } from '../format.ts';

type Tab = 'table' | 'fixtures' | 'scorers' | 'postseason';

function ResultLine({ r, data, me }: { r: MatchSummary; data: GameData; me: string }) {
  const mine = r.homeId === me || r.awayId === me;
  return (
    <tr className={mine ? 'me' : ''}>
      <td style={{ width: '38%' }}>{clubOf(data, r.homeId)?.shortName}</td>
      <td className="num">
        <strong>
          {r.homeGoals}:{r.awayGoals}
        </strong>
        {r.penalties ? <span className="muted"> pen. {r.penalties.join(':')}</span> : r.extraTime ? <span className="muted"> pp.</span> : null}
      </td>
      <td style={{ width: '38%' }}>{clubOf(data, r.awayId)?.shortName}</td>
    </tr>
  );
}

function MiniTable({ rows, offset, data, me }: { rows: TableRow[]; offset: number; data: GameData; me: string }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>#</th>
          <th>Klub</th>
          <th className="num">Z</th>
          <th className="num">Skóre</th>
          <th className="num">Body</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.clubId} className={r.clubId === me ? 'me' : ''}>
            <td>{offset + i + 1}.</td>
            <td>
              <ClubLabel club={clubOf(data, r.clubId)} />
            </td>
            <td className="num">{r.played}</td>
            <td className="num">
              {r.goalsFor}:{r.goalsAgainst}
            </td>
            <td className="num">
              <strong>{r.points}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Postseason({ game, data, me }: { game: GameState; data: GameData; me: string }) {
  const p = data.pyramid.firstLeague;
  const title = stageOf(game, 'title-group');
  if (!title) return <p className="muted">Nadstavba začne po {data.competitions.find((c) => c.id === p.id)?.name} základní části (30 kol).</p>;
  const semi = stageOf(game, 'placement-semi');
  const final = stageOf(game, 'placement-final');
  const barrage = stageOf(game, 'barrage');
  return (
    <div className="grid cols-2">
      <div>
        <h3>Skupina o titul</h3>
        <MiniTable rows={groupTable(game, 'title-group', data)} offset={0} data={data} me={me} />
        <h3 style={{ marginTop: 14 }}>Skupina o záchranu</h3>
        <MiniTable rows={groupTable(game, 'relegation-group', data)} offset={p.relegationGroup[0] - 1} data={data} me={me} />
        <p className="help">
          Každý s každým jednou, body ze základní části se přenáší. {p.directRelegation === 1 ? 'Poslední tým sestupuje' : `Posledních ${p.directRelegation} týmů sestupuje`} přímo, {p.barrage.pairs.map(([a]) => `${a}.`).join(' a ')} hraje baráž.
        </p>
      </div>
      <div>
        <h3>Play-off o {p.placementPlayoff[0]}. místo</h3>
        <table className="data">
          <tbody>
            {[...(semi?.results ?? []), ...(final?.results ?? [])].map((r) => (
              <ResultLine key={`${r.homeId}-${r.round}-${r.date}`} r={r} data={data} me={me} />
            ))}
          </tbody>
        </table>
        {final && final.results.length > 0 && <p className="help">O {p.placementPlayoff[0]}. místo vyhrál {clubOf(data, knockoutWinner(final.results))?.shortName}.</p>}
        <h3 style={{ marginTop: 14 }}>Baráž</h3>
        {!barrage ? (
          <p className="muted">Baráž se hraje po skončení nadstavby a 2. ligy.</p>
        ) : barrage.fixtures.length === 0 ? (
          <p className="muted">Letos se baráž nehraje (2. liga nemá způsobilé týmy).</p>
        ) : (
          <table className="data">
            <tbody>
              {barrage.fixtures.map((f) => {
                const r = barrage.results.find((x) => x.homeId === f.homeId && x.round === f.round);
                return r ? (
                  <ResultLine key={`${f.homeId}-${f.round}`} r={r} data={data} me={me} />
                ) : (
                  <tr key={`${f.homeId}-${f.round}`}>
                    <td>{clubOf(data, f.homeId)?.shortName}</td>
                    <td className="num muted">{f.leg}. zápas</td>
                    <td>{clubOf(data, f.awayId)?.shortName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function CupView({ game, data, me }: { game: GameState; data: GameData; me: string }) {
  const cup = game.cup;
  if (!cup) return <p className="muted">MOL Cup se v této sezóně nehraje.</p>;
  return (
    <div>
      {cup.winnerId && (
        <p className="big">
          🏆 {data.pyramid.cup.name} vyhrál {clubOf(data, cup.winnerId)?.name}
        </p>
      )}
      <div className="grid cols-3">
        {cup.rounds.map((round, i) => (
          <section key={round.name} className="card" style={{ padding: 10 }}>
            <h3>
              {round.name} <span className="muted">{formatDate(round.date)}</span>
            </h3>
            {round.ties.length === 0 ? (
              <p className="muted">{i > cup.current ? 'los po předchozím kole' : '–'}</p>
            ) : (
              <table className="data">
                <tbody>
                  {round.ties.map((t) =>
                    t.result ? (
                      <ResultLine key={t.homeId} r={t.result} data={data} me={me} />
                    ) : (
                      <tr key={t.homeId} className={t.homeId === me || t.awayId === me ? 'me' : ''}>
                        <td>{clubOf(data, t.homeId)?.shortName}</td>
                        <td className="num muted">{t.awayId ? '–:–' : 'volný los'}</td>
                        <td>{t.awayId ? clubOf(data, t.awayId)?.shortName : ''}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export function CompetitionsScreen({ competitionId }: { competitionId?: CompetitionId }) {
  const { game, data } = useGame();
  const userClubId = game.userClubId as string;
  const [compId, setCompId] = useState<CompetitionId | 'cup'>(competitionId ?? competitionOfClub(game, userClubId)?.id ?? 'chance-liga');
  const [tab, setTab] = useState<Tab>('table');
  const progress = game.competitions.find((c) => c.id === compId) ?? game.competitions[0]!;
  const [round, setRound] = useState(Math.max(1, Math.min(progress.playedRounds + 1, progress.roundDates.length)));
  const table = tableFor(game, progress.id, data);
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
        <button className={compId === 'cup' ? 'active' : ''} onClick={() => setCompId('cup')}>
          {data.pyramid.cup.name}
        </button>
      </div>
      {compId === 'cup' ? (
        <CupView game={game} data={data} me={userClubId} />
      ) : (
      <>
      <div className="tabs">
        {(
          [
            ['table', 'Tabulka'],
            ['fixtures', 'Rozpis a výsledky'],
            ['scorers', 'Střelci'],
            ...(compId === data.pyramid.firstLeague.id ? ([['postseason', 'Nadstavba a baráž']] as const) : []),
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

      {tab === 'postseason' && <Postseason game={game} data={data} me={userClubId} />}

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
            {topScorers(game, progress.id, 25).map((row, i) => {
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
      </>
      )}
    </div>
  );
}
