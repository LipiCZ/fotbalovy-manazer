import { changeClub, declineOffers, requiredReputation } from '../../engine/game/career.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { clubOf } from '../components.tsx';
import { seasonLabel } from '../format.ts';

export function CareerScreen() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const coach = game.coach;
  if (!coach) return <p>Kariéra trenéra není k dispozici.</p>;
  const c = data.balance.career;
  const nextSteps = data.clubs
    .filter((club) => !club.parentClubId && game.membership[club.id] && club.id !== game.userClubId)
    .map((club) => requiredReputation(game, data, club))
    .filter((r) => r > coach.reputation)
    .sort((a, b) => a - b);
  return (
    <div className="grid">
      <section className="card">
        <h2>Kariéra trenéra {game.managerName}</h2>
        <p>
          Režim: <strong>{coach.mode === 'career' ? 'kariéra od dna' : 'volný výběr'}</strong>
          {coach.background ? ` · ${c.backgrounds[coach.background].label}` : ''} · reputace <strong data-testid="reputation">{Math.round(coach.reputation)}</strong> / 100
        </p>
        <p className="help">
          Reputace roste s úspěšnými sezónami, postupy, tituly a pohárem. Větší kluby se ozvou vzácně a nabídku můžeš odmítnout. Po katastrofální sezóně nebo dvou neúspěšných za sebou vedení trenéra odvolá.
          {nextSteps.length > 0 ? ` Další kluby se začnou ozývat od reputace ${nextSteps[0]}.` : ''}
        </p>
      </section>
      {coach.offers.length > 0 && (
        <section className="card" data-testid="job-offers">
          <h3>{coach.sacked ? 'Vedení tě odvolalo – vyber nové angažmá' : 'Nabídky klubů'}</h3>
          <table className="data">
            <tbody>
              {coach.offers.map((o) => (
                <tr key={o.clubId}>
                  <td>{o.text}</td>
                  <td>
                    <button className="primary" onClick={() => store.market((g, d, news) => changeClub(g, d, o.clubId, news))}>
                      Přijmout
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!coach.sacked && <button onClick={() => store.market((g) => { declineOffers(g); return 'Zůstáváš.'; })}>Odmítnout všechny a zůstat</button>}
        </section>
      )}
      <section className="card">
        <h3>Historie</h3>
        {coach.history.length === 0 ? (
          <p className="muted">První sezóna.</p>
        ) : (
          <table className="data">
            <tbody>
              {[...coach.history].reverse().map((h) => (
                <tr key={`${h.seasonYear}-${h.clubId}`}>
                  <td>{seasonLabel(h.seasonYear)}</td>
                  <td>{clubOf(data, h.clubId)?.name}</td>
                  <td>{data.competitions.find((x) => x.id === h.competitionId)?.shortName}</td>
                  <td className="num">{h.position ? `${h.position}. místo` : '–'}</td>
                  <td>{h.grade ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
