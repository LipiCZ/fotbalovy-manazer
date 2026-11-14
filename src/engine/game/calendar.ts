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

/** Dates of `rounds` rounds of a competition. */
export function roundDates(competition: Competition, seasonYear: number, rounds: number): string[] {
  const cal = competition.calendar;
  let ms = parseDate(seasonDate(cal.firstRound, seasonYear));
  while (new Date(ms).getUTCDay() !== 6) ms += DAY;
  const breakFrom = parseDate(seasonDate(cal.winterBreak[0], seasonYear));
  const breakTo = parseDate(seasonDate(cal.winterBreak[1], seasonYear));
  const seasonEnd = parseDate(`${seasonYear + 1}-06-30`);
  const dates: string[] = [];
  while (dates.length < rounds) {
    if (ms > seasonEnd) throw new Error(`${competition.name}: ${rounds} kol se do sezóny nevejde`);
    if (ms < breakFrom || ms > breakTo) dates.push(formatIso(ms));
    ms += 7 * DAY;
  }
  return dates;
}

export function seasonStart(seasonYear: number): string {
  return `${seasonYear}-07-01`;
}
