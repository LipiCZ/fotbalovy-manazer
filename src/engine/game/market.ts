// Transfer market (design, section 8; phase 6): market value, transfer windows, offers and
// negotiations, personal terms, loans, contract renewals, free agents and the AI market.
// Accounting follows section 13: the purchase cost (fee + agent + signing bonus) is capitalised
// and amortised over the contract; on a sale the residual book value is written off.

import type { GameData } from '../data.ts';
import { celAt, overall } from '../players/rating.ts';
import { generatePlayer } from '../players/generate.ts';
import { Rng, hashString } from '../rng.ts';
import { FREE_AGENT, PHYSICAL, type ClubSize, type Level, type Player, type Position } from '../types.ts';
import { invalidateRuntime, squadOf } from './advance.ts';
import { addDays, daysBetween } from './calendar.ts';
import { averageRecent, exactAge, idAllocator } from './development.ts';
import { book, levelOf, payingClub, wageFor } from './finance.ts';
import { selectionFor } from './selection.ts';
import type { GameState, Installment, MarketState, NewsItem, Offer } from './state.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const nameOf = (p: Player) => `${p.firstName} ${p.lastName}`;
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export function emptyMarket(): MarketState {
  return { offers: [], installments: [], nextId: 1, windowBuys: {} };
}

const clubInfo = (data: GameData, clubId: string) => data.clubs.find((c) => c.id === clubId);
const sizeOf = (data: GameData, clubId: string): ClubSize => clubInfo(data, payingClub(data, clubId))?.size ?? 1;
const isReserve = (data: GameData, clubId: string) => Boolean(clubInfo(data, clubId)?.parentClubId);
export const clubName = (data: GameData, clubId: string) => (clubId === FREE_AGENT ? 'bez klubu' : (clubInfo(data, clubId)?.shortName ?? clubId));

/** The manager's organisation: A-team, B-team and academy. */
export function isUserOrg(state: GameState, data: GameData, clubId: string): boolean {
  return state.userClubId !== null && clubId !== FREE_AGENT && payingClub(data, clubId) === state.userClubId;
}

/** Owner of the player's registration (the lending club for a player on loan). */
export const ownerOf = (p: Player) => p.loan?.fromClubId ?? p.clubId;

// ---------------------------------------------------------------- windows

/** Open transfer window on a date (design, section 8). */
export function windowOn(date: string, data: GameData): 'summer' | 'winter' | null {
  const md = date.slice(5);
  const w = data.balance.transfers.windows;
  if (md >= w.summer[0] && md <= w.summer[1]) return 'summer';
  if (md >= w.winter[0] && md <= w.winter[1]) return 'winter';
  return null;
}

/** Opening day of the window that is open on `date`, or of the next one. */
export function windowStart(date: string, data: GameData): string {
  const w = data.balance.transfers.windows;
  const year = Number(date.slice(0, 4));
  const md = date.slice(5);
  if (md <= w.winter[1]) return `${year}-${w.winter[0]}`;
  if (md <= w.summer[1]) return `${year}-${w.summer[0]}`;
  return `${year + 1}-${w.winter[0]}`;
}

/** Market days in (from, to]: the first day of a window and then every 7 days while it is open. */
export function marketDays(from: string, to: string, data: GameData): string[] {
  const out: string[] = [];
  let start = windowStart(addDays(from, 1), data);
  for (let guard = 0; start <= to && guard < 8; guard++) {
    for (let d = start; windowOn(d, data) && d <= to; d = addDays(d, 7)) if (d > from) out.push(d);
    start = windowStart(addDays(start, 70), data);
  }
  return out;
}

// ---------------------------------------------------------------- market value

function interpolate(table: [number, number][], x: number): number {
  const first = table[0] as [number, number];
  if (x <= first[0]) return first[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i] as [number, number];
    const [x0, y0] = table[i - 1] as [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return (table.at(-1) as [number, number])[1];
}

function leagueFactor(state: GameState, data: GameData, p: Player): number {
  const t = data.balance.transfers;
  const club = ownerOf(p);
  const level: Level = club === FREE_AGENT ? 3 : levelOf(state, data, club);
  const now = t.leagueValueFactor[`${level}`];
  const v = p.valueLeague;
  if (!v) return now;
  const share = clamp(daysBetween(v.since, state.date) / (30.4 * t.leagueValueAdjustMonths), 0, 1);
  return v.from + (now - v.from) * share;
}

export function monthsLeft(p: Player, date: string): number {
  return p.contract ? Math.max(0, daysBetween(date, p.contract.until) / 30.4) : 0;
}

/** Market value in CZK (design, section 8: quality, age, potential, form, contract, competition). */
export function marketValue(state: GameState, data: GameData, p: Player): number {
  const v = data.balance.transfers.value;
  const cel = overall(p, data.balance);
  const age = exactAge(p.birthDate, state.date);
  const ageF = interpolate(v.ageFactor, age);
  const potF = age < v.potentialUntilAge ? 1 + v.potentialPerPoint * Math.max(0, p.pot - cel) : 1;
  const avg = averageRecent(p, 5);
  const formF = avg === null ? 1 : v.formRange[0] + (v.formRange[1] - v.formRange[0]) * clamp((avg - 5.5) / 2, 0, 1);
  const m = monthsLeft(p, state.date);
  const cf = v.contractFactor;
  const contractF = !p.contract ? 0 : m > 30 ? cf['3'] : m > 18 ? cf['2'] : m > 10 ? cf['1summer'] : m > 6 ? cf['1afterWindow'] : cf['1winter'];
  const raw = v.base * v.growth ** (cel - v.pivot) * ageF * potF * formF * contractF * leagueFactor(state, data, p);
  if (!p.contract) return 0;
  return Math.max(v.min, roundTo(raw, v.round));
}

// ---------------------------------------------------------------- asking price and wages

/** Importance of a player in his club: starter, rotation or surplus. */
function importance(state: GameState, data: GameData, p: Player): number {
  const n = data.balance.transfers.negotiation;
  const squad = squadOf(state, p.clubId);
  const rank = [...squad].sort((a, b) => overall(b, data.balance) - overall(a, data.balance) || a.id.localeCompare(b.id)).findIndex((x) => x.id === p.id);
  if (rank < 0) return n.importanceSurplus;
  return rank < 11 ? n.importanceStarter : rank < 18 ? n.importanceRotation : n.importanceSurplus;
}

function sellerShort(state: GameState, data: GameData, clubId: string): boolean {
  const f = state.finances[payingClub(data, clubId)];
  return f !== undefined && f.cash < 0;
}

/** Price the selling club wants (deterministic per player, buyer and season). */
export function askingPrice(state: GameState, data: GameData, p: Player, buyerId: string): number {
  const n = data.balance.transfers.negotiation;
  const value = marketValue(state, data, p);
  if (p.listed?.kind === 'sale' && isUserOrg(state, data, p.clubId)) return p.listed.askingPrice;
  const rng = new Rng(`${state.seed}/ask/${p.id}/${buyerId}/${state.seasonYear}`);
  let price = value * importance(state, data, p);
  price *= p.listed?.kind === 'sale' ? rng.float(n.listedDiscount[0], n.listedDiscount[1]) : rng.float(n.unwillingMarkup[0], n.unwillingMarkup[1]);
  if (sellerShort(state, data, p.clubId)) price *= n.needMoneyDiscount;
  return Math.max(data.balance.transfers.value.min, roundTo(price, data.balance.transfers.value.round));
}

/** What the selling club counts an offer as: installments are worth less, a sell-on clause a little more. */
export function effectiveFee(fee: number, installments: number, sellOnShare: number, data: GameData): number {
  const n = data.balance.transfers.negotiation;
  return (fee / (1 + n.installmentPremium * (installments - 1))) * (1 + 0.5 * sellOnShare);
}

export interface Terms {
  wage: number;
  years: number;
  signingBonus: number;
}

/** Personal terms the player asks for at a new club (design, section 8). */
export function personalDemand(state: GameState, data: GameData, p: Player, buyerId: string): Terms {
  const t = data.balance.transfers.personal;
  const fa = data.balance.transfers.freeAgents;
  const buyerLevel = levelOf(state, data, buyerId);
  const from = ownerOf(p);
  const fromLevel: Level = from === FREE_AGENT ? buyerLevel : levelOf(state, data, from);
  let wage = wageFor(p, buyerLevel, isReserve(data, buyerId), sizeOf(data, buyerId), data.balance);
  if (buyerLevel > fromLevel) wage *= 1 + t.lowerLeagueMarkup;
  if (buyerLevel < fromLevel) wage *= 1 - t.higherLeagueDiscount;
  const rng = new Rng(`${state.seed}/terms/${p.id}/${buyerId}/${state.seasonYear}`);
  const free = p.clubId === FREE_AGENT;
  if (free) {
    const months = p.freeSince ? daysBetween(p.freeSince, state.date) / 30.4 : 0;
    wage *= Math.max(fa.minDemand, 1 - rng.float(fa.demandDropPerMonth[0], fa.demandDropPerMonth[1]) * months);
  } else wage = Math.max(wage, p.contract?.wage ?? 0);
  wage = roundTo(wage, 500);
  const [b0, b1] = free ? t.freeAgentBonusMonths : t.signingBonusMonths;
  const age = exactAge(p.birthDate, state.date);
  const years = age >= 32 ? 1 : age >= 29 ? 2 : age >= 24 ? 3 : 4;
  return { wage, years: clamp(years, t.years[0], t.years[1]), signingBonus: roundTo(wage * rng.int(b0, b1), 1000) };
}

/** Demand for a contract renewal (design, section 8: quality, form and minutes). */
export function renewalDemand(state: GameState, data: GameData, p: Player): Terms {
  const r = data.balance.transfers.renewal;
  const level = levelOf(state, data, p.clubId);
  let wage = wageFor(p, level, isReserve(data, p.clubId), sizeOf(data, p.clubId), data.balance) * (1 + r.raise);
  const avg = averageRecent(p, 5);
  if (avg !== null && avg >= 7) wage *= 1 + r.formRaise;
  const share = p.career?.at(-1)?.minutesShare;
  if (!p.academy && share !== undefined && share < r.unhappyMinutesShare) wage *= 1 + r.unhappyMarkup;
  wage = roundTo(Math.max(wage, p.contract?.wage ?? 0), 500);
  const age = exactAge(p.birthDate, state.date);
  return { wage, years: age >= 32 ? 1 : age >= 29 ? 2 : 3, signingBonus: 0 };
}

/** A renewal may be negotiated from 1 July two years before the contract ends. */
export function canRenew(state: GameState, data: GameData, p: Player): boolean {
  if (!p.contract || p.loan) return false;
  const endYear = Number(p.contract.until.slice(0, 4));
  return state.seasonYear + 1 >= endYear - data.balance.transfers.renewal.fromYearsBefore + 1;
}

// ---------------------------------------------------------------- bookkeeping helpers

function scheduleFee(state: GameState, data: GameData, fee: number, installments: number, buyer: string, recipients: [string, number][], date: string, note: string): void {
  const n = Math.max(1, installments);
  for (let i = 0; i < n; i++) {
    const when = i === 0 ? date : addDays(date, 365 * i);
    for (const [club, share] of recipients) {
      const part = Math.round((fee * share) / n);
      if (part <= 0) continue;
      const inst: Installment = { date: when, fromClubId: buyer, toClubId: club, amount: part, note };
      const fb = state.finances[buyer];
      const fr = state.finances[club];
      if (fb) fb.payables += part;
      if (fr) fr.receivables += part;
      if (i === 0) payInstallment(state, inst);
      else state.market.installments.push(inst);
    }
  }
  void data;
}

function payInstallment(state: GameState, i: Installment): void {
  const fb = state.finances[i.fromClubId];
  const fr = state.finances[i.toClubId];
  if (fb) fb.payables -= i.amount;
  if (fr) fr.receivables -= i.amount;
  book(state, i.fromClubId, 'transfersOut', -i.amount, i.date, i.note);
  book(state, i.toClubId, 'transferReceipts', i.amount, i.date, i.note);
}

/** Pays the installments that are due. */
export function payDueInstallments(state: GameState, date: string): void {
  const due = state.market.installments.filter((i) => i.date <= date);
  if (due.length === 0) return;
  state.market.installments = state.market.installments.filter((i) => i.date > date);
  for (const i of due) payInstallment(state, { ...i, date });
}

/** Writes off what is left of a registration (sale, release, retirement). */
export function writeOffRegistration(state: GameState, data: GameData, p: Player, date: string, note: string): void {
  const r = p.registration;
  delete p.registration;
  if (!r || r.bookValue <= 0) return;
  const owner = payingClub(data, ownerOf(p));
  const f = state.finances[owner];
  if (f) f.registrations -= r.bookValue;
  book(state, owner, 'amortization', -Math.round(r.bookValue), date, note);
}

/** Monthly amortisation of registrations (part of monthlyFinance). */
export function amortizeRegistrations(state: GameState, data: GameData, date: string): void {
  for (const p of state.players) {
    const r = p.registration;
    if (!r || r.bookValue <= 0) continue;
    const amount = Math.min(r.bookValue, r.monthly);
    r.bookValue -= amount;
    const owner = payingClub(data, ownerOf(p));
    const f = state.finances[owner];
    if (f) f.registrations -= amount;
    book(state, owner, 'amortization', -Math.round(amount), date, `amortizace smlouvy: ${nameOf(p)}`);
    if (r.bookValue < 1) delete p.registration;
  }
}

function capitalise(state: GameState, data: GameData, p: Player, cost: number, clubId: string): void {
  if (cost <= 0) return;
  const months = Math.max(1, monthsLeft(p, state.date));
  p.registration = { cost, bookValue: cost, monthly: cost / months };
  const f = state.finances[payingClub(data, clubId)];
  if (f) f.registrations += cost;
}

/** After a renewal the remaining book value is spread over the new contract. */
function respread(p: Player, date: string): void {
  if (p.registration) p.registration.monthly = p.registration.bookValue / Math.max(1, monthsLeft(p, date));
}

export function dropFromUserLineup(state: GameState, playerId: string): void {
  const l = state.user?.lineup;
  if (!l) return;
  l.playerIds = l.playerIds.map((id) => (id === playerId ? null : id));
  l.benchIds = l.benchIds.filter((id) => id !== playerId);
}

const contractUntil = (state: GameState, years: number) => `${state.seasonYear + years}-06-30`;

// ---------------------------------------------------------------- moves

function news(state: GameState, data: GameData, out: NewsItem[] | undefined, p: Player, text: string, ...clubs: string[]): void {
  if (out && clubs.some((c) => isUserOrg(state, data, c))) out.push({ date: state.date, kind: 'transfer', playerId: p.id, text });
}

/** Moves a player for a fee: payments, capitalisation, write-off, new contract. */
export function executeTransfer(state: GameState, data: GameData, offer: Offer, out?: NewsItem[]): boolean {
  const p = state.players.find((x) => x.id === offer.playerId);
  if (!p || ownerOf(p) !== offer.sellerId) {
    offer.status = 'withdrawn';
    offer.note = 'Hráč už v klubu není.';
    return false;
  }
  const date = state.date;
  const n = data.balance.transfers.negotiation;
  const terms = offer.terms ?? personalDemand(state, data, p, offer.buyerId);
  const seller = payingClub(data, offer.sellerId);
  const buyer = payingClub(data, offer.buyerId);
  const label = `přestup: ${nameOf(p)} (${clubName(data, offer.sellerId)} → ${clubName(data, offer.buyerId)})`;
  if (offer.fee > 0 && seller !== FREE_AGENT) {
    const sellOn = p.sellOn && p.sellOn.clubId !== buyer && state.finances[p.sellOn.clubId] ? p.sellOn : undefined;
    const recipients: [string, number][] = sellOn ? [[seller, 1 - sellOn.share], [sellOn.clubId, sellOn.share]] : [[seller, 1]];
    for (const [club, share] of recipients) book(state, club, 'transfersIn', Math.round(offer.fee * share), date, sellOn && club === sellOn.clubId ? `podíl z dalšího prodeje: ${nameOf(p)}` : label);
    scheduleFee(state, data, offer.fee, offer.installments, buyer, recipients, date, label);
  }
  if (p.loan) delete p.loan;
  writeOffRegistration(state, data, p, date, `odpis zůstatku smlouvy: ${nameOf(p)}`);
  // New contract and the capitalised cost (fee + agent + signing bonus).
  const fromLevel = levelOf(state, data, offer.sellerId === FREE_AGENT ? offer.buyerId : offer.sellerId);
  const factor = data.balance.transfers.leagueValueFactor;
  p.valueLeague = { from: offer.sellerId === FREE_AGENT ? factor[`${levelOf(state, data, offer.buyerId)}`] : factor[`${fromLevel}`], to: factor[`${levelOf(state, data, offer.buyerId)}`], since: date };
  p.clubId = offer.buyerId;
  p.academy = false;
  delete p.listed;
  delete p.freeSince;
  delete p.lowerLeagueOnly;
  p.contract = { wage: terms.wage, until: contractUntil(state, terms.years) };
  p.sellOn = offer.sellOnShare > 0 && seller !== FREE_AGENT ? { clubId: seller, share: offer.sellOnShare } : undefined;
  if (!p.sellOn) delete p.sellOn;
  const agent = Math.round(offer.fee * n.agentShare);
  const upfront = agent + terms.signingBonus;
  if (upfront > 0) book(state, buyer, 'transfersOut', -upfront, date, `provize agenta a podpisový bonus: ${nameOf(p)}`);
  capitalise(state, data, p, offer.fee + upfront, buyer);
  if (seller !== FREE_AGENT && isUserOrg(state, data, offer.sellerId)) dropFromUserLineup(state, p.id);
  offer.status = 'done';
  state.market.windowBuys[buyer] = (state.market.windowBuys[buyer] ?? 0) + 1;
  invalidateRuntime(state);
  const feeText = offer.fee > 0 ? ` za ${Math.round(offer.fee / 1000).toLocaleString('cs-CZ')} tis. Kč` : ' jako volný hráč';
  news(state, data, out, p, `${nameOf(p)} přestupuje z ${clubName(data, offer.sellerId)} do ${clubName(data, offer.buyerId)}${feeText}.`, offer.sellerId, offer.buyerId);
  return true;
}

/** Loan until the end of the season (design, section 8). */
export function executeLoan(state: GameState, data: GameData, offer: Offer, out?: NewsItem[]): boolean {
  const p = state.players.find((x) => x.id === offer.playerId);
  if (!p || p.clubId !== offer.sellerId || p.loan || !offer.loan) {
    offer.status = 'withdrawn';
    return false;
  }
  const lender = payingClub(data, offer.sellerId);
  const borrower = payingClub(data, offer.buyerId);
  if (offer.fee > 0) {
    book(state, borrower, 'loanFees', -offer.fee, state.date, `hostování: ${nameOf(p)}`);
    book(state, lender, 'loanIncome', offer.fee, state.date, `hostování: ${nameOf(p)}`);
  }
  p.loan = { fromClubId: offer.sellerId, until: offer.loan.until, wageShare: offer.loan.wageShare, ...(offer.loan.optionFee ? { optionFee: offer.loan.optionFee } : {}) };
  p.clubId = offer.buyerId;
  p.academy = false;
  delete p.listed;
  if (isUserOrg(state, data, offer.sellerId)) dropFromUserLineup(state, p.id);
  offer.status = 'done';
  invalidateRuntime(state);
  news(state, data, out, p, `${nameOf(p)} odchází na hostování z ${clubName(data, offer.sellerId)} do ${clubName(data, offer.buyerId)}.`, offer.sellerId, offer.buyerId);
  return true;
}

/** Loans that ended return to the lending club. */
export function endLoans(state: GameState, data: GameData, date: string, out?: NewsItem[]): void {
  let changed = false;
  for (const p of state.players) {
    if (!p.loan || p.loan.until >= date) continue;
    const from = p.loan.fromClubId;
    if (isUserOrg(state, data, p.clubId)) dropFromUserLineup(state, p.id);
    news(state, data, out, p, `${nameOf(p)} se vrací z hostování v ${clubName(data, p.clubId)}.`, from, p.clubId);
    p.clubId = from;
    delete p.loan;
    changed = true;
  }
  if (changed) invalidateRuntime(state);
}

/** Releases a player to the free-agent pool (the club pays severance if asked). */
export function releasePlayer(state: GameState, data: GameData, p: Player, opts: { severance: boolean; out?: NewsItem[] }): number {
  const owner = payingClub(data, ownerOf(p));
  let severance = 0;
  if (opts.severance && p.contract) {
    severance = roundTo(p.contract.wage * monthsLeft(p, state.date) * data.balance.transfers.release.severanceShare, 1000);
    book(state, owner, 'severance', -severance, state.date, `odstupné: ${nameOf(p)}`);
  }
  writeOffRegistration(state, data, p, state.date, `odpis smlouvy po propuštění: ${nameOf(p)}`);
  if (isUserOrg(state, data, p.clubId) || isUserOrg(state, data, owner)) dropFromUserLineup(state, p.id);
  toFreeAgent(p, state.date);
  invalidateRuntime(state);
  return severance;
}

export function toFreeAgent(p: Player, date: string): void {
  p.clubId = FREE_AGENT;
  p.academy = false;
  p.freeSince = date;
  delete p.contract;
  delete p.listed;
  delete p.loan;
  delete p.registration;
  delete p.sellOn;
}

// ---------------------------------------------------------------- offers (manager's club buying)

function newOfferId(market: MarketState): string {
  return `O${market.nextId++}`;
}

export interface OfferInput {
  playerId: string;
  kind: 'transfer' | 'loan';
  fee: number;
  installments?: number;
  sellOnShare?: number;
  wageShare?: number;
}

export interface OfferResult {
  offer: Offer | null;
  message: string;
}

/** The manager bids for a player (design, section 8: up to three rounds of counter-offers). */
export function makeOffer(state: GameState, data: GameData, input: OfferInput): OfferResult {
  const t = data.balance.transfers;
  const buyer = state.userClubId;
  const p = state.players.find((x) => x.id === input.playerId);
  if (!buyer || !p) return { offer: null, message: 'Hráč neexistuje.' };
  if (isUserOrg(state, data, p.clubId)) return { offer: null, message: 'Tohle je hráč tvého klubu.' };
  if (p.clubId === FREE_AGENT) return { offer: null, message: 'Volného hráče podepiš přímo, bez odstupného.' };
  if (p.academy) return { offer: null, message: 'Hráči akademií jiných klubů nejsou na prodej.' };
  if (p.loan) return { offer: null, message: 'Hráč je na hostování, jeho klub ho teď neprodá.' };
  const installments = clamp(Math.round(input.installments ?? 1), 1, 3);
  const sellOnShare = clamp(input.sellOnShare ?? 0, 0, 0.3);
  const fee = Math.max(0, Math.round(input.fee));
  let offer = state.market.offers.find((o) => o.playerId === p.id && o.buyerId === buyer && (o.status === 'open' || o.status === 'countered'));
  if (!offer) {
    offer = {
      id: newOfferId(state.market),
      kind: input.kind,
      playerId: p.id,
      sellerId: p.clubId,
      buyerId: buyer,
      fee,
      installments,
      sellOnShare,
      status: 'open',
      rounds: 0,
      initiatedBy: 'user',
      createdAt: state.date,
      expiresAt: addDays(state.date, t.negotiation.deadlineDays),
    };
    state.market.offers.push(offer);
  }
  Object.assign(offer, { kind: input.kind, fee, installments, sellOnShare });
  offer.rounds++;
  if (input.kind === 'loan') {
    const share = clamp(input.wageShare ?? t.loans.defaultWageShare, 0, 1);
    const young = exactAge(p.birthDate, state.date) <= t.ai.loanYoungUntil;
    const willing = p.listed?.kind === 'loan' || (young && importance(state, data, p) !== t.negotiation.importanceStarter);
    const annualWage = (p.contract?.wage ?? 0) * 12;
    offer.loan = { wageShare: share, until: `${state.seasonYear + 1}-06-30` };
    if (!willing) return refuse(offer, 'Klub hráče na hostování nepustí.');
    if (share + (annualWage > 0 ? fee / annualWage : 1) < t.loans.defaultWageShare) return counter(offer, t, Math.ceil(((t.loans.defaultWageShare - share) * annualWage) / 10000) * 10000, 'Klub chce, abys platil větší část platu, nebo poplatek.');
    if (young) offer.loan.optionFee = roundTo(marketValue(state, data, p) * t.loans.optionFactor, t.value.round);
    offer.status = 'agreed';
    return { offer, message: 'Klub souhlasí s hostováním. Zbývá dohoda s hráčem.' };
  }
  const ask = askingPrice(state, data, p, buyer);
  const eff = effectiveFee(fee, installments, sellOnShare, data);
  if (eff >= ask) {
    offer.status = 'agreed';
    return { offer, message: 'Klub nabídku přijal. Zbývá dohoda s hráčem o osobních podmínkách.' };
  }
  if (eff < ask * 0.6) return refuse(offer, 'Klub nabídku odmítl jako nevážnou.');
  if (offer.rounds >= t.negotiation.maxRounds) return refuse(offer, 'Klub další jednání odmítl.');
  const counterFee = roundTo((ask * (1 + t.negotiation.installmentPremium * (installments - 1))) / (1 + 0.5 * sellOnShare), t.value.round) + t.value.round;
  return counter(offer, t, counterFee, `Klub chce ${Math.round(counterFee / 1000).toLocaleString('cs-CZ')} tis. Kč.`);
}

function refuse(offer: Offer, message: string): OfferResult {
  offer.status = 'rejected';
  offer.note = message;
  return { offer, message };
}

function counter(offer: Offer, t: GameData['balance']['transfers'], fee: number, message: string): OfferResult {
  offer.status = 'countered';
  offer.counterFee = fee;
  offer.note = message;
  void t;
  return { offer, message };
}

/** Accepts the seller's counter-offer. */
export function acceptCounter(state: GameState, offerId: string): OfferResult {
  const offer = state.market.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'countered' || offer.counterFee === undefined) return { offer: null, message: 'Protinabídka už neplatí.' };
  offer.fee = offer.counterFee;
  offer.status = 'agreed';
  return { offer, message: 'Dohoda s klubem. Zbývají osobní podmínky.' };
}

/** Personal terms with the player; then the move happens now (window) or when the next window opens. */
export function agreeTerms(state: GameState, data: GameData, offerId: string, wage: number, years: number, out?: NewsItem[]): OfferResult {
  const offer = state.market.offers.find((o) => o.id === offerId);
  const p = offer && state.players.find((x) => x.id === offer.playerId);
  if (!offer || !p || offer.status !== 'agreed') return { offer: null, message: 'Dohoda s klubem neplatí.' };
  const demand = personalDemand(state, data, p, offer.buyerId);
  const t = data.balance.transfers.personal;
  if (offer.kind === 'transfer' && wage < demand.wage * t.acceptMargin) return { offer, message: `Hráč chce aspoň ${Math.round(demand.wage / 1000).toLocaleString('cs-CZ')} tis. Kč měsíčně.` };
  const cost = offer.kind === 'transfer' ? offer.fee / offer.installments + offer.fee * data.balance.transfers.negotiation.agentShare + demand.signingBonus : offer.fee;
  const f = state.finances[payingClub(data, offer.buyerId)];
  if (f && f.cash < cost) return { offer, message: `Na účtu chybí peníze: první platba je ${Math.round(cost / 1000).toLocaleString('cs-CZ')} tis. Kč.` };
  offer.terms = { wage: offer.kind === 'loan' ? (p.contract?.wage ?? wage) : Math.round(wage), years: clamp(Math.round(years), t.years[0], t.years[1]), signingBonus: offer.kind === 'loan' ? 0 : demand.signingBonus };
  if (!windowOn(state.date, data)) {
    offer.status = 'pending';
    return { offer, message: `Dohodnuto. ${p.lastName} přijde, až se otevře přestupní okno (${windowStart(state.date, data)}).` };
  }
  const ok = offer.kind === 'loan' ? executeLoan(state, data, offer, out) : executeTransfer(state, data, offer, out);
  return { offer, message: ok ? `${nameOf(p)} je náš!` : (offer.note ?? 'Přestup se nepodařil.') };
}

/** The manager buys a borrowed player for the agreed option fee (contract stays as it is). */
export function exerciseOption(state: GameState, data: GameData, playerId: string, out?: NewsItem[]): OfferResult {
  const p = state.players.find((x) => x.id === playerId);
  const userId = state.userClubId;
  if (!p || !userId || !p.loan?.optionFee || !isUserOrg(state, data, p.clubId)) return { offer: null, message: 'Opce neplatí.' };
  const f = state.finances[userId];
  if (f && f.cash < p.loan.optionFee) return { offer: null, message: 'Na opci nemáš peníze.' };
  const months = Math.max(12, Math.round(monthsLeft(p, state.date)));
  const offer: Offer = {
    id: newOfferId(state.market),
    kind: 'transfer',
    playerId,
    sellerId: p.loan.fromClubId,
    buyerId: p.clubId,
    fee: p.loan.optionFee,
    installments: 1,
    sellOnShare: 0,
    status: 'agreed',
    rounds: 1,
    initiatedBy: 'user',
    createdAt: state.date,
    expiresAt: state.date,
    terms: { wage: p.contract?.wage ?? 0, years: Math.max(1, Math.round(months / 12)), signingBonus: 0 },
  };
  state.market.offers.push(offer);
  const ok = executeTransfer(state, data, offer, out);
  return { offer, message: ok ? `${nameOf(p)} zůstává natrvalo.` : 'Opce se nepodařila.' };
}

export function withdrawOffer(state: GameState, offerId: string): void {
  const offer = state.market.offers.find((o) => o.id === offerId);
  if (offer && ['open', 'countered', 'agreed', 'pending'].includes(offer.status)) offer.status = 'withdrawn';
}

/** Signs a free agent (possible at any time). */
export function signFreeAgent(state: GameState, data: GameData, playerId: string, wage: number, years: number, out?: NewsItem[]): OfferResult {
  const buyer = state.userClubId;
  const p = state.players.find((x) => x.id === playerId);
  if (!buyer || !p || p.clubId !== FREE_AGENT) return { offer: null, message: 'Hráč už není volný.' };
  if (p.lowerLeagueOnly && levelOf(state, data, buyer) < 3) return { offer: null, message: 'Hráč chce kariéru dohrát v nižší soutěži.' };
  const demand = personalDemand(state, data, p, buyer);
  if (wage < demand.wage * data.balance.transfers.personal.acceptMargin) return { offer: null, message: `Hráč chce aspoň ${Math.round(demand.wage / 1000).toLocaleString('cs-CZ')} tis. Kč měsíčně.` };
  const f = state.finances[buyer];
  if (f && f.cash < demand.signingBonus) return { offer: null, message: 'Na podpisový bonus nemáš peníze.' };
  const offer: Offer = {
    id: newOfferId(state.market),
    kind: 'transfer',
    playerId,
    sellerId: FREE_AGENT,
    buyerId: buyer,
    fee: 0,
    installments: 1,
    sellOnShare: 0,
    status: 'agreed',
    rounds: 1,
    initiatedBy: 'user',
    createdAt: state.date,
    expiresAt: state.date,
    terms: { wage: Math.round(wage), years: clamp(Math.round(years), 1, 4), signingBonus: demand.signingBonus },
  };
  state.market.offers.push(offer);
  executeTransfer(state, data, offer, out);
  return { offer, message: `${nameOf(p)} podepsal smlouvu.` };
}

/** Renewal of a contract of the manager's player. */
export function renewContract(state: GameState, data: GameData, playerId: string, wage: number, years: number): { ok: boolean; message: string } {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !isUserOrg(state, data, p.clubId) || !p.contract) return { ok: false, message: 'Hráč nemá smlouvu s tvým klubem.' };
  if (!canRenew(state, data, p)) return { ok: false, message: 'Na prodloužení je brzy (jde nejdřív dva roky před koncem smlouvy).' };
  const demand = renewalDemand(state, data, p);
  if (wage < demand.wage * data.balance.transfers.personal.acceptMargin) return { ok: false, message: `${p.lastName} chce aspoň ${Math.round(demand.wage / 1000).toLocaleString('cs-CZ')} tis. Kč měsíčně.` };
  const until = contractUntil(state, clamp(Math.round(years), 1, 4));
  if (until <= p.contract.until) return { ok: false, message: 'Nová smlouva musí být delší než současná.' };
  p.contract = { wage: Math.round(wage), until };
  respread(p, state.date);
  return { ok: true, message: `${nameOf(p)} prodloužil smlouvu do ${until.slice(0, 4)}.` };
}

export function listPlayer(state: GameState, data: GameData, playerId: string, kind: 'sale' | 'loan' | null, askingPrice?: number): void {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !isUserOrg(state, data, p.clubId)) return;
  if (kind === null) delete p.listed;
  else p.listed = { kind, askingPrice: Math.max(0, Math.round(askingPrice ?? marketValue(state, data, p))) };
}

// ---------------------------------------------------------------- incoming offers (AI buying the manager's players)

/** The manager accepts, rejects or counters an AI offer. */
export function respondToOffer(state: GameState, data: GameData, offerId: string, action: 'accept' | 'reject' | 'counter', counterFee?: number, out?: NewsItem[]): OfferResult {
  const offer = state.market.offers.find((o) => o.id === offerId && o.initiatedBy === 'ai');
  if (!offer || offer.status !== 'open') return { offer: null, message: 'Nabídka už neplatí.' };
  if (action === 'reject') {
    offer.status = 'rejected';
    return { offer, message: 'Nabídku jsi odmítl.' };
  }
  if (!windowOn(state.date, data)) {
    offer.status = 'expired';
    return { offer, message: 'Přestupní okno se zavřelo.' };
  }
  if (action === 'counter') {
    const fee = Math.round(counterFee ?? 0);
    offer.rounds++;
    if (fee <= (offer.limit ?? offer.fee)) offer.fee = fee;
    else if (offer.rounds >= data.balance.transfers.negotiation.maxRounds) {
      offer.status = 'withdrawn';
      return { offer, message: `${clubName(data, offer.buyerId)} od jednání odstoupil.` };
    } else {
      offer.fee = roundTo(Math.min(offer.limit ?? offer.fee, (offer.fee + fee) / 2), data.balance.transfers.value.round);
      return { offer, message: `${clubName(data, offer.buyerId)} navýšil nabídku na ${Math.round(offer.fee / 1000).toLocaleString('cs-CZ')} tis. Kč.` };
    }
  }
  const ok = offer.kind === 'loan' ? executeLoan(state, data, offer, out) : executeTransfer(state, data, offer, out);
  return { offer, message: ok ? 'Přestup je hotový.' : 'Přestup se nepodařil.' };
}

// ---------------------------------------------------------------- AI market (weekly in a window)

function strengthOf(state: GameState, data: GameData, clubId: string): number {
  return selectionFor(clubId, squadOf(state, clubId), data).strength;
}

function targetStrength(state: GameState, data: GameData, clubId: string): number {
  const b = data.balance.strength;
  const club = clubInfo(data, clubId);
  return b.starterMeanByLevel[`${levelOf(state, data, clubId)}`] + b.sizeOffset[`${club?.size ?? 1}`];
}

/** Weakest starting slot of a club: [position, CEL at that slot]. */
function weakestSlot(state: GameState, data: GameData, clubId: string): [Position, number] | null {
  const sel = selectionFor(clubId, squadOf(state, clubId), data);
  let worst: [Position, number] | null = null;
  sel.choice.slots.forEach((pos, i) => {
    const p = sel.choice.lineup[i];
    const v = p ? celAt(p, pos, data.balance) : 0;
    if (!worst || v < worst[1]) worst = [pos, v];
  });
  return worst;
}

function budgetOf(state: GameState, data: GameData, clubId: string): number {
  const a = data.balance.transfers.ai;
  const f = state.finances[clubId];
  if (!f) return 0;
  const wages = squadOf(state, clubId).reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  return Math.max(0, Math.min(f.cash * a.spendShareOfCash, f.cash - wages * a.reserveMonths));
}

/** At the opening of a window AI clubs list surplus players and young players for loans. */
function aiListings(state: GameState, data: GameData): void {
  const a = data.balance.transfers.ai;
  for (const club of data.clubs) {
    if (isUserOrg(state, data, club.id) || !state.membership[club.id]) continue;
    const squad = squadOf(state, club.id);
    for (const p of squad) if (p.listed) delete p.listed;
    const limits = data.balance.squads.byLevel[`${levelOf(state, data, club.id)}`];
    const sorted = [...squad].sort((x, y) => overall(x, data.balance) - overall(y, data.balance) || x.id.localeCompare(y.id));
    const surplus = Math.max(0, squad.length - (limits.max - a.listSurplusOver));
    for (const p of sorted.slice(0, surplus)) p.listed = { kind: 'sale', askingPrice: marketValue(state, data, p) };
    const mean = strengthOf(state, data, club.id);
    for (const p of sorted)
      if (!p.listed && !p.loan && exactAge(p.birthDate, state.date) <= a.loanYoungUntil && overall(p, data.balance) <= mean - a.loanMinCelGap)
        p.listed = { kind: 'loan', askingPrice: 0 };
  }
}

function signFree(state: GameState, data: GameData, clubId: string, p: Player, out?: NewsItem[]): void {
  const offer: Offer = {
    id: newOfferId(state.market),
    kind: 'transfer',
    playerId: p.id,
    sellerId: FREE_AGENT,
    buyerId: clubId,
    fee: 0,
    installments: 1,
    sellOnShare: 0,
    status: 'agreed',
    rounds: 1,
    initiatedBy: 'ai',
    createdAt: state.date,
    expiresAt: state.date,
  };
  executeTransfer(state, data, offer, out);
}

/** One AI market day: listings at the window opening, purchases, free agents, offers for the manager's players. */
export function aiMarketTick(state: GameState, data: GameData, date: string, rng: Rng, out: NewsItem[]): void {
  const t = data.balance.transfers;
  const a = t.ai;
  const opening = windowStart(date, data) === date;
  if (opening) {
    state.market.windowBuys = {};
    aiListings(state, data);
  }
  expireOffers(state, date);
  // Agreements made outside the window are completed now.
  for (const o of state.market.offers.filter((x) => x.status === 'pending')) {
    if (o.kind === 'loan') executeLoan(state, data, o, out);
    else executeTransfer(state, data, o, out);
  }
  const clubs = rng.shuffle(data.clubs.filter((c) => !c.parentClubId && state.membership[c.id] && c.id !== state.userClubId).map((c) => c.id));
  const pool = () => state.players.filter((p) => p.clubId === FREE_AGENT);
  const all = state.players;
  for (const clubId of clubs) {
    const crng = rng.fork(clubId);
    const level = levelOf(state, data, clubId);
    const limits = data.balance.squads.byLevel[`${level}`];
    if ((state.market.windowBuys[clubId] ?? 0) >= a.buysPerWindow) continue;
    // Clubs at their target strength do not need to buy.
    if (strengthOf(state, data, clubId) >= targetStrength(state, data, clubId) - a.buyBelowTargetBy) continue;
    const slot = weakestSlot(state, data, clubId);
    if (!slot) continue;
    const [pos, worst] = slot;
    const budget = budgetOf(state, data, clubId);
    const wageCap = squadOf(state, clubId).reduce((m, p) => Math.max(m, p.contract?.wage ?? 0), 0) * 1.2;
    // Candidates: a random sample of players of other clubs plus the free agents.
    const sample: Player[] = [];
    for (let i = 0; i < a.candidateSample && all.length > 0; i++) sample.push(all[crng.int(0, all.length - 1)] as Player);
    const candidates = [...new Set([...sample, ...pool()])].filter(
      (p) =>
        !p.academy &&
        !p.loan &&
        p.clubId !== clubId &&
        payingClub(data, p.clubId) !== clubId &&
        !isUserOrg(state, data, p.clubId) &&
        (p.clubId === FREE_AGENT || squadOf(state, p.clubId).length > data.balance.squads.byLevel[`${levelOf(state, data, p.clubId)}`].min) &&
        p.positions.includes(pos) &&
        (!p.lowerLeagueOnly || level === 3) &&
        celAt(p, pos, data.balance) >= worst + a.upgradeMargin,
    );
    let best: { p: Player; price: number; score: number } | null = null;
    for (const p of candidates) {
      const price = p.clubId === FREE_AGENT ? 0 : askingPrice(state, data, p, clubId);
      if (price > budget) continue;
      if (personalDemand(state, data, p, clubId).wage > wageCap) continue;
      // Older players are worth less to a club planning ahead.
      const score = celAt(p, pos, data.balance) - Math.max(0, exactAge(p.birthDate, date) - 30) - price / Math.max(1, budget + 1);
      if (!best || score > best.score) best = { p, price, score };
    }
    if (best) {
      if (best.p.clubId === FREE_AGENT) signFree(state, data, clubId, best.p, out);
      else {
        const offer: Offer = {
          id: newOfferId(state.market),
          kind: 'transfer',
          playerId: best.p.id,
          sellerId: best.p.clubId,
          buyerId: clubId,
          fee: best.price,
          installments: 1,
          sellOnShare: 0,
          status: 'agreed',
          rounds: 1,
          initiatedBy: 'ai',
          createdAt: date,
          expiresAt: date,
        };
        executeTransfer(state, data, offer, out);
      }
      continue;
    }
    // Far below the target strength and nothing affordable: a free player from abroad
    // (stand-in for markets outside the game, keeps the competitions at their level).
    const fa = data.balance.squads.freeAgents;
    if (strengthOf(state, data, clubId) < targetStrength(state, data, clubId) - fa.anchorGap && squadOf(state, clubId).length < limits.max + 2) {
      const p = generateFreeAgent(state, data, targetStrength(state, data, clubId), pos, crng, 'S');
      signFree(state, data, clubId, p, out);
    }
  }
  // Squads within limits: the weakest surplus player leaves, a club short of players signs a free agent.
  for (const club of data.clubs) {
    if (!state.membership[club.id] || isUserOrg(state, data, club.id)) continue;
    const limits = data.balance.squads.byLevel[`${levelOf(state, data, club.id)}`];
    const squad = squadOf(state, club.id);
    if (squad.length > limits.max) {
      const gks = squad.filter((p) => p.positions[0] === 'GK').length;
      const surplus = squad
        .filter((p) => !p.loan && (p.positions[0] !== 'GK' || gks > data.balance.squads.minGoalkeepers))
        .sort((x, y) => overall(x, data.balance) - overall(y, data.balance) || x.id.localeCompare(y.id))
        .slice(0, squad.length - limits.max);
      for (const p of surplus) releasePlayer(state, data, p, { severance: true });
    }
    for (let guard = 0; squadOf(state, club.id).length < limits.min && guard < 6; guard++) {
      const strength = strengthOf(state, data, club.id);
      const free = state.players
        .filter((p) => p.clubId === FREE_AGENT && (!p.lowerLeagueOnly || levelOf(state, data, club.id) === 3) && overall(p, data.balance) <= strength + 4)
        .sort((x, y) => overall(y, data.balance) - overall(x, data.balance) || x.id.localeCompare(y.id))[0];
      if (!free) break;
      signFree(state, data, club.id, free, out);
    }
  }
  aiOffersForUser(state, data, date, rng.fork('user'), out);
}

/** AI clubs bid for the manager's players (listed ones much more often). */
function aiOffersForUser(state: GameState, data: GameData, date: string, rng: Rng, out: NewsItem[]): void {
  const userId = state.userClubId;
  if (!userId) return;
  const t = data.balance.transfers;
  const userLevel = levelOf(state, data, userId);
  const open = new Set(state.market.offers.filter((o) => o.initiatedBy === 'ai' && o.status === 'open').map((o) => o.playerId));
  const buyers = data.clubs.filter((c) => !c.parentClubId && state.membership[c.id] && c.id !== userId);
  for (const p of state.players) {
    if (!isUserOrg(state, data, p.clubId) || p.academy || p.loan || open.has(p.id) || !p.contract) continue;
    const prng = rng.fork(p.id);
    const chance = p.listed ? t.ai.offersForUserChance : t.ai.offersForUserChance * 0.08;
    if (!prng.chance(chance)) continue;
    const cel = overall(p, data.balance);
    const loan = p.listed?.kind === 'loan';
    // Interested clubs: the player would be at least a rotation player there and they can pay.
    const value = marketValue(state, data, p);
    const fits = buyers.filter((c) => {
      const lvl = levelOf(state, data, c.id);
      if (loan ? lvl < userLevel : lvl > userLevel + 1) return false;
      const s = strengthOf(state, data, c.id);
      return cel >= s - 4 && cel <= s + 8 && (loan || budgetOf(state, data, c.id) >= value * 0.9);
    });
    if (fits.length === 0) continue;
    const buyer = prng.pick(fits).id;
    const base = p.listed?.kind === 'sale' ? Math.min(value, p.listed.askingPrice) : value;
    const fee = loan ? 0 : roundTo(base * prng.float(0.85, 1.05), t.value.round);
    state.market.offers.push({
      id: newOfferId(state.market),
      kind: loan ? 'loan' : 'transfer',
      playerId: p.id,
      sellerId: p.clubId,
      buyerId: buyer,
      fee,
      installments: 1,
      sellOnShare: 0,
      ...(loan ? { loan: { wageShare: t.loans.defaultWageShare, until: `${state.seasonYear + 1}-06-30` } } : {}),
      status: 'open',
      rounds: 0,
      initiatedBy: 'ai',
      createdAt: date,
      expiresAt: addDays(date, t.negotiation.deadlineDays),
      limit: loan ? 0 : roundTo(Math.max(fee, value * prng.float(1.05, 1.3)), t.value.round),
    });
    out.push({ date, kind: 'transfer', playerId: p.id, text: `${clubName(data, buyer)} má zájem o ${p.firstName} ${p.lastName}${loan ? ' (hostování)' : `, nabízí ${Math.round(fee / 1000).toLocaleString('cs-CZ')} tis. Kč`}.` });
  }
}

export function expireOffers(state: GameState, date: string): void {
  for (const o of state.market.offers) if ((o.status === 'open' || o.status === 'countered') && o.expiresAt < date) o.status = 'expired';
  // Keep the history short.
  const closed = state.market.offers.filter((o) => !['open', 'countered', 'agreed', 'pending'].includes(o.status));
  if (closed.length > 120) {
    const drop = new Set(closed.slice(0, closed.length - 120).map((o) => o.id));
    state.market.offers = state.market.offers.filter((o) => !drop.has(o.id));
  }
}

// ---------------------------------------------------------------- free agents

/** A new free agent (from outside the simulated competitions). */
export function generateFreeAgent(state: GameState, data: GameData, targetMean: number, main: Position, rng: Rng, role: 'S' | 'R' = 'R'): Player {
  const newId = idAllocator(state);
  const g = generatePlayer({ clubId: FREE_AGENT, main, role, targetMean, reserve: false }, newId(), state.seasonYear, data, rng);
  const { role: _r, ...rest } = g;
  void _r;
  const fa = data.balance.transfers.freeAgents;
  // Keep the age inside the pool range.
  const age = exactAge(rest.birthDate, state.date);
  if (age < fa.poolAge[0] || age > fa.poolAge[1]) {
    const years = rng.int(fa.poolAge[0], fa.poolAge[1]);
    rest.birthDate = `${Number(state.date.slice(0, 4)) - years}${rest.birthDate.slice(4)}`;
  }
  const p: Player = { ...rest, state: { ...rest.state, seniorMonths: 60 }, career: [], celHistory: [overall(rest, data.balance)], freeSince: state.date };
  // A contract is needed for the value; free agents get it when they sign.
  delete p.contract;
  state.players.push(p);
  invalidateRuntime(state);
  return p;
}

const POOL_POSITIONS: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST'];

/** Monthly: fitness of long-time free agents drops, the oldest retire, the pool is refilled. */
export function freeAgentTick(state: GameState, data: GameData, date: string, rng: Rng, maxNew = data.balance.transfers.freeAgents.poolMaxNewPerMonth): void {
  const fa = data.balance.transfers.freeAgents;
  const certain = data.balance.retirement.freeAgentCertain;
  const retire = new Set<string>();
  let pool = 0;
  for (const p of state.players) {
    if (p.clubId !== FREE_AGENT) continue;
    const months = p.freeSince ? daysBetween(p.freeSince, date) / 30.4 : 0;
    const age = exactAge(p.birthDate, date);
    if (months >= fa.maxMonths || (age >= certain.minAge && months >= certain.monthsWithoutOffer)) {
      retire.add(p.id);
      continue;
    }
    if (months >= fa.fsDropAfterMonths) for (const a of PHYSICAL) p.attributes[a] = Math.max(1, p.attributes[a] - fa.fsDropPerMonth);
    pool++;
  }
  if (retire.size > 0) state.players = state.players.filter((p) => !retire.has(p.id));
  // Pool too big (many releases): the weakest leave football.
  const free = state.players.filter((p) => p.clubId === FREE_AGENT);
  if (free.length > fa.poolTarget * 1.25) {
    const drop = new Set(
      [...free]
        .sort((x, y) => overall(x, data.balance) - overall(y, data.balance) || x.id.localeCompare(y.id))
        .slice(0, free.length - fa.poolTarget)
        .map((p) => p.id),
    );
    state.players = state.players.filter((p) => !drop.has(p.id));
    pool = fa.poolTarget;
  }
  const missing = pool < fa.poolTarget * fa.poolRefillBelow || maxNew >= fa.poolTarget ? Math.min(maxNew, fa.poolTarget - pool) : 0;
  const levels = Object.entries(fa.poolLevelMix) as [`${Level}`, number][];
  for (let i = 0; i < missing; i++) {
    const r = rng.fork(`pool:${i}`);
    const level = r.weightedPick(
      levels.map(([l]) => l),
      levels.map(([, w]) => w),
    );
    const mean = data.balance.strength.starterMeanByLevel[level] + fa.poolMeanOffset;
    generateFreeAgent(state, data, mean, r.pick(POOL_POSITIONS), r);
  }
  invalidateRuntime(state);
}

// ---------------------------------------------------------------- contracts at the end of a season

/**
 * Contracts that end on 30 June (design, section 8): AI clubs keep the players they need and
 * let the others go; the manager's players without a renewal leave as free agents.
 */
export function expireContracts(state: GameState, data: GameData, newStart: string, out: NewsItem[]): void {
  const r = data.balance.transfers.renewal;
  const kv = data.balance.squads.keepValue;
  // Same order as squad management: quality, part of the potential, minus age.
  const keepValue = (p: Player) => {
    const cel = overall(p, data.balance);
    return cel + kv.youthWeight * Math.max(0, p.pot - cel) - kv.agePenalty * Math.max(0, exactAge(p.birthDate, newStart) - 30);
  };
  const rank = new Map<string, number>();
  for (const club of data.clubs) {
    const squad = squadOf(state, club.id);
    [...squad].sort((a, b) => keepValue(b) - keepValue(a) || a.id.localeCompare(b.id)).forEach((p, i) => rank.set(p.id, i));
  }
  // The manager's squad must not fall apart: the assistant renews the best expiring players for
  // a year when too few would be left (the manager is warned all season on the Home screen).
  for (const userId of data.clubs.filter((c) => state.membership[c.id] && isUserOrg(state, data, c.id)).map((c) => c.id)) {
    const expiring = squadOf(state, userId).filter((p) => p.contract && p.contract.until < newStart && !p.loan);
    const min = data.balance.squads.byLevel[`${levelOf(state, data, userId)}`].min;
    const missing = min - (squadOf(state, userId).length - expiring.length);
    for (const p of [...expiring].sort((a, b) => overall(b, data.balance) - overall(a, data.balance) || a.id.localeCompare(b.id)).slice(0, Math.max(0, missing))) {
      p.contract = { wage: renewalDemand(state, data, p).wage, until: contractUntil(state, 1) };
      respread(p, newStart);
      out.push({ date: newStart, kind: 'contract', playerId: p.id, text: `Asistent prodloužil smlouvu ${nameOf(p)} o rok, aby měl tým dost hráčů.` });
    }
  }
  for (const p of [...state.players]) {
    if (!p.contract || p.contract.until >= newStart || p.clubId === FREE_AGENT) continue;
    if (p.academy) {
      delete p.contract;
      continue;
    }
    const user = isUserOrg(state, data, p.clubId);
    const age = exactAge(p.birthDate, newStart);
    const keep = !user && (rank.get(p.id) ?? 99) < r.aiKeepTop && age < 33;
    if (keep) {
      delete p.contract; // ensureContracts gives a new one
      continue;
    }
    if (user) out.push({ date: newStart, kind: 'contract', playerId: p.id, text: `${nameOf(p)} odchází: smlouva skončila a nebyla prodloužena.` });
    writeOffRegistration(state, data, p, newStart, `konec smlouvy: ${nameOf(p)}`);
    if (user) dropFromUserLineup(state, p.id);
    toFreeAgent(p, newStart);
  }
  invalidateRuntime(state);
}

/** Players whose contracts end this season (for the manager's attention). */
export function expiringContracts(state: GameState, data: GameData): Player[] {
  const end = `${state.seasonYear + 1}-06-30`;
  return state.players.filter((p) => isUserOrg(state, data, p.clubId) && !p.academy && !p.loan && p.contract && p.contract.until <= end);
}

/** Deterministic hash in [0, 1) for stable estimates. */
export const unit = (key: string) => (hashString(key) % 100000) / 100000;
