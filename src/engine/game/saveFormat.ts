// Save file format (IndexedDB and export/import as a JSON file).
// The static game data (data/*.json) is not saved; the save remembers its hash and warns when the
// data changed since (e.g. after tuning balance.json).

import type { GameData } from '../data.ts';
import { overall } from '../players/rating.ts';
import { ATTRIBUTES, type Player } from '../types.ts';
import { SAVE_VERSION, type GameState, type UserMatch } from './state.ts';

export const SAVE_FORMAT = 'fotbalovy-manazer-save';

export interface SaveMeta {
  label: string;
  savedAt: string;
  clubId: string | null;
  clubName: string;
  managerName: string;
  date: string;
  seasonYear: number;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  dataHash: string;
  meta: SaveMeta;
  game: GameState;
}

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

export function saveMeta(game: GameState, data: GameData, label: string, savedAt: string): SaveMeta {
  const club = data.clubs.find((c) => c.id === game.userClubId);
  return {
    label,
    savedAt,
    clubId: game.userClubId,
    clubName: club?.name ?? '',
    managerName: game.managerName,
    date: game.date,
    seasonYear: game.seasonYear,
  };
}

export function makeSave(game: GameState, data: GameData, label: string, savedAt: string): SaveFile {
  return { format: SAVE_FORMAT, version: SAVE_VERSION, dataHash: data.hash, meta: saveMeta(game, data, label, savedAt), game };
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses and validates a save. Throws SaveError with a Czech message; returns warnings. */
export function parseSave(input: string | unknown, data: GameData): { save: SaveFile; warnings: string[] } {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new SaveError('Soubor není platný JSON.');
    }
  }
  if (!isObj(raw) || raw.format !== SAVE_FORMAT) throw new SaveError('Tohle není uložená hra Fotbalového manažera CZ.');
  if (raw.version !== SAVE_VERSION && raw.version !== 1)
    throw new SaveError(`Uložená hra má verzi ${String(raw.version)}, tahle verze hry umí načíst verze 1–${SAVE_VERSION}.`);
  if (!isObj(raw.game)) throw new SaveError('Uložená hra je poškozená: chybí stav hry.');
  const warnings: string[] = [];
  if (raw.version === 1) {
    raw.game = migrateV1(raw.game, data);
    raw.version = SAVE_VERSION;
    warnings.push('Uložená hra pochází ze starší verze hry a byla převedena. MOL Cup se rozehraje až od příští sezóny.');
  }
  const game = raw.game as Record<string, unknown>;

  const problems: string[] = [];
  const clubIds = new Set(data.clubs.map((c) => c.id));
  if (typeof game.seed !== 'string') problems.push('seed');
  if (typeof game.seasonYear !== 'number') problems.push('sezóna');
  if (typeof game.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(game.date)) problems.push('datum');
  if (game.userClubId !== null && !clubIds.has(game.userClubId as string)) problems.push('klub hráče neexistuje');
  if (!isObj(game.membership) || !Object.entries(game.membership).every(([id, comp]) => clubIds.has(id) && data.competitions.some((c) => c.id === comp)))
    problems.push('příslušnost klubů k soutěžím');
  if (!Array.isArray(game.stages) || !Array.isArray(game.history)) problems.push('nadstavba nebo historie');

  const playerIds = new Set<string>();
  if (!Array.isArray(game.players) || game.players.length === 0) problems.push('hráči');
  else
    for (const p of game.players as unknown[]) {
      if (!isObj(p) || typeof p.id !== 'string' || !clubIds.has(p.clubId as string) || !isObj(p.attributes) || !isObj(p.state)) {
        problems.push('hráč s neplatnými údaji');
        break;
      }
      if (!ATTRIBUTES.every((a) => typeof (p.attributes as Record<string, unknown>)[a] === 'number')) {
        problems.push(`hráč ${p.id}: chybí atributy`);
        break;
      }
      if (playerIds.has(p.id)) {
        problems.push(`duplicitní hráč ${p.id}`);
        break;
      }
      playerIds.add(p.id);
    }

  if (!Array.isArray(game.competitions) || game.competitions.length !== data.competitions.length) problems.push('soutěže');
  else
    for (const c of game.competitions as unknown[]) {
      const comp = isObj(c) ? data.competitions.find((x) => x.id === c.id) : undefined;
      if (!isObj(c) || !comp || !Array.isArray(c.fixtures) || !Array.isArray(c.results) || !Array.isArray(c.roundDates)) {
        problems.push('soutěž s neplatnými údaji');
        break;
      }
      if (!(c.clubIds as unknown[]).every((id) => clubIds.has(id as string))) problems.push(`${comp.shortName}: neznámý klub`);
      if (typeof c.playedRounds !== 'number' || c.playedRounds > c.roundDates.length) problems.push(`${comp.shortName}: odehraná kola`);
    }

  if (game.userClubId !== null) {
    const user = game.user;
    if (!isObj(user) || !isObj(user.lineup) || !isObj(user.tactics)) problems.push('tým hráče');
    else {
      const lineup = user.lineup as { playerIds?: unknown; benchIds?: unknown };
      const ids = [...((lineup.playerIds as unknown[]) ?? []), ...((lineup.benchIds as unknown[]) ?? [])];
      if (!ids.every((id) => id === null || playerIds.has(id as string))) problems.push('sestava obsahuje neznámého hráče');
    }
  }
  if (problems.length > 0) throw new SaveError(`Uložená hra je poškozená (${problems.join(', ')}).`);

  if (raw.dataHash !== data.hash)
    warnings.push('Uložená hra vznikla s jinou verzí herních dat (např. po úpravě vyvážení). Hra se načetla, ale výsledky se mohou lišit.');
  return { save: raw as unknown as SaveFile, warnings };
}

/** Version 1 (phase 3) -> version 2: membership, post-season, cup, history, player development fields. */
function migrateV1(game: Record<string, unknown>, data: GameData): GameState {
  const g = game as unknown as GameState & { user: (GameState['user'] & { reports?: UserMatch['report'][] }) | null };
  const membership = Object.fromEntries(data.clubs.map((c) => [c.id, c.competitionId]));
  const players = (g.players as Player[]).map((p) => {
    const age = (Date.parse(`${g.date}T00:00:00Z`) - Date.parse(`${p.birthDate}T00:00:00Z`)) / (365.25 * 86_400_000);
    return {
      ...p,
      state: { ...p.state, seniorMonths: p.state.seniorMonths ?? Math.max(0, Math.round((age - 17) * 12)) },
      career: p.career ?? [],
      celHistory: p.celHistory ?? [overall(p, data.balance)],
    };
  });
  let user = g.user;
  if (user) {
    const comp = g.competitions.find((c) => c.clubIds.includes(g.userClubId as string));
    const name = data.competitions.find((c) => c.id === comp?.id)?.name ?? '';
    const own = (comp?.results ?? []).filter((r) => r.homeId === g.userClubId || r.awayId === g.userClubId);
    const matches: UserMatch[] = (user.reports ?? []).map((report, i) => ({
      date: own[i]?.date ?? g.date,
      label: `${name}, ${own[i]?.round ?? i + 1}. kolo`,
      report,
    }));
    const { reports: _reports, ...rest } = user;
    void _reports;
    user = { ...rest, training: rest.training ?? 'assistant', matches };
  }
  return { ...g, version: SAVE_VERSION, membership, players, stages: [], cup: null, history: [], user } as GameState;
}
