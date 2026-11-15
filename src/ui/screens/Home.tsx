import type { TrainingSetting } from '../../engine/game/state.ts';
import { competitionOfClub, nextUserMatch, squadOf } from '../../engine/game/advance.ts';
import { groupTable, regularTable, stageOf } from '../../engine/game/postseason.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ClubLabel, clubOf, FormBadges, playerOf, PlayerLink } from '../components.tsx';
import { formatDate, formatDateLong, money } from '../format.ts';
import { wageBill } from '../../engine/game/finance.ts';
import { expiringContracts, isUserOrg, windowOn } from '../../engine/game/market.ts';

/** Things waiting for the manager (design, section 15: the Home screen shows what needs a decision). */
function Decisions() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const userId = game.userClubId as string;
  const incoming = game.market.offers.filter((o) => o.initiatedBy === 'ai' && o.status === 'open' && isUserOrg(game, data, o.sellerId));
  const mine = game.market.offers.filter((o) => o.buyerId === userId && o.initiatedBy === 'user' && (o.status === 'countered' || o.status === 'agreed'));
  const pending = game.market.offers.filter((o) => o.buyerId === userId && o.status === 'pending');
  const expiring = game.finished ? [] : expiringContracts(game, data);
  const tips = game.scouting.tips;
  const items: { text: string; go: () => void; label: string }[] = [];
  if (incoming.length > 0) items.push({ text: `${incoming.length}× nabídka na tvého hráče`, label: 'Nabídky', go: () => store.navigate({ name: 'transfers', tab: 'offers' }) });
  if (mine.length > 0) items.push({ text: `${mine.length}× rozjednaný přestup čeká na tebe (protinabídka nebo osobní podmínky)`, label: 'Nabídky', go: () => store.navigate({ name: 'transfers', tab: 'offers' }) });
  if (pending.length > 0) items.push({ text: `${pending.length}× dohodnutý příchod čeká na otevření okna`, label: 'Nabídky', go: () => store.navigate({ name: 'transfers', tab: 'offers' }) });
  if (expiring.length > 0) items.push({ text: `${expiring.length} hráčům končí 30. 6. smlouva`, label: 'Smlouvy', go: () => store.navigate({ name: 'transfers', tab: 'mine' }) });
  const offers = game.coach?.offers.length ?? 0;
  if (offers > 0) items.push({ text: game.coach?.sacked ? 'Vedení tě odvolalo – vyber nové angažmá' : `${offers}× nabídka práce od jiného klubu`, label: 'Kariéra', go: () => store.navigate({ name: 'career' }) });
  const club = game.club?.decisions.length ?? 0;
  if (club > 0) items.push({ text: `${club}× rozhodnutí klubu (${game.club!.decisions.map((d) => d.title).join(', ')})`, label: 'Klub', go: () => store.navigate({ name: 'club' }) });
  if (tips.length > 0) items.push({ text: `${tips.length}× tip skauta na talent`, label: 'Skauting', go: () => store.navigate({ name: 'scouting' }) });
  if (items.length === 0 && !windowOn(game.date, data)) return null;
  return (
    <section className="card" data-testid="decisions">
      <h3>K rozhodnutí</h3>
      {windowOn(game.date, data) && <p className="good">Přestupní okno je otevřené.</p>}
      {items.length === 0 ? (
        <p className="muted">Nic nečeká.</p>
      ) : (
        <table className="data">
          <tbody>
            {items.map((i) => (
              <tr key={i.text}>
                <td>{i.text}</td>
                <td>
                  <button onClick={i.go}>{i.label}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const NEWS_ICON = { injury: '✚', suspension: '🟥', lineup: '🔁', recovered: '✅', academy: '🎓', development: '📈', season: '📅', info: 'ℹ️', transfer: '⇄', contract: '✍', scouting: '🔍', media: '📰' } as const;

const TRAINING: { id: TrainingSetting; label: string; help: string }[] = [
  { id: 'assistant', label: 'asistent', help: 'Asistent volí podle programu: tvrdě, když je do zápasu týden, lehce těsně před zápasem.' },
  { id: 'light', label: 'lehký', help: 'Hráči rychleji regenerují a nezraní se, ale rostou pomaleji.' },
  { id: 'normal', label: 'normální', help: 'Vyvážený trénink.' },
  { id: 'hard', label: 'tvrdý', help: 'Hráči rostou rychleji (+15 %), ale pomaleji regenerují a víc se zraňují.' },
];

export function HomeScreen() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const userClubId = game.userClubId as string;
  const progress = competitionOfClub(game, userClubId);
  const competition = data.competitions.find((c) => c.id === progress?.id);
  const next = nextUserMatch(game, data);
  // During the post-season of the 1st league show the group table.
  const group = ['title-group', 'relegation-group'].map((id) => stageOf(game, id as 'title-group')).find((s) => s?.clubIds.includes(userClubId));
  const table = group ? groupTable(game, group.id as 'title-group', data) : progress ? regularTable(game, progress.id, data) : [];
  const pos = table.findIndex((r) => r.clubId === userClubId);
  const start = Math.max(0, Math.min(pos - 2, table.length - 5));
  const excerpt = table.slice(start, start + 5);
  const matches = game.user?.matches ?? [];
  const last = matches.at(-1);
  const outcomes = matches.slice(-5).map((m) => {
    const own = m.report.homeId === userClubId ? m.report.homeGoals : m.report.awayGoals;
    const opp = m.report.homeId === userClubId ? m.report.awayGoals : m.report.homeGoals;
    const pens = m.report.penalties;
    if (own === opp && pens) return (m.report.homeId === userClubId ? pens[0] > pens[1] : pens[1] > pens[0]) ? 'W' : 'L';
    return own > opp ? 'W' : own < opp ? 'L' : 'D';
  });
  const squad = squadOf(game, userClubId);
  const unavailable = squad.filter((p) => p.state.injury || p.state.suspensionMatches > 0);
  const training = TRAINING.find((t) => t.id === (game.user?.training ?? 'assistant'));

  return (
    <div className="grid cols-2">
      <Decisions />
      <section className="card">
        <h3>Další zápas</h3>
        {next ? (
          <>
            <div className="big">
              {clubOf(data, next.homeId)?.shortName} – {clubOf(data, next.awayId)?.shortName}
            </div>
            <p className="muted">
              {next.label} · {formatDateLong(next.date)} · {next.homeId === userClubId ? 'doma' : 'venku'} ({clubOf(data, next.homeId)?.city})
            </p>
            <div className="row">
              <button className="primary" onClick={() => void store.continueGame()}>
                Odehrát zápas
              </button>
              <button onClick={() => store.startLive()}>Hrát živě</button>
              <button onClick={() => store.navigate({ name: 'tactics' })}>Upravit sestavu a taktiku</button>
            </div>
            {game.user?.autoLineup && <p className="help">Sestavu vybírá asistent.</p>}
          </>
        ) : game.finished ? (
          <>
            <p>Sezóna skončila.</p>
            <button className="primary" onClick={() => store.navigate({ name: 'seasonEnd' })}>
              Konec sezóny a nová sezóna
            </button>
          </>
        ) : (
          <p>Tvůj tým teď nehraje, ostatní soutěže ještě pokračují.</p>
        )}
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="training">Trénink</label>
          <select id="training" value={training?.id} onChange={(e) => store.setTraining(e.target.value as TrainingSetting)}>
            {TRAINING.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <div className="help">{training?.help}</div>
        </div>
      </section>

      <section className="card">
        <h3>
          Poslední zápas
          {last && (
            <button className="link muted" onClick={() => store.navigate({ name: 'match', reportIndex: matches.length - 1 })}>
              detail →
            </button>
          )}
        </h3>
        {last ? (
          <>
            <div className="big">
              {clubOf(data, last.report.homeId)?.shortName} {last.report.homeGoals} : {last.report.awayGoals} {clubOf(data, last.report.awayId)?.shortName}
              {last.report.penalties && <span className="muted"> (pen. {last.report.penalties.join(':')})</span>}
            </div>
            <p className="muted">
              {last.label} · {formatDate(last.date)}
            </p>
          </>
        ) : (
          <p className="muted">Sezóna ještě nezačala.</p>
        )}
        <h3 style={{ marginTop: 12 }}>Forma</h3>
        <FormBadges outcomes={outcomes} />
      </section>

      <section className="card">
        <h3>
          {group ? (group.id === 'title-group' ? 'Skupina o titul' : 'Skupina o záchranu') : competition?.name}
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
                <td>{table.indexOf(r) + 1 + (group?.id === 'relegation-group' ? 10 : 0)}.</td>
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

      {game.board && (
        <section className="card">
          <h3>
            Cíle vedení
            <button className="link muted" onClick={() => store.navigate({ name: 'finance' })}>
              finance →
            </button>
          </h3>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>
              Liga: <strong>{game.board.goals.leagueLabel}</strong>
              {pos >= 0 && !group && <span className="muted"> (teď {pos + 1}. místo)</span>}
            </li>
            {game.cup && <li>{game.board.goals.cupLabel}</li>}
            {game.board.goals.financeLabel && <li>{game.board.goals.financeLabel}</li>}
            <li>
              Platy: {money(wageBill(game, data, userClubId))} ročně z rozpočtu {money(game.board.budget.wageCap)}
            </li>
          </ul>
          <p className="help">Na konci sezóny vedení hodnotí každý cíl stupněm vynikající – úspěšná – přijatelná – neúspěšná – katastrofa. Pohárový úspěch pomůže hodně, neúspěch tolik neuškodí.</p>
        </section>
      )}

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
              .slice(0, 10)
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
