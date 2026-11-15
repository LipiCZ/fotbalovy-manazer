import { useState } from 'react';
import { academyOf, squadOf } from '../../engine/game/advance.ts';
import { exactAge } from '../../engine/game/development.ts';
import { activeReserveTeam, type SquadTarget } from '../../engine/game/userTeam.ts';
import { averageRating, formOf } from '../../engine/game/stats.ts';
import { ageOn, fs, overall, seasonStartDate, ts } from '../../engine/players/rating.ts';
import { POSITION_LABEL_CS, POSITIONS, type Player } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ConditionBar, fullName, RatingBadge, SortableTable, StatusIcons, type Column } from '../components.tsx';
import { estimateOf } from '../../engine/game/scouting.ts';
import { estimateMid, rangeLabel } from '../market.tsx';
import { num } from '../format.ts';

export function SquadScreen() {
  const { game, data } = useGame();
  const userClubId = game.userClubId as string;
  const bId = activeReserveTeam(data, game.membership, userClubId);
  const bClub = data.clubs.find((c) => c.id === bId);
  const [tab, setTab] = useState<SquadTarget>('A');
  const teamId = tab === 'B' && bId ? bId : userClubId;
  const squad = tab === 'academy' ? academyOf(game, userClubId) : squadOf(game, teamId);
  const store = getAppStore().getState();
  const limits = (id: string) => {
    const comp = game.membership[id];
    const level = data.competitions.find((c) => c.id === comp)?.level;
    return level ? b.squads.byLevel[`${level}`] : null;
  };
  const moveButtons = (p: Player) => {
    const targets: { t: SquadTarget; label: string }[] = [];
    if (tab !== 'A') targets.push({ t: 'A', label: '→ A-tým' });
    if (tab !== 'B' && bId) targets.push({ t: 'B', label: '→ B-tým' });
    if (tab !== 'academy' && exactAge(p.birthDate, game.date) < b.academy.releaseAtAge) targets.push({ t: 'academy', label: '→ mládež' });
    return (
      <span className="row" onClick={(e) => e.stopPropagation()}>
        {targets.map(({ t, label }) => (
          <button key={t} style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => store.movePlayer(p.id, t)}>
            {label}
          </button>
        ))}
        {tab === 'academy' && (
          <button style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => store.releaseFromAcademy(p.id)} title="Hráč odejde z klubu">
            uvolnit
          </button>
        )}
      </span>
    );
  };
  const b = data.balance;
  const onDate = seasonStartDate(game.seasonYear);
  const inXi = new Set(game.user?.lineup.playerIds ?? []);
  const onBench = new Set(game.user?.lineup.benchIds ?? []);

  const columns: Column<Player>[] = [
    { key: 'pos', label: 'Poz.', render: (p) => p.positions.map((x) => POSITION_LABEL_CS[x]).join('/'), sortValue: (p) => POSITIONS.indexOf(p.positions[0]!) },
    { key: 'name', label: 'Jméno', render: (p) => fullName(p), sortValue: (p) => `${p.lastName} ${p.firstName}` },
    { key: 'age', label: 'Věk', numeric: true, render: (p) => ageOn(p.birthDate, onDate), sortValue: (p) => ageOn(p.birthDate, onDate) },
    { key: 'cel', label: 'CEL', title: 'celkové hodnocení na hlavní pozici', numeric: true, render: (p) => <strong>{overall(p, b)}</strong>, sortValue: (p) => overall(p, b) },
    // POT is an estimate (design, section 6): own players ± balance.scouting.ownAccuracy.
    { key: 'pot', label: 'POT', title: 'odhad potenciálu', numeric: true, render: (p) => rangeLabel(estimateOf(game, data, p)?.pot), sortValue: (p) => estimateMid(game, data, p, 'pot') },
    { key: 'contract', label: 'Smlouva', title: 'smlouva do (30. 6.)', numeric: true, render: (p) => (p.contract ? p.contract.until.slice(0, 4) : '–'), sortValue: (p) => p.contract?.until ?? '' },
    { key: 'ts', label: 'TS', title: 'technické schopnosti', numeric: true, render: (p) => ts(p, b), sortValue: (p) => ts(p, b) },
    { key: 'fs', label: 'FS', title: 'fyzické schopnosti', numeric: true, render: (p) => fs(p, b), sortValue: (p) => fs(p, b) },
    { key: 'form', label: 'Forma', title: 'průměr posledních 5 známek', numeric: true, render: (p) => <RatingBadge value={formOf(p, data)} />, sortValue: (p) => formOf(p, data) ?? 0 },
    { key: 'cond', label: 'Kondice', render: (p) => <ConditionBar value={p.state.condition} />, sortValue: (p) => p.state.condition },
    { key: 'apps', label: 'Z', title: 'zápasy', numeric: true, render: (p) => game.playerStats[p.id]?.apps ?? 0, sortValue: (p) => game.playerStats[p.id]?.apps ?? 0 },
    { key: 'goals', label: 'G', title: 'góly', numeric: true, render: (p) => game.playerStats[p.id]?.goals ?? 0, sortValue: (p) => game.playerStats[p.id]?.goals ?? 0 },
    { key: 'assists', label: 'A', title: 'asistence', numeric: true, render: (p) => game.playerStats[p.id]?.assists ?? 0, sortValue: (p) => game.playerStats[p.id]?.assists ?? 0 },
    {
      key: 'avg',
      label: 'Ø zn.',
      title: 'průměrná známka v sezóně',
      numeric: true,
      render: (p) => {
        const v = averageRating(game.playerStats[p.id]);
        return v === null ? <span className="muted">–</span> : num(v, 2);
      },
      sortValue: (p) => averageRating(game.playerStats[p.id]) ?? 0,
    },
    { key: 'status', label: 'Stav', render: (p) => <StatusIcons player={p} /> },
    ...(tab === 'A' ? [{ key: 'role', label: 'Sestava', render: (p: Player) => (inXi.has(p.id) ? 'základ' : onBench.has(p.id) ? 'lavička' : '') }] : []),
    { key: 'move', label: 'Přesun', render: moveButtons },
  ];
  const lim = tab === 'academy' ? null : limits(teamId);

  return (
    <div className="card">
      <h2>Soupiska</h2>
      <div className="tabs">
        <button className={tab === 'A' ? 'active' : ''} onClick={() => setTab('A')}>
          A-tým ({squadOf(game, userClubId).length})
        </button>
        {bClub && (
          <button className={tab === 'B' ? 'active' : ''} onClick={() => setTab('B')}>
            {bClub.shortName} ({squadOf(game, bClub.id).length})
          </button>
        )}
        <button className={tab === 'academy' ? 'active' : ''} onClick={() => setTab('academy')}>
          Mládež ({academyOf(game, userClubId).length})
        </button>
      </div>
      <p className="help">
        {tab === 'A' && lim && `Obvyklá velikost kádru v této soutěži: ${lim.min}–${lim.max} hráčů. `}
        {tab === 'B' && 'B-tým hraje sám, ty jen sleduješ a přesouváš hráče. '}
        {tab === 'academy' &&
          `Dorostenci hrají nesimulovanou dorosteneckou ligu a rostou podle minut a formy. Nábor je v lednu a v červenci, v ${b.academy.releaseAtAge} letech hráč z akademie odchází, pokud ho nevytáhneš. `}
      </p>
      <SortableTable
        rows={squad}
        columns={columns}
        rowKey={(p) => p.id}
        initialSort={{ key: 'pos', desc: false }}
        onRowClick={(p) => getAppStore().getState().navigate({ name: 'player', playerId: p.id })}
      />
    </div>
  );
}
