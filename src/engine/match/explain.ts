// 2–3 sentences from the assistant explaining why the match ended as it did (design, section 12:
// transparency – possession, condition, xG). Czech, written with "domácí/hosté" so that verbs do
// not depend on the grammatical gender of club names.

import type { MatchReport, Side } from './types.ts';

const num = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');
const WHO: Record<Side, string> = { home: 'domácí', away: 'hosté' };
const WHOM: Record<Side, string> = { home: 'domácím', away: 'hostům' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const opposite = (s: Side): Side => (s === 'home' ? 'away' : 'home');

function avgEndCondition(report: MatchReport, side: Side): number {
  const lines = report.players.filter((l) => l.side === side && l.minutesPlayed > 0 && l.red === 'none' && !l.injury);
  // Players on the pitch at the end: those who played until the last minute are the ones with the most minutes.
  const finishers = lines.filter((l) => !report.events.some((e) => e.type === 'sub' && e.playerId === l.playerId));
  const pool = finishers.length > 0 ? finishers : lines;
  return pool.reduce((s, l) => s + l.conditionEnd, 0) / Math.max(1, pool.length);
}

export function explainMatch(report: MatchReport): string[] {
  const { home, away } = report.stats;
  const xg = { home: home.xg, away: away.xg };
  const xgText = `xG ${num(home.xg)} : ${num(away.xg)}`;
  const sentences: string[] = [];

  // 1) Result vs. chances.
  if (report.homeGoals !== report.awayGoals) {
    const w: Side = report.homeGoals > report.awayGoals ? 'home' : 'away';
    const l = opposite(w);
    if (xg[w] - xg[l] >= 0.5) sentences.push(`${cap(WHO[w])} vyhráli zaslouženě, vytvořili si lepší šance (${xgText}).`);
    else if (xg[w] < xg[l] - 0.3)
      sentences.push(`${cap(WHO[w])} měli štěstí: víc šancí měli ${WHO[l]} (${xgText}), ale chyběla jim koncovka.`);
    else sentences.push(`Vyrovnaný zápas rozhodla efektivita v zakončení (${xgText}).`);
  } else if (Math.abs(xg.home - xg.away) >= 0.8) {
    const better: Side = xg.home > xg.away ? 'home' : 'away';
    sentences.push(`${cap(WHO[better])} si zasloužili vyhrát (${xgText}), ale šance neproměnili.`);
  } else {
    sentences.push(`Remíza odpovídá průběhu, šance byly vyrovnané (${xgText}).`);
  }

  // 2) Red card.
  const red = report.events.find((e) => e.type === 'red' || e.type === 'secondYellow');
  if (red) {
    const minute = red.added ? `${red.minute}+${red.added}` : `${red.minute}`;
    sentences.push(`Vyloučení v ${minute}. minutě oslabilo ${red.side === 'home' ? 'domácí' : 'hosty'}.`);
  }

  // 3) Condition.
  const cHome = avgEndCondition(report, 'home');
  const cAway = avgEndCondition(report, 'away');
  if (sentences.length < 3 && Math.abs(cHome - cAway) >= 6) {
    const tired: Side = cHome < cAway ? 'home' : 'away';
    sentences.push(
      `Ke konci docházely síly ${WHOM[tired]} (kondice ${Math.round(tired === 'home' ? cHome : cAway)} % proti ${Math.round(tired === 'home' ? cAway : cHome)} %).`,
    );
  }

  // 4) Possession and shots.
  if (sentences.length < 3) {
    const dom: Side = home.possession >= away.possession ? 'home' : 'away';
    const s = report.stats[dom];
    const o = report.stats[opposite(dom)];
    if (s.possession >= 58)
      sentences.push(
        s.shots > o.shots
          ? `${cap(WHO[dom])} měli míč ${s.possession} % času a vystřelili ${s.shots}× (soupeř ${o.shots}×).`
          : `${cap(WHO[dom])} sice drželi míč ${s.possession} % času, ale vystřelili jen ${s.shots}× (soupeř ${o.shots}×).`,
      );
  }
  if (sentences.length < 2) sentences.push(`Střely ${home.shots} : ${away.shots}, na branku ${home.shotsOnTarget} : ${away.shotsOnTarget}.`);
  return sentences.slice(0, 3);
}
