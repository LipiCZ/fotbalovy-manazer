// Season awards (design, section 14; phase 8): goal of the season, discovery, best and worst
// transfer, the most pointless yellow card and the quote of the season. Pure: computed from the
// finished season; the transition stores them in the season record.

import type { GameData } from '../data.ts';
import { Rng } from '../rng.ts';
import type { Player } from '../types.ts';
import { exactAge } from './development.ts';
import { clubName } from './market.ts';
import type { Award, GameState } from './state.ts';

const nameOf = (p: Player | undefined) => (p ? `${p.firstName} ${p.lastName}` : 'neznámý hráč');
const num = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

export function seasonAwards(state: GameState, data: GameData): Award[] {
  const out: Award[] = [];
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const userId = state.userClubId;
  const comp = userId ? state.membership[userId] : undefined;
  const matches = state.user?.matches ?? [];

  // Goal of the season: the least likely goal in the manager's matches (lowest xG).
  let best: { xg: number; playerId: string; clubId: string; minute: number; label: string } | null = null;
  for (const m of matches)
    for (const e of m.report.events) {
      if (e.type !== 'goal' || !e.playerId || e.xg === undefined) continue;
      const clubId = e.side === 'home' ? m.report.homeId : m.report.awayId;
      if (!best || e.xg < best.xg) best = { xg: e.xg, playerId: e.playerId, clubId, minute: e.minute, label: m.label };
    }
  if (best)
    out.push({ title: 'Gól sezóny', playerId: best.playerId, text: `${nameOf(byId.get(best.playerId))} (${clubName(data, best.clubId)}), ${best.minute}. minuta – z šance s xG jen ${num(best.xg)} (${best.label}).` });

  // Discovery: the best young player of the manager's competition.
  if (comp) {
    const young = state.players
      .filter((p) => state.membership[p.clubId] === comp && exactAge(p.birthDate, state.date) <= 21)
      .map((p) => ({ p, s: state.playerStats[p.id] }))
      .filter((x) => x.s && x.s.apps >= 8)
      .sort((a, b) => b.s!.ratingSum / b.s!.apps - a.s!.ratingSum / a.s!.apps || a.p.id.localeCompare(b.p.id))[0];
    if (young)
      out.push({ title: 'Objev sezóny', playerId: young.p.id, text: `${nameOf(young.p)} (${clubName(data, young.p.clubId)}, ${Math.floor(exactAge(young.p.birthDate, state.date))} let): průměrná známka ${num(young.s!.ratingSum / young.s!.apps)} v ${young.s!.apps} zápasech.` });
  }

  // Transfers of this season (paid ones with enough matches since).
  const seasonStart = `${state.seasonYear}-07-01`;
  const deals = state.market.offers
    .filter((o) => o.status === 'done' && o.kind === 'transfer' && o.fee > 0 && o.createdAt >= seasonStart)
    .map((o) => ({ o, p: byId.get(o.playerId), s: state.playerStats[o.playerId] }))
    .filter((x) => x.p && x.s && x.s.apps >= 5);
  if (deals.length > 0) {
    const avg = (x: (typeof deals)[number]) => x.s!.ratingSum / x.s!.apps;
    const top = [...deals].sort((a, b) => avg(b) - avg(a) || a.o.id.localeCompare(b.o.id))[0]!;
    out.push({ title: 'Nejlepší přestup', playerId: top.p!.id, text: `${nameOf(top.p)}: ${clubName(data, top.o.sellerId)} → ${clubName(data, top.o.buyerId)} za ${Math.round(top.o.fee / 1000).toLocaleString('cs-CZ')} tis. Kč, průměrná známka ${num(avg(top))}.` });
    const flop = [...deals].sort((a, b) => b.o.fee * (7 - avg(b)) - a.o.fee * (7 - avg(a)) || a.o.id.localeCompare(b.o.id))[0]!;
    if (flop !== top && avg(flop) < 6.5)
      out.push({ title: 'Nejhorší přestup', playerId: flop.p!.id, text: `${nameOf(flop.p)}: ${clubName(data, flop.o.sellerId)} → ${clubName(data, flop.o.buyerId)} za ${Math.round(flop.o.fee / 1000).toLocaleString('cs-CZ')} tis. Kč, průměrná známka jen ${num(avg(flop))}.` });
  }

  // The most pointless yellow card: late, in a match that was long decided.
  let yellow: { minute: number; margin: number; playerId: string; label: string } | null = null;
  for (const m of matches) {
    const margin = Math.abs(m.report.homeGoals - m.report.awayGoals);
    for (const e of m.report.events) {
      if (e.type !== 'yellow' || !e.playerId) continue;
      const score = margin * 100 + e.minute;
      if (!yellow || score > yellow.margin * 100 + yellow.minute) yellow = { minute: e.minute, margin, playerId: e.playerId, label: m.label };
    }
  }
  if (yellow)
    out.push({ title: 'Nejzbytečnější žlutá karta', playerId: yellow.playerId, text: `${nameOf(byId.get(yellow.playerId))} v ${yellow.minute}. minutě zápasu, který skončil rozdílem ${yellow.margin} ${yellow.margin === 1 ? 'gólu' : 'gólů'} (${yellow.label}).` });

  // Quote of the season.
  const squad = userId ? state.players.filter((p) => p.clubId === userId && !p.academy) : [];
  if (squad.length > 0) {
    const rng = new Rng(`${state.seed}/quote/${state.seasonYear}`);
    out.push({ title: 'Hláška sezóny', text: rng.pick(data.flavor.quotes).replace('{player}', nameOf(rng.pick(squad))) });
  }
  return out;
}
