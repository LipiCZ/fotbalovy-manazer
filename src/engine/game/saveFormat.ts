// Save file format (IndexedDB and export/import as a JSON file).
// The static game data (data/*.json) is not saved; the save remembers its hash and warns when the
// data changed since (e.g. after tuning balance.json).

import type { GameData } from '../data.ts';
import { ATTRIBUTES } from '../types.ts';
import { SAVE_VERSION, type GameState } from './state.ts';

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
  if (raw.version !== SAVE_VERSION)
    throw new SaveError(`Uložená hra má verzi ${String(raw.version)}, tahle verze hry umí načíst jen verzi ${SAVE_VERSION}.`);
  const game = raw.game;
  if (!isObj(game)) throw new SaveError('Uložená hra je poškozená: chybí stav hry.');

  const problems: string[] = [];
  const clubIds = new Set(data.clubs.map((c) => c.id));
  if (typeof game.seed !== 'string') problems.push('seed');
  if (typeof game.seasonYear !== 'number') problems.push('sezóna');
  if (typeof game.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(game.date)) problems.push('datum');
  if (game.userClubId !== null && !clubIds.has(game.userClubId as string)) problems.push('klub hráče neexistuje');

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

  const warnings: string[] = [];
  if (raw.dataHash !== data.hash)
    warnings.push('Uložená hra vznikla s jinou verzí herních dat (např. po úpravě vyvážení). Hra se načetla, ale výsledky se mohou lišit.');
  return { save: raw as unknown as SaveFile, warnings };
}
