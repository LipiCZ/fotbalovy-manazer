import { useState, type DragEvent } from 'react';
import type { FormationId, Mentality, Pressing, Style } from '../../engine/data.ts';
import { squadOf } from '../../engine/game/advance.ts';
import { applyAssistantLineup, changeFormation, swapPlayers, type LineupRef } from '../../engine/game/userTeam.ts';
import { chooseTactics, fitKind, isAvailable, positionFit } from '../../engine/lineup.ts';
import { celAt, overall } from '../../engine/players/rating.ts';
import { POSITION_LABEL_CS, type Player, type Position } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ConditionBar, playerOf, shortName } from '../components.tsx';
import { slotCoordinates } from '../pitchLayout.ts';

const sameRef = (a: LineupRef | null, b: LineupRef) =>
  a !== null && a.area === b.area && (a.area === 'reserve' ? a.playerId === (b as { playerId: string }).playerId : a.index === (b as { index: number }).index);

function statusText(p: Player): string | null {
  if (p.state.injury) return `zraněný (${p.state.injury.daysLeft} d)`;
  if (p.state.suspensionMatches > 0) return `stopka (${p.state.suspensionMatches})`;
  return null;
}

export function TacticsScreen() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const user = game.user!;
  const squad = squadOf(game, game.userClubId as string);
  const [selected, setSelected] = useState<LineupRef | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const b = data.balance;
  const t = user.tactics;

  const idAt = (ref: LineupRef): string | null =>
    ref.area === 'xi' ? (user.lineup.playerIds[ref.index] ?? null) : ref.area === 'bench' ? (user.lineup.benchIds[ref.index] ?? null) : ref.playerId;

  const act = (a: LineupRef, bRef: LineupRef) => {
    // Unavailable players may not go into the XI or onto the bench.
    for (const [from, to] of [[a, bRef], [bRef, a]] as const) {
      const p = playerOf(game, idAt(from));
      if (p && to.area !== 'reserve' && !isAvailable(p)) {
        store.showMessage({ kind: 'warn', text: `${p.firstName} ${p.lastName} nemůže hrát: ${statusText(p)}.` });
        return;
      }
    }
    store.editUser((u) => swapPlayers(u, a, bRef, data));
  };
  const click = (ref: LineupRef) => {
    if (selected === null) {
      if (idAt(ref) !== null || ref.area !== 'reserve') setSelected(ref);
      return;
    }
    if (!sameRef(selected, ref)) act(selected, ref);
    setSelected(null);
  };
  const dragProps = (ref: LineupRef, key: string) => ({
    draggable: idAt(ref) !== null,
    onDragStart: (e: DragEvent) => e.dataTransfer.setData('application/json', JSON.stringify(ref)),
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(key);
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const raw = e.dataTransfer.getData('application/json');
      if (raw) act(JSON.parse(raw) as LineupRef, ref);
      setSelected(null);
    },
  });

  const coords = slotCoordinates(user.lineup.slots);
  const used = new Set([...user.lineup.playerIds, ...user.lineup.benchIds].filter((x): x is string => x !== null));
  const reserves = squad.filter((p) => !used.has(p.id)).sort((x, y) => overall(y, b) - overall(x, b));
  const xiPlayers = user.lineup.playerIds.map((id) => playerOf(game, id)).filter((p): p is Player => p !== undefined);
  const recommendation = chooseTactics(
    { formation: t.formation, slots: user.lineup.slots, lineup: user.lineup.playerIds.map((id) => playerOf(game, id) ?? null), total: 0 },
    0,
    b,
  );
  const styleName = (id: Style) => data.tactics.styles.find((s) => s.id === id)?.name ?? id;
  const pressName = (id: Pressing) => data.tactics.pressing.find((s) => s.id === id)?.name ?? id;
  const setTactic = (patch: Partial<typeof t>) => store.editUser((u) => (u.tactics = { ...u.tactics, ...patch }));
  const formation = data.tactics.formations.find((f) => f.id === t.formation);

  const chip = (p: Player, ref: LineupRef, key: string) => {
    const status = statusText(p);
    return (
      <div
        key={key}
        className={`chip ${status ? 'unavailable' : ''} ${sameRef(selected, ref) ? 'selected' : ''} ${dragOver === key ? 'drop-target' : ''}`}
        onClick={() => click(ref)}
        title={status ?? `CEL ${overall(p, b)}`}
        data-testid={`chip-${p.id}`}
        {...dragProps(ref, key)}
      >
        {POSITION_LABEL_CS[p.positions[0]!]} {shortName(p)} <strong>{overall(p, b)}</strong>
        {status && <span className="bad"> · {status}</span>}
      </div>
    );
  };

  return (
    <div className="tactics">
      <section className="card">
        <h2>Sestava</h2>
        <p className="help">Hráče přetáhni, nebo klikni na jednoho a pak na druhého, a vymění se. Barva u pozice: zelená = přirozená, oranžová = příbuzná (90 %), červená = cizí (70 %).</p>
        <div className="pitch" aria-label="hřiště">
          <div className="line-half" style={{ top: '50%' }} />
          <div className="box" />
          {user.lineup.slots.map((slot: Position, i) => {
            const ref: LineupRef = { area: 'xi', index: i };
            const p = playerOf(game, user.lineup.playerIds[i]);
            const key = `xi-${i}`;
            const kind = p ? fitKind(p, slot, b) : null;
            return (
              <div
                key={key}
                data-testid={`slot-${i}`}
                className={`slot ${p ? '' : 'empty'} ${sameRef(selected, ref) ? 'selected' : ''} ${dragOver === key ? 'drop-target' : ''}`}
                style={{ left: `${coords[i]!.x}%`, top: `${coords[i]!.y}%` }}
                onClick={() => click(ref)}
                {...dragProps(ref, key)}
              >
                <div className={`pos fit-${kind ?? 'natural'}`}>{POSITION_LABEL_CS[slot]}</div>
                {p ? (
                  <>
                    <div>{shortName(p)}</div>
                    <div className="row" style={{ justifyContent: 'center' }}>
                      <strong>{Math.round(celAt(p, slot, b) * positionFit(p, slot, b))}</strong>
                      <ConditionBar value={p.state.condition} />
                    </div>
                    {statusText(p) && <div className="bad">{statusText(p)}</div>}
                  </>
                ) : (
                  <div className="muted">prázdné</div>
                )}
              </div>
            );
          })}
        </div>
        <h3 style={{ marginTop: 14 }}>Lavička ({user.lineup.benchIds.length}/{b.match.subs.benchSize})</h3>
        <div className="chips">
          {user.lineup.benchIds.map((id, i) => {
            const p = playerOf(game, id);
            return p ? chip(p, { area: 'bench', index: i }, `bench-${i}`) : null;
          })}
          {user.lineup.benchIds.length < b.match.subs.benchSize && (
            <div
              className={`chip muted ${dragOver === 'bench-new' ? 'drop-target' : ''} ${selected && sameRef(selected, { area: 'bench', index: user.lineup.benchIds.length }) ? 'selected' : ''}`}
              onClick={() => click({ area: 'bench', index: user.lineup.benchIds.length })}
              {...dragProps({ area: 'bench', index: user.lineup.benchIds.length }, 'bench-new')}
            >
              + volné místo
            </div>
          )}
        </div>
        <h3 style={{ marginTop: 14 }}>Mimo nominaci</h3>
        <div className="chips">{reserves.map((p) => chip(p, { area: 'reserve', playerId: p.id }, `res-${p.id}`))}</div>
      </section>

      <aside className="card">
        <h2>Taktika</h2>
        <div className="field">
          <label htmlFor="formation">Rozestavení</label>
          <select id="formation" value={t.formation} onChange={(e) => store.editUser((u, sq) => changeFormation(u, e.target.value as FormationId, sq, data))}>
            {data.tactics.formations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id}
              </option>
            ))}
          </select>
          <div className="help">{formation?.help}</div>
        </div>
        {(
          [
            ['style', 'Styl', data.tactics.styles],
            ['mentality', 'Nastavení týmu', data.tactics.mentalities],
            ['pressing', 'Presink', data.tactics.pressing],
          ] as const
        ).map(([key, label, options]) => (
          <div className="field" key={key}>
            <label htmlFor={key}>{label}</label>
            <select id={key} value={t[key]} onChange={(e) => setTactic({ [key]: e.target.value } as { style: Style } | { mentality: Mentality } | { pressing: Pressing })}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <div className="help">{options.find((o) => o.id === t[key])?.help}</div>
          </div>
        ))}
        <div className="field">
          <label htmlFor="captain">Kapitán</label>
          <select id="captain" value={t.captainId ?? ''} onChange={(e) => setTactic({ captainId: e.target.value })}>
            {xiPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {shortName(p)} (vůdcovství {p.leadership})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="setpiece">Exekutor standardek a penalt</label>
          <select id="setpiece" value={t.setPieceTakerId ?? ''} onChange={(e) => setTactic({ setPieceTakerId: e.target.value })}>
            {xiPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {shortName(p)} (standardky {p.attributes.setPieces}, zakončení {p.attributes.finishing})
              </option>
            ))}
          </select>
        </div>

        <div className="card" style={{ background: '#f7f8fa', marginTop: 12 }}>
          <h3>Asistent</h3>
          <p className="help" style={{ marginBottom: 6 }}>
            Pro tuhle jedenáctku doporučuje styl <strong>{styleName(recommendation.style)}</strong> a presink <strong>{pressName(recommendation.pressing)}</strong>
            {recommendation.style === t.style && recommendation.pressing === t.pressing ? ' – shoduje se s tvým nastavením.' : '.'}
          </p>
          <div className="row wrap">
            <button onClick={() => store.editUser((u, sq) => applyAssistantLineup(u, sq, data))}>Sestava od asistenta</button>
            {(recommendation.style !== t.style || recommendation.pressing !== t.pressing) && (
              <button onClick={() => setTactic({ style: recommendation.style, pressing: recommendation.pressing })}>Použít doporučení</button>
            )}
          </div>
          <label className="row" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={user.autoLineup} onChange={(e) => store.editUser((u) => (u.autoLineup = e.target.checked))} />
            Sestavu před každým zápasem vybírá asistent
          </label>
          <p className="help">Zraněné a vyloučené hráče asistent před zápasem nahradí vždy a dá ti vědět v novinkách.</p>
        </div>
      </aside>
    </div>
  );
}
