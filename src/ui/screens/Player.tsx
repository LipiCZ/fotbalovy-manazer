import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { averageRating, formOf } from '../../engine/game/stats.ts';
import { ageOn, fs, overall, seasonStartDate, ts } from '../../engine/players/rating.ts';
import { ATTRIBUTE_LABEL_CS, GK_TECH, OUTFIELD_TECH, PHYSICAL, POSITION_LABEL_CS, type AttributeId } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { clubOf, ConditionBar, fullName, playerOf, RatingBadge } from '../components.tsx';
import { formatDate, num } from '../format.ts';

function AttributeList({ title, ids, values, weights }: { title: string; ids: readonly AttributeId[]; values: Record<AttributeId, number>; weights: Partial<Record<AttributeId, number>> }) {
  return (
    <div>
      <h3>{title}</h3>
      {ids.map((a) => (
        <div className="attr" key={a} title={weights[a] ? `váha na hlavní pozici ${Math.round((weights[a] ?? 0) * 100)} %` : 'na hlavní pozici se nepočítá'}>
          <span className={weights[a] ? '' : 'muted'}>{ATTRIBUTE_LABEL_CS[a]}</span>
          <div className="bar">
            <div style={{ width: `${values[a]}%` }} />
          </div>
          <span className="num">{Math.round(values[a])}</span>
        </div>
      ))}
    </div>
  );
}

/** Monthly CEL history with month labels counted back from the current date. */
function celSeries(history: number[], date: string): { label: string; cel: number }[] {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return history.map((cel, i) => {
    const back = history.length - 1 - i;
    const month = ((m - 1 - back) % 12 + 12) % 12 + 1;
    const year = y + Math.floor((m - 1 - back) / 12);
    return { label: `${month}/${String(year).slice(2)}`, cel: Math.round(cel * 10) / 10 };
  });
}

export function PlayerScreen({ playerId }: { playerId: string }) {
  const { game, data } = useGame();
  const p = playerOf(game, playerId);
  const store = getAppStore().getState();
  if (!p) return <p>Hráč nenalezen.</p>;
  const b = data.balance;
  const main = p.positions[0]!;
  const weights = b.attributes.weights[main];
  const stats = game.playerStats[p.id];
  const club = clubOf(data, p.clubId);
  const isGk = main === 'GK';
  const s = p.state;

  return (
    <div className="grid">
      <div className="row">
        <button onClick={() => store.back()}>← Zpět</button>
      </div>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>{fullName(p)}</h2>
            <p className="muted">
              {p.positions.map((x) => POSITION_LABEL_CS[x]).join(' / ')} · {ageOn(p.birthDate, seasonStartDate(game.seasonYear))} let (nar. {formatDate(p.birthDate)}) ·{' '}
              {club?.name}
            </p>
          </div>
          <div className="kpis">
            <div><span>CEL</span><span>{overall(p, b)}</span></div>
            <div><span>POT</span><span>{p.pot}</span></div>
            <div><span>TS</span><span>{ts(p, b)}</span></div>
            <div><span>FS</span><span>{fs(p, b)}</span></div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 24, marginTop: 8 }}>
          <span>
            Forma: <RatingBadge value={formOf(p, data)} />
          </span>
          <span className="row">
            Kondice: <ConditionBar value={s.condition} /> {Math.round(s.condition)} %
          </span>
          <span>Žluté karty: {s.yellowCards}</span>
          {s.injury && <span className="bad">✚ {s.injury.type}, ještě {s.injury.daysLeft} dní</span>}
          {s.suspensionMatches > 0 && <span className="bad">🟥 stopka na {s.suspensionMatches} {s.suspensionMatches === 1 ? 'zápas' : 'zápasy'}</span>}
        </div>
      </section>
      <section className="card grid cols-3">
        <AttributeList title={isGk ? 'TS – brankářské' : 'TS – technické'} ids={isGk ? GK_TECH : OUTFIELD_TECH} values={p.attributes} weights={weights.tech} />
        <AttributeList title="FS – fyzické" ids={PHYSICAL} values={p.attributes} weights={weights.phys} />
        <div>
          <h3>Sezóna</h3>
          <table className="data">
            <tbody>
              <tr><td>Zápasy (v základu)</td><td className="num">{stats?.apps ?? 0} ({stats?.starts ?? 0})</td></tr>
              <tr><td>Minuty</td><td className="num">{stats?.minutes ?? 0}</td></tr>
              <tr><td>Góly</td><td className="num">{stats?.goals ?? 0}</td></tr>
              <tr><td>Asistence</td><td className="num">{stats?.assists ?? 0}</td></tr>
              <tr><td>Žluté / červené</td><td className="num">{stats?.yellow ?? 0} / {stats?.red ?? 0}</td></tr>
              <tr><td>Hráč zápasu</td><td className="num">{stats?.motm ?? 0}×</td></tr>
              <tr><td>Průměrná známka</td><td className="num">{averageRating(stats) === null ? '–' : num(averageRating(stats)!, 2)}</td></tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 12 }}>Poslední známky</h3>
          <div className="row">
            {s.recentRatings.length === 0 ? <span className="muted">zatím žádné</span> : s.recentRatings.slice(-5).map((r, i) => <RatingBadge key={i} value={r} />)}
          </div>
        </div>
      </section>
      <section className="card grid cols-2">
        <div>
          <h3>Vývoj CEL</h3>
          {(p.celHistory?.length ?? 0) < 2 ? (
            <p className="muted">Vývoj se zaznamenává každý měsíc, graf se ukáže po prvním měsíci.</p>
          ) : (
            <div style={{ height: 220 }} aria-label="graf vývoje CEL">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={celSeries(p.celHistory ?? [], game.date)} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis domain={['dataMin - 3', 'dataMax + 3']} tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [num(Number(v)), 'CEL']} />
                  <ReferenceLine y={p.pot} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: `POT ${p.pot}`, fontSize: 11, fill: 'var(--muted)', position: 'insideTopRight' }} />
                  <Line type="monotone" dataKey="cel" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="help">Růst určuje věk, minuty, forma, trénink a profesionalita. Potenciál je očekávání, ne strop.</p>
        </div>
        <div>
          <h3>Kariéra</h3>
          {(p.career?.length ?? 0) === 0 ? (
            <p className="muted">První sezóna ve hře.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Sezóna</th>
                  <th>Klub</th>
                  <th>Soutěž</th>
                  <th className="num">Z</th>
                  <th className="num">G</th>
                  <th className="num">A</th>
                  <th className="num">Ø zn.</th>
                  <th className="num">CEL</th>
                </tr>
              </thead>
              <tbody>
                {[...(p.career ?? [])].reverse().map((c) => (
                  <tr key={`${c.seasonYear}-${c.clubId}`}>
                    <td>
                      {c.seasonYear}/{String(c.seasonYear + 1).slice(2)}
                    </td>
                    <td>{clubOf(data, c.clubId)?.shortName}</td>
                    <td>{data.competitions.find((x) => x.id === c.competitionId)?.shortName ?? '–'}</td>
                    <td className="num">{c.apps}</td>
                    <td className="num">{c.goals}</td>
                    <td className="num">{c.assists}</td>
                    <td className="num">{c.avgRating === null ? '–' : num(c.avgRating, 2)}</td>
                    <td className="num">{c.cel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
