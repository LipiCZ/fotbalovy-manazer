import { useState, type ReactNode } from 'react';
import type { GameData } from '../engine/data.ts';
import { runtimeOf } from '../engine/game/advance.ts';
import type { GameState, MatchSummary } from '../engine/game/state.ts';
import type { Club, Player } from '../engine/types.ts';
import { getAppStore } from '../state/store.ts';
import { num } from './format.ts';

// ---------------------------------------------------------------- lookups

export function clubOf(data: GameData, id: string | null | undefined): Club | undefined {
  return data.clubs.find((c) => c.id === id);
}

export function playerOf(game: GameState, id: string | null | undefined): Player | undefined {
  return id ? runtimeOf(game).byId.get(id) : undefined;
}

export const fullName = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;
export const shortName = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName.charAt(0)}. ${p.lastName}`;

/** W/D/L of a club in a result. */
export function outcomeFor(result: MatchSummary, clubId: string): 'W' | 'D' | 'L' {
  const own = result.homeId === clubId ? result.homeGoals : result.awayGoals;
  const opp = result.homeId === clubId ? result.awayGoals : result.homeGoals;
  return own > opp ? 'W' : own < opp ? 'L' : 'D';
}

// ---------------------------------------------------------------- small components

export function RatingBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="muted">–</span>;
  const cls = value >= 7 ? 'rating-hi' : value < 6 ? 'rating-lo' : 'rating-mid';
  return <span className={`badge ${cls}`}>{num(value)}</span>;
}

const OUTCOME_LABEL = { W: 'V', D: 'R', L: 'P' } as const;

export function FormBadges({ outcomes }: { outcomes: ('W' | 'D' | 'L')[] }) {
  if (outcomes.length === 0) return <span className="muted">zatím bez zápasu</span>;
  return (
    <span className="form" aria-label="forma">
      {outcomes.map((o, i) => (
        <span key={i} className={o}>
          {OUTCOME_LABEL[o]}
        </span>
      ))}
    </span>
  );
}

export function ConditionBar({ value }: { value: number }) {
  return (
    <div className={`bar ${value < 80 ? 'low' : ''}`} title={`Kondice ${Math.round(value)} %`}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function StatusIcons({ player }: { player: Player }) {
  const s = player.state;
  const parts: ReactNode[] = [];
  if (s.injury) parts.push(<span key="i" className="bad" title={`${s.injury.type}, ještě ${s.injury.daysLeft} dní`}>✚ {s.injury.daysLeft} d</span>);
  if (s.suspensionMatches > 0) parts.push(<span key="s" className="bad" title="stopka">🟥 {s.suspensionMatches}</span>);
  if (s.yellowCards > 0) parts.push(<span key="y" title="žluté karty v sezóně">🟨 {s.yellowCards}</span>);
  return <span className="row">{parts}</span>;
}

export function PlayerLink({ player, short = false }: { player: Player; short?: boolean }) {
  return (
    <button className="link" onClick={() => getAppStore().getState().navigate({ name: 'player', playerId: player.id })}>
      {short ? shortName(player) : fullName(player)}
    </button>
  );
}

export function ClubLabel({ club }: { club: Club | undefined }) {
  if (!club) return null;
  return (
    <span className="row">
      <span className="swatch" style={{ background: club.primaryColor, width: 12, height: 12 }} />
      {club.shortName}
    </span>
  );
}

// ---------------------------------------------------------------- sortable tables

export interface Column<T> {
  key: string;
  label: string;
  title?: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;
  numeric?: boolean;
}

export function SortableTable<T>({
  rows,
  columns,
  rowKey,
  initialSort,
  onRowClick,
  highlight,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; desc: boolean };
  onRowClick?: (row: T) => void;
  highlight?: (row: T) => boolean;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const sorted = col?.sortValue
    ? [...rows].sort((a, b) => {
        const va = col.sortValue!(a);
        const vb = col.sortValue!(b);
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'cs');
        return sort!.desc ? -cmp : cmp;
      })
    : rows;
  return (
    <table className="data">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              title={c.title}
              className={`${c.sortValue ? 'sortable' : ''} ${sort?.key === c.key ? 'sorted' : ''} ${c.numeric ? 'num' : ''}`}
              onClick={() => c.sortValue && setSort((s) => ({ key: c.key, desc: s?.key === c.key ? !s.desc : c.numeric === true }))}
            >
              {c.label}
              {sort?.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={rowKey(r)} className={`${onRowClick ? 'clickable' : ''} ${highlight?.(r) ? 'me' : ''}`} onClick={() => onRowClick?.(r)}>
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? 'num' : ''}>
                {c.render(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
