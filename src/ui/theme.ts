// Club accent colour (design, section 15). Very light colours (white, yellow) would make text
// unreadable, so the secondary colour or a darkened variant is used instead.

import type { Club } from '../engine/types.ts';

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance 0–1. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

function darken(hex: string, factor: number): string {
  return `#${rgb(hex)
    .map((c) => Math.round(c * factor).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Accent usable as a background with white text (contrast ≥ 4.5 : 1), and a text colour on it. */
export function clubAccent(club: Pick<Club, 'primaryColor' | 'secondaryColor'>): { accent: string; onAccent: string } {
  const candidates = [club.primaryColor, club.secondaryColor];
  for (const c of candidates) if (contrast(c, '#FFFFFF') >= 4.5) return { accent: c, onAccent: '#FFFFFF' };
  let c = club.primaryColor;
  for (let i = 0; i < 12 && contrast(c, '#FFFFFF') < 4.5; i++) c = darken(c, 0.85);
  return { accent: c, onAccent: '#FFFFFF' };
}
