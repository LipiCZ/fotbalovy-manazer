// Czech formatting helpers for the UI.

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
const longFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "so 25. 7. 2026" */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T12:00:00Z`));
}

/** "sobota 25. července" */
export function formatDateLong(iso: string): string {
  return longFmt.format(new Date(`${iso}T12:00:00Z`));
}

export function num(v: number, digits = 1): string {
  return v.toFixed(digits).replace('.', ',');
}

export function seasonLabel(year: number): string {
  return `${year}/${String(year + 1).slice(2)}`;
}

/** Event minute: 45+2' */
export function minuteLabel(minute: number, added?: number): string {
  return added ? `${minute}+${added}'` : `${minute}'`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}
