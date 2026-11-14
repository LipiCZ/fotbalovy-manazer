import { useState } from 'react';
import { squadOf } from '../../engine/game/advance.ts';
import { averageRating, formOf } from '../../engine/game/stats.ts';
import { ageOn, fs, overall, seasonStartDate, ts } from '../../engine/players/rating.ts';
import { POSITION_LABEL_CS, POSITIONS, type Player } from '../../engine/types.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { ConditionBar, fullName, RatingBadge, SortableTable, StatusIcons, type Column } from '../components.tsx';
import { num } from '../format.ts';

export function SquadScreen() {
  const { game, data } = useGame();
  const userClubId = game.userClubId as string;
  const reserveTeams = data.clubs.filter((c) => c.parentClubId === userClubId);
  const [teamId, setTeamId] = useState(userClubId);
  const squad = squadOf(game, teamId);
  const b = data.balance;
  const onDate = seasonStartDate(game.seasonYear);
  const inXi = new Set(game.user?.lineup.playerIds ?? []);
  const onBench = new Set(game.user?.lineup.benchIds ?? []);

  const columns: Column<Player>[] = [
    { key: 'pos', label: 'Poz.', render: (p) => p.positions.map((x) => POSITION_LABEL_CS[x]).join('/'), sortValue: (p) => POSITIONS.indexOf(p.positions[0]!) },
    { key: 'name', label: 'Jméno', render: (p) => fullName(p), sortValue: (p) => `${p.lastName} ${p.firstName}` },
    { key: 'age', label: 'Věk', numeric: true, render: (p) => ageOn(p.birthDate, onDate), sortValue: (p) => ageOn(p.birthDate, onDate) },
    { key: 'cel', label: 'CEL', title: 'celkové hodnocení na hlavní pozici', numeric: true, render: (p) => <strong>{overall(p, b)}</strong>, sortValue: (p) => overall(p, b) },
    // POT is shown exactly for own players in the MVP; phase 6 replaces it with a scouting estimate.
    { key: 'pot', label: 'POT', title: 'potenciál', numeric: true, render: (p) => p.pot, sortValue: (p) => p.pot },
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
    ...(teamId === userClubId
      ? [{ key: 'role', label: 'Sestava', render: (p: Player) => (inXi.has(p.id) ? 'základ' : onBench.has(p.id) ? 'lavička' : '') }]
      : []),
  ];

  return (
    <div className="card">
      <h2>Soupiska</h2>
      <div className="tabs">
        <button className={teamId === userClubId ? 'active' : ''} onClick={() => setTeamId(userClubId)}>
          A-tým
        </button>
        {reserveTeams.map((c) => (
          <button key={c.id} className={teamId === c.id ? 'active' : ''} onClick={() => setTeamId(c.id)}>
            {c.shortName} (jen ke čtení)
          </button>
        ))}
      </div>
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
