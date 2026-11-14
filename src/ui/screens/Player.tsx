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
          <span className="num">{values[a]}</span>
        </div>
      ))}
    </div>
  );
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
          <p className="help">Vývoj CEL v čase a smlouva přibudou v dalších fázích.</p>
        </div>
      </section>
    </div>
  );
}
