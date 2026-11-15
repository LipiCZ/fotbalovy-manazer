import type { GameState, MatchSummary } from '../../engine/game/state.ts';
import type { MatchEvent, MatchReport, Side } from '../../engine/match/types.ts';
import { POSITION_LABEL_CS } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { clubOf, playerOf, PlayerLink, RatingBadge, shortName } from '../components.tsx';
import { formatDate, minuteLabel, num } from '../format.ts';

function StatLine({ label, home, away, format = (v: number) => String(v) }: { label: string; home: number; away: number; format?: (v: number) => string }) {
  const total = home + away || 1;
  return (
    <div className="statline">
      <span className="num">{format(home)}</span>
      <div>
        <div className="label">{label}</div>
        <div className="split">
          <div className="h" style={{ width: `${(100 * home) / total}%` }} />
          <div className="a" style={{ width: `${(100 * away) / total}%` }} />
        </div>
      </div>
      <span>{format(away)}</span>
    </div>
  );
}

const EVENT_TEXT: Partial<Record<MatchEvent['type'], string>> = {
  goal: '⚽',
  penaltyGoal: '⚽ (pen.)',
  penaltyMiss: '✗ neproměněná penalta',
  yellow: '🟨',
  secondYellow: '🟨🟥',
  red: '🟥',
  injury: '✚',
  sub: '⇄',
  bigChance: 'velká šance',
};

/** Other results of the same day in the same competition, stage or cup round. */
function sameRound(game: GameState, date: string, homeId: string): MatchSummary[] {
  const containers: MatchSummary[][] = [
    ...game.competitions.map((c) => c.results),
    ...game.stages.map((s) => s.results),
    ...(game.cup?.rounds.map((r) => r.ties.flatMap((t) => (t.result ? [t.result] : []))) ?? []),
  ];
  const list = containers.find((c) => c.some((r) => r.date === date && r.homeId === homeId)) ?? [];
  return list.filter((r) => r.date === date && r.homeId !== homeId);
}

export function MatchScreen({ reportIndex }: { reportIndex: number }) {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const matches = game.user?.matches ?? [];
  const match = matches[reportIndex];
  const report: MatchReport | undefined = match?.report;
  if (!match || !report) return <p>Zápas nenalezen.</p>;
  const home = clubOf(data, report.homeId);
  const away = clubOf(data, report.awayId);
  const name = (id?: string) => {
    const p = playerOf(game, id);
    return p ? shortName(p) : '?';
  };
  const keyEvents = (side: Side) => report.events.filter((e) => e.side === side && ['goal', 'penaltyGoal', 'red', 'secondYellow'].includes(e.type));
  const roundResults = sameRound(game, match.date, report.homeId);
  const s = report.stats;

  const ratingsTable = (side: Side) => {
    const lines = report.players.filter((l) => l.side === side && l.minutesPlayed > 0);
    return (
      <table className="data">
        <thead>
          <tr>
            <th>Poz.</th>
            <th>Hráč</th>
            <th className="num">Min.</th>
            <th></th>
            <th className="num">Známka</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const p = playerOf(game, l.playerId);
            return (
              <tr key={l.playerId} className={l.playerId === report.manOfTheMatchId ? 'me' : ''}>
                <td>{POSITION_LABEL_CS[l.slot]}</td>
                <td>
                  {l.started ? '' : '⇄ '}
                  {p ? <PlayerLink player={p} short /> : '?'}
                  {l.playerId === report.manOfTheMatchId && ' ★'}
                </td>
                <td className="num">{l.minutesPlayed}</td>
                <td>
                  {'⚽'.repeat(l.goals)}
                  {l.assists > 0 ? ` 🅰${l.assists > 1 ? `×${l.assists}` : ''}` : ''}
                  {l.yellow > 0 && l.red === 'none' ? ' 🟨' : ''}
                  {l.red !== 'none' ? ' 🟥' : ''}
                  {l.injury ? ' ✚' : ''}
                </td>
                <td className="num">
                  <RatingBadge value={l.rating} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="grid">
      <section className="card">
        <div className="scoreboard">
          <div className="team">{home?.name}</div>
          <div className="score" data-testid="score">
            {report.homeGoals}:{report.awayGoals}
          </div>
          <div className="team away">{away?.name}</div>
        </div>
        <div className="venue">
          {report.penalties && (
            <div>
              <strong>
                {report.extraTime ? 'po prodloužení, ' : ''}penalty {report.penalties.join(':')}
              </strong>
            </div>
          )}
          {!report.penalties && report.extraTime && (
            <div>
              <strong>po prodloužení</strong>
            </div>
          )}
          {home?.city} · {match.label} · {formatDate(match.date)}
        </div>
        <div className="scorers">
          {(['home', 'away'] as const).map((side) => (
            <div key={side} className={side}>
              {keyEvents(side).map((e, i) => (
                <div key={i}>
                  {minuteLabel(e.minute, e.added)} {name(e.playerId)} {e.type === 'penaltyGoal' ? '(pen.)' : e.type === 'goal' ? '' : EVENT_TEXT[e.type]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <div className="grid cols-2">
        <section className="card">
          <h3>Statistiky</h3>
          <StatLine label="xG" home={s.home.xg} away={s.away.xg} format={(v) => num(v, 2)} />
          <StatLine label="Střely" home={s.home.shots} away={s.away.shots} />
          <StatLine label="Na branku" home={s.home.shotsOnTarget} away={s.away.shotsOnTarget} />
          <StatLine label="Držení míče %" home={s.home.possession} away={s.away.possession} />
          <StatLine label="Rohy" home={s.home.corners} away={s.away.corners} />
          <StatLine label="Fauly" home={s.home.fouls} away={s.away.fouls} />
          <StatLine label="Žluté karty" home={s.home.yellow} away={s.away.yellow} />
          <StatLine label="Červené karty" home={s.home.red} away={s.away.red} />
          <div className="card" style={{ background: '#f7f8fa', marginTop: 12 }}>
            <h3>Asistent</h3>
            <p data-testid="explanation" style={{ margin: 0 }}>
              {report.explanation.join(' ')}
            </p>
            {report.manOfTheMatchId && (
              <p className="help" style={{ marginTop: 8, marginBottom: 0 }}>
                Hráč zápasu: <strong>{name(report.manOfTheMatchId)}</strong>
              </p>
            )}
          </div>
        </section>
        <section className="card">
          <h3>Průběh</h3>
          <ul style={{ paddingLeft: 18, margin: 0, maxHeight: 360, overflow: 'auto' }}>
            {report.events
              .filter((e) => e.type !== 'mentality')
              .map((e, i) => (
                <li key={i}>
                  <span className="muted">{minuteLabel(e.minute, e.added)}</span> {(e.side === 'home' ? home : away)?.shortName}: {EVENT_TEXT[e.type]}{' '}
                  {e.type === 'sub' ? `${name(e.otherPlayerId)} za ${name(e.playerId)}` : name(e.playerId)}
                  {e.type === 'goal' && e.otherPlayerId ? ` (${name(e.otherPlayerId)})` : ''}
                  {e.injury ? ` – ${e.injury.type}` : ''}
                </li>
              ))}
          </ul>
        </section>
      </div>

      <div className="grid cols-2">
        <section className="card">
          <h3>{home?.shortName}</h3>
          {ratingsTable('home')}
        </section>
        <section className="card">
          <h3>{away?.shortName}</h3>
          {ratingsTable('away')}
        </section>
      </div>

      <section className="card">
        <h3>
          Výsledky kola
          <span className="row">
            <button disabled={reportIndex === 0} onClick={() => store.navigate({ name: 'match', reportIndex: reportIndex - 1 })}>
              ← předchozí zápas
            </button>
            <button disabled={reportIndex >= matches.length - 1} onClick={() => store.navigate({ name: 'match', reportIndex: reportIndex + 1 })}>
              další zápas →
            </button>
          </span>
        </h3>
        <table className="data">
          <tbody>
            {roundResults.map((r) => (
              <tr key={`${r.homeId}-${r.awayId}`}>
                <td>{clubOf(data, r.homeId)?.shortName}</td>
                <td className="num">
                  <strong>
                    {r.homeGoals}:{r.awayGoals}
                  </strong>
                  {r.penalties ? <span className="muted"> pen. {r.penalties.join(':')}</span> : r.extraTime ? <span className="muted"> pp.</span> : null}
                </td>
                <td>{clubOf(data, r.awayId)?.shortName}</td>
                <td className="muted">
                  {r.scorers.map(([id, min]) => `${name(id)} ${Math.floor(min)}'`).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
