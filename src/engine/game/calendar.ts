// Calendar: dates of league rounds (design, section 3). Rounds are played on Saturdays from the
// first Saturday on/after `firstRound`, skipping the winter break. The season runs 1 July – 30 June.

import type { Competition } from '../types.ts';

const DAY = 86_400_000;

export function parseDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function formatIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return formatIso(parseDate(iso) + days * DAY);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso) - parseDate(fromIso)) / DAY);
}

/** Season date for an MM-DD value: July–December belong to seasonYear, January–June to seasonYear + 1. */
export function seasonDate(mmdd: string, seasonYear: number): string {
  const month = Number(mmdd.slice(0, 2));
  return `${month >= 7 ? seasonYear : seasonYear + 1}-${mmdd}`;
}

/**
 * Dates of `rounds` rounds of a competition: Saturdays outside the winter break; when there are
 * not enough of them (a bigger group), midweek rounds (Wednesdays) are spread evenly in between.
 */
export function roundDates(competition: Competition, seasonYear: number, rounds: number, lastDate = `${seasonYear + 1}-06-30`): string[] {
  const cal = competition.calendar;
  const breakFrom = parseDate(seasonDate(cal.winterBreak[0], seasonYear));
  const breakTo = parseDate(seasonDate(cal.winterBreak[1], seasonYear));
  const end = parseDate(lastDate);
  const start = parseDate(weekdayOnOrAfter(seasonDate(cal.firstRound, seasonYear), 6));
  const saturdays: number[] = [];
  const wednesdays: number[] = [];
  for (let ms = start; ms <= end; ms += 7 * DAY) {
    if (ms >= breakFrom && ms <= breakTo) continue;
    saturdays.push(ms);
    const wed = ms + 4 * DAY;
    if (wed <= end && !(wed >= breakFrom && wed <= breakTo)) wednesdays.push(wed);
  }
  // Only as many Saturdays as needed; the season should end as early as possible.
  if (saturdays.length >= rounds) return saturdays.slice(0, rounds).map(formatIso);
  const extra = rounds - saturdays.length;
  if (extra > wednesdays.length) throw new Error(`${competition.name}: ${rounds} kol se do sezóny nevejde`);
  const picked = Array.from({ length: extra }, (_, i) => wednesdays[Math.floor(((i + 0.5) * wednesdays.length) / extra)] as number);
  return [...saturdays, ...picked].sort((a, b) => a - b).map(formatIso);
}

export function seasonStart(seasonYear: number): string {
  return `${seasonYear}-07-01`;
}

/** First day with the given weekday (0 = Sunday … 6 = Saturday) on or after a date. */
export function weekdayOnOrAfter(iso: string, weekday: number): string {
  let ms = parseDate(iso);
  while (new Date(ms).getUTCDay() !== weekday) ms += DAY;
  return formatIso(ms);
}

export const SATURDAY = 6;
export const WEDNESDAY = 3;
