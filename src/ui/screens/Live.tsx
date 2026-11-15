import { useEffect, useReducer, useRef, useState } from 'react';
import { clockOf, liveSubstitute, liveTactics, liveTeam, stepMinute } from '../../engine/match/engine.ts';
import type { Mentality, Pressing, Style } from '../../engine/data.ts';
import { POSITION_LABEL_CS } from '../../engine/types.ts';
import { getAppStore, useApp, useGame } from '../../state/store.ts';
import { clubOf, ConditionBar, shortName } from '../components.tsx';
import { minuteLabel, num } from '../format.ts';
import { EVENT_TEXT, StatLine } from './Match.tsx';

/** Pause the clock on these events (design, section 4: goal, injury, half-time). */
const PAUSE_ON = new Set(['goal', 'penaltyGoal', 'injury', 'red', 'secondYellow']);
const SPEEDS = [
  { ms: 500, label: '1×' },
  { ms: 200, label: '2,5×' },
  { ms: 60, label: '8×' },
];

export function LiveScreen() {
  const { game, data } = useGame();
  const live = useApp((s) => s.live?.live ?? null);
  const store = getAppStore().getState();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(SPEEDS[0]!.ms);
  const [outId, setOutId] = useState('');
  const [inId, setInId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const half = useRef(false);

  useEffect(() => {
    if (!live || !running || live.match.finished) return;
    const t = setInterval(() => {
      const m = live.match;
      const events = stepMinute(m);
      const halfLength = data.balance.match.halfMinutes + m.addedFirst;
      if (!half.current && m.step >= halfLength) {
        half.current = true;
        setRunning(false);
      }
      if (events.some((e) => PAUSE_ON.has(e.type)) || m.finished) setRunning(false);
      rerender();
    }, speed);
    return () => clearInterval(t);
  }, [live, running, speed, data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement | null)?.closest('input, select, button')) return;
      e.preventDefault();
      setRunning((r) => !r);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!live) return <p>Žádný živý zápas neběží.</p>;
  const m = live.match;
  const side = live.userSide;
  const team = liveTeam(m, side);
  const home = clubOf(data, m.home.sheet.clubId);
  const away = clubOf(data, m.away.sheet.clubId);
  const clock = clockOf(m, Math.max(1, m.step));
  const nameOf = (id?: string) => {
    const p = game.players.find((x) => x.id === id);
    return p ? shortName(p) : '';
  };
  const events = m.events.filter((e) => e.type !== 'mentality' || e.side === side).slice(-14).reverse();
  const tacticsRow = (key: 'style' | 'mentality' | 'pressing', label: string, options: { id: string; name: string }[]) => (
    <label className="row" style={{ gap: 6 }}>
      {label}
      <select
        value={team.tactics[key]}
        aria-label={label}
        onChange={(e) => {
          liveTactics(m, side, { [key]: e.target.value } as { style?: Style; mentality?: Mentality; pressing?: Pressing });
          rerender();
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="grid">
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="big">{home?.shortName}</span>
          <span className="big" data-testid="live-score">
            {m.home.stats.goals} : {m.away.stats.goals}
          </span>
          <span className="big">{away?.shortName}</span>
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>
          {live.label} · {m.finished ? 'konec zápasu' : `${minuteLabel(clock.minute, clock.added)}`}
          {m.penalties ? ` · penalty ${m.penalties[0]}:${m.penalties[1]}` : ''}
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {!m.finished && (
            <button className="primary" onClick={() => setRunning((r) => !r)}>
              {running ? 'Pauza' : 'Pokračovat'} <kbd>mezerník</kbd>
            </button>
          )}
          <span className="tabs" style={{ margin: 0 }} aria-label="rychlost">
            {SPEEDS.map((s) => (
              <button key={s.ms} className={speed === s.ms ? 'active' : ''} onClick={() => setSpeed(s.ms)}>
                {s.label}
              </button>
            ))}
          </span>
          <button className={m.finished ? 'primary' : ''} onClick={() => void store.finishLive()}>
            {m.finished ? 'Výsledek zápasu' : 'Dohrát rychle'}
          </button>
        </div>
      </section>
      <div className="grid cols-2">
        <section className="card">
          <h3>Průběh</h3>
          {events.length === 0 ? (
            <p className="muted">Zatím nic.</p>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {events.map((e, i) => (
                <li key={i}>
                  <span className="muted">{minuteLabel(e.minute, e.added)}</span> {e.side === 'home' ? home?.shortName : away?.shortName}:{' '}
                  {e.type === 'mentality' ? `nastavení ${data.tactics.mentalities.find((x) => x.id === e.mentality)?.name}` : EVENT_TEXT[e.type]} {nameOf(e.playerId)}
                  {e.type === 'sub' ? ` → ${nameOf(e.otherPlayerId)}` : ''}
                </li>
              ))}
            </ul>
          )}
          <h3 style={{ marginTop: 12 }}>Statistiky</h3>
          <StatLine label="Střely" home={m.home.stats.shots} away={m.away.stats.shots} />
          <StatLine label="Na bránu" home={m.home.stats.shotsOnTarget} away={m.away.stats.shotsOnTarget} />
          <StatLine label="xG" home={m.home.stats.xg} away={m.away.stats.xg} format={(v) => num(v)} />
          <StatLine label="Držení míče (minuty)" home={m.home.possessionSteps} away={m.away.possessionSteps} />
        </section>
        <section className="card">
          <h3>Můj tým</h3>
          <div className="row wrap">
            {tacticsRow('mentality', 'Nastavení', data.tactics.mentalities)}
            {tacticsRow('style', 'Styl', data.tactics.styles)}
            {tacticsRow('pressing', 'Presink', data.tactics.pressing)}
          </div>
          <p className="help">Když taktiku změníš, asistent už ji během zápasu sám neupravuje. Střídání zbývá: {team.subsLeft}.</p>
          <table className="data">
            <tbody>
              {team.onPitch.map((o) => (
                <tr key={o.player.id}>
                  <td>{POSITION_LABEL_CS[o.slot]}</td>
                  <td>{shortName(o.player)}</td>
                  <td>
                    <ConditionBar value={o.condition} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!m.finished && team.subsLeft > 0 && (
            <div className="row wrap" style={{ marginTop: 8 }}>
              <select value={outId} onChange={(e) => setOutId(e.target.value)} aria-label="střídaný hráč">
                <option value="">kdo jde ven</option>
                {team.onPitch.map((o) => (
                  <option key={o.player.id} value={o.player.id}>
                    {POSITION_LABEL_CS[o.slot]} {shortName(o.player)} ({Math.round(o.condition)} %)
                  </option>
                ))}
              </select>
              <select value={inId} onChange={(e) => setInId(e.target.value)} aria-label="střídající hráč">
                <option value="">kdo jde na hřiště</option>
                {team.bench.map((p) => (
                  <option key={p.id} value={p.id}>
                    {POSITION_LABEL_CS[p.positions[0]!]} {shortName(p)}
                  </option>
                ))}
              </select>
              <button
                disabled={!outId || !inId}
                onClick={() => {
                  setError(liveSubstitute(m, side, outId, inId));
                  setOutId('');
                  setInId('');
                  rerender();
                }}
              >
                Vystřídat
              </button>
            </div>
          )}
          {error && <p className="warn">{error}</p>}
        </section>
      </div>
    </div>
  );
}
