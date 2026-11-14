import { competitionOfClub, nextUserMatch, squadOf, tableFor } from '../../engine/game/advance.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ClubLabel, clubOf, FormBadges, outcomeFor, playerOf, PlayerLink } from '../components.tsx';
import { formatDate, formatDateLong } from '../format.ts';

const NEWS_ICON = { injury: '✚', suspension: '🟥', lineup: '🔁', recovered: '✅', info: 'ℹ️' } as const;

export function HomeScreen() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const userClubId = game.userClubId as string;
  const progress = competitionOfClub(game, userClubId);
  const competition = data.competitions.find((c) => c.id === progress?.id);
  const next = nextUserMatch(game);
  const table = progress ? tableFor(game, progress.id, data) : [];
  const pos = table.findIndex((r) => r.clubId === userClubId);
  const excerpt = table.slice(Math.max(0, Math.min(pos - 2, table.length - 5)), Math.max(0, Math.min(pos - 2, table.length - 5)) + 5);
  const myResults = (progress?.results ?? []).filter((r) => r.homeId === userClubId || r.awayId === userClubId);
  const last = myResults.at(-1);
  const squad = squadOf(game, userClubId);
  const unavailable = squad.filter((p) => p.state.injury || p.state.suspensionMatches > 0);

  return (
    <div className="grid cols-2">
      <section className="card">
        <h3>Další zápas</h3>
        {next ? (
          <>
            <div className="big">
              {clubOf(data, next.fixture.homeId)?.shortName} – {clubOf(data, next.fixture.awayId)?.shortName}
            </div>
            <p className="muted">
              {competition?.name}, {next.round}. kolo · {formatDateLong(next.date)} · {next.fixture.homeId === userClubId ? 'doma' : 'venku'} (
              {clubOf(data, next.fixture.homeId)?.city})
            </p>
            <div className="row">
              <button className="primary" onClick={() => void store.continueGame()}>
                Odehrát zápas
              </button>
              <button onClick={() => store.navigate({ name: 'tactics' })}>Upravit sestavu a taktiku</button>
            </div>
            {game.user?.autoLineup && <p className="help">Sestavu vybírá asistent.</p>}
          </>
        ) : (
          <p>Tvůj tým už má sezónu odehranou. {game.finished ? '' : 'Ostatní soutěže ještě hrají.'}</p>
        )}
      </section>

      <section className="card">
        <h3>
          Poslední zápas
          {last && game.user && (
            <button className="link muted" onClick={() => store.navigate({ name: 'match', reportIndex: game.user!.reports.length - 1 })}>
              detail →
            </button>
          )}
        </h3>
        {last ? (
          <>
            <div className="big">
              {clubOf(data, last.homeId)?.shortName} {last.homeGoals} : {last.awayGoals} {clubOf(data, last.awayId)?.shortName}
            </div>
            <p className="muted">
              {last.round}. kolo · {formatDate(last.date)}
            </p>
          </>
        ) : (
          <p className="muted">Sezóna ještě nezačala.</p>
        )}
        <h3 style={{ marginTop: 12 }}>Forma</h3>
        <FormBadges outcomes={myResults.slice(-5).map((r) => outcomeFor(r, userClubId))} />
      </section>

      <section className="card">
        <h3>
          {competition?.name}
          <button className="link muted" onClick={() => store.navigate({ name: 'competitions', ...(progress ? { competitionId: progress.id } : {}) })}>
            celá tabulka →
          </button>
        </h3>
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Klub</th>
              <th className="num">Z</th>
              <th className="num">Skóre</th>
              <th className="num">B</th>
            </tr>
          </thead>
          <tbody>
            {excerpt.map((r) => (
              <tr key={r.clubId} className={r.clubId === userClubId ? 'me' : ''}>
                <td>{table.indexOf(r) + 1}.</td>
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
      </section>

      <section className="card">
        <h3>Novinky</h3>
        {unavailable.length > 0 && (
          <p>
            <strong>Mimo hru:</strong>{' '}
            {unavailable.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <PlayerLink player={p} short /> {p.state.injury ? `(✚ ${p.state.injury.daysLeft} d)` : `(🟥 ${p.state.suspensionMatches})`}
              </span>
            ))}
          </p>
        )}
        {game.news.length === 0 ? (
          <p className="muted">Zatím nic nového.</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {[...game.news]
              .reverse()
              .slice(0, 8)
              .map((n, i) => {
                const p = playerOf(game, n.playerId);
                return (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <span className="muted">{formatDate(n.date)}</span> {NEWS_ICON[n.kind]} {n.text}
                    {p && (
                      <>
                        {' '}
                        <button className="link muted" onClick={() => store.navigate({ name: 'player', playerId: p.id })}>
                          profil
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </div>
  );
}
