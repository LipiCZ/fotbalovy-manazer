// Club economy (design, section 13). Every club has finances (AI clubs need them for transfers);
// the manager's club also keeps every transaction. Statements are aggregated from the season
// totals by category. Amounts are in CZK; all scales are game estimates (design, section 1).

import type { Balance, GameData } from '../data.ts';
import { overall } from '../players/rating.ts';
import type { Rng } from '../rng.ts';
import type { ClubSize, CompetitionId, Contract, Level, Player } from '../types.ts';
import { addDays, daysBetween, parseDate, seasonDate } from './calendar.ts';
import { levelOfCompetition } from './pyramid.ts';
import type { GameState } from './state.ts';

export type TxType =
  | 'tickets'
  | 'merch'
  | 'vip'
  | 'sponsors'
  | 'central'
  | 'prize'
  | 'transfersIn'
  | 'otherIncome'
  | 'wages'
  | 'bonuses'
  | 'staff'
  | 'stadium'
  | 'matchday'
  | 'academy'
  | 'amortization'
  | 'depreciation'
  | 'interest'
  | 'otherCost'
  | 'ownerDeposit'
  | 'loan'
  | 'loanRepayment'
  | 'transfersOut'
  | 'investment';

export type TxKind = 'revenue' | 'cost' | 'financing' | 'investing';

export const TX: Record<TxType, { kind: TxKind; label: string; cash: boolean }> = {
  tickets: { kind: 'revenue', label: 'Vstupné a permanentky', cash: true },
  merch: { kind: 'revenue', label: 'Fanshop a občerstvení', cash: true },
  vip: { kind: 'revenue', label: 'VIP a skyboxy', cash: true },
  sponsors: { kind: 'revenue', label: 'Sponzoři', cash: true },
  central: { kind: 'revenue', label: 'Centrální příjmy soutěže', cash: true },
  prize: { kind: 'revenue', label: 'Odměny za umístění a pohár', cash: true },
  transfersIn: { kind: 'revenue', label: 'Prodej a hostování hráčů', cash: true },
  otherIncome: { kind: 'revenue', label: 'Ostatní výnosy', cash: true },
  wages: { kind: 'cost', label: 'Platy hráčů', cash: true },
  bonuses: { kind: 'cost', label: 'Prémie', cash: true },
  staff: { kind: 'cost', label: 'Realizační tým a správa', cash: true },
  stadium: { kind: 'cost', label: 'Provoz stadionu', cash: true },
  matchday: { kind: 'cost', label: 'Pořadatelství zápasů', cash: true },
  academy: { kind: 'cost', label: 'Akademie a B-tým', cash: true },
  amortization: { kind: 'cost', label: 'Náklady na hráčské smlouvy', cash: false },
  depreciation: { kind: 'cost', label: 'Odpisy stadionu', cash: false },
  interest: { kind: 'cost', label: 'Úroky', cash: true },
  otherCost: { kind: 'cost', label: 'Ostatní náklady', cash: true },
  ownerDeposit: { kind: 'financing', label: 'Vklad majitele', cash: true },
  loan: { kind: 'financing', label: 'Přijatý úvěr', cash: true },
  loanRepayment: { kind: 'financing', label: 'Splátka úvěru', cash: true },
  transfersOut: { kind: 'investing', label: 'Nákup hráčů', cash: true },
  investment: { kind: 'investing', label: 'Investice do stadionu', cash: true },
};

export interface Transaction {
  date: string;
  type: TxType;
  /** Positive = money in (or revenue), negative = money out (or cost). */
  amount: number;
  note: string;
}

export interface ClubFinance {
  cash: number;
  loans: number;
  stadiumValue: number;
  /** Unamortised player registrations (phase 6). */
  registrations: number;
  /** Expected yearly revenue at the start of the season (budget scale). */
  expectedRevenue: number;
  capacity: number;
  ticketPrice: number;
  /** Ticket price may be changed until the first home league match (design, section 14: once a season). */
  ticketPriceLocked: boolean;
  /** Season totals by category (revenues and inflows positive, costs negative). */
  season: Partial<Record<TxType, number>>;
  /** Cash at the start of every month this season [date, cash]. */
  monthlyCash: [string, number][];
  /** Points deducted in the current season (licence, design section 13). */
  pointDeduction: number;
  /** Deduction to apply next season. */
  pendingDeduction: number;
}

export interface Budget {
  wageCap: number;
  transfer: number;
  investment: number;
}

const round = (v: number, step = 1000) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function levelOf(state: GameState, data: GameData, clubId: string): Level {
  const comp = state.membership[clubId];
  return comp ? levelOfCompetition(data, comp) : 3;
}

function clubSize(data: GameData, clubId: string): ClubSize {
  return data.clubs.find((c) => c.id === clubId)?.size ?? 1;
}

function isReserve(data: GameData, clubId: string): boolean {
  return data.clubs.some((c) => c.id === clubId && c.parentClubId);
}

function homeMatches(state: GameState, data: GameData, clubId: string): number {
  const comp = state.membership[clubId];
  const n = comp ? Object.values(state.membership).filter((c) => c === comp).length : 16;
  void data;
  return n - 1;
}

/** Average attendance at the reference price, before form and capacity. */
export function baseAttendance(level: Level, size: ClubSize, reserve: boolean, balance: Balance): number {
  const a = balance.economy.attendance;
  const base = a.baseByLevelAndSize[`${level}`][`${size}`];
  return reserve ? base * a.reserveTeamFactor : base;
}

/** Expected yearly revenue of a club (scale of its budget). */
export function expectedRevenue(state: GameState, data: GameData, clubId: string): number {
  const e = data.balance.economy;
  const level = levelOf(state, data, clubId);
  const size = clubSize(data, clubId);
  const reserve = isReserve(data, clubId);
  const home = homeMatches(state, data, clubId);
  const att = Math.min(baseAttendance(level, size, reserve, data.balance), capacityOf(level, size, reserve, data.balance));
  const price = e.ticketPrice.reference[`${level}`];
  const ticket = att * price * (1 - e.attendance.seasonTicketShare * e.attendance.seasonTicketDiscount) * home;
  const merch = att * e.matchday.merchPerFan[`${level}`] * home;
  const vip = (reserve ? 0 : e.matchday.vipPerMatchBySize[`${level}`][`${size}`]) * home;
  const sponsors = reserve ? e.sponsors.reserveTeam : e.sponsors.byLevelAndSize[`${level}`][`${size}`];
  const central = e.central.byLevel[`${level}`];
  const [top, bottom] = e.prizeMoney.league[`${level}`];
  return round(ticket + merch + vip + sponsors + central + (top + bottom) / 2);
}

export function capacityOf(level: Level, size: ClubSize, reserve: boolean, balance: Balance): number {
  const a = balance.economy.attendance;
  return reserve ? a.reserveCapacity : a.capacityByLevelAndSize[`${level}`][`${size}`];
}

/** Monthly wage for a player of a given level (design: wages follow quality; big clubs pay more). */
export function wageFor(player: Player, level: Level, reserve: boolean, size: ClubSize, balance: Balance): number {
  const w = balance.economy.wages;
  if (player.academy) return w.academyMonthly[`${level}`];
  const mean = balance.strength.starterMeanByLevel[`${level}`];
  const raw = w.baseMonthly[`${level}`] * w.sizeFactor[`${size}`] * (1 + w.perCelPoint) ** (overall(player, balance) - mean);
  return round(Math.max(w.minMonthly[`${level}`], raw * (reserve ? w.reserveFactor : 1)), 500);
}

/** Contract for a player without one (generated start-of-game contracts; negotiations come in phase 6). */
export function newContract(player: Player, level: Level, reserve: boolean, size: ClubSize, seasonYear: number, balance: Balance, rng: Rng): Contract {
  const c = balance.economy.contracts;
  const [lo, hi] = player.academy ? c.youthYears : c.years;
  const years = rng.int(lo, hi);
  return { wage: wageFor(player, level, reserve, size, balance), until: `${seasonYear + years}-06-30` };
}

// ---------------------------------------------------------------- bookkeeping

export function book(state: GameState, clubId: string, type: TxType, amount: number, date: string, note = ''): void {
  const f = state.finances[clubId];
  if (!f || amount === 0) return;
  f.season[type] = (f.season[type] ?? 0) + amount;
  if (TX[type].cash) f.cash += amount;
  if (clubId === state.userClubId) state.transactions.push({ date, type, amount, note });
}

/** Creates finances and contracts for all clubs (new game or migration). */
export function initFinances(state: GameState, data: GameData, rng: Rng): void {
  const e = data.balance.economy;
  for (const club of data.clubs) {
    const level = levelOf(state, data, club.id);
    const reserve = Boolean(club.parentClubId);
    const capacity = capacityOf(level, club.size, reserve, data.balance);
    const revenue = expectedRevenue(state, data, club.id);
    state.finances[club.id] = {
      cash: round(revenue * e.initialCashShare),
      loans: 0,
      stadiumValue: reserve ? 0 : capacity * e.stadium.valuePerSeat[`${level}`],
      registrations: 0,
      expectedRevenue: revenue,
      capacity,
      ticketPrice: e.ticketPrice.reference[`${level}`],
      ticketPriceLocked: false,
      season: {},
      monthlyCash: [],
      pointDeduction: 0,
      pendingDeduction: 0,
    };
  }
  ensureContracts(state, data, rng);
}

/** Every player gets a contract (also academy players promoted later). */
export function ensureContracts(state: GameState, data: GameData, rng: Rng): void {
  for (const p of state.players) {
    if (p.contract) continue;
    const level = levelOf(state, data, p.clubId);
    p.contract = newContract(p, level, isReserve(data, p.clubId), clubSize(data, payingClub(data, p.clubId)), state.seasonYear, data.balance, rng.fork(p.id));
  }
}

/** The A-team pays for its B-team and academy players (one organisation). */
export function payingClub(data: GameData, clubId: string): string {
  return data.clubs.find((c) => c.id === clubId)?.parentClubId ?? clubId;
}

/** Monthly payments on the 1st of each month: wages, fixed costs, sponsors, central money, interest, depreciation. */
export function monthlyFinance(state: GameState, data: GameData, date: string): void {
  const e = data.balance.economy;
  const wageBill = new Map<string, number>();
  for (const p of state.players) {
    const payer = payingClub(data, p.clubId);
    wageBill.set(payer, (wageBill.get(payer) ?? 0) + (p.contract?.wage ?? 0));
  }
  for (const club of data.clubs) {
    const f = state.finances[club.id];
    if (!f || club.parentClubId) continue;
    const level = levelOf(state, data, club.id);
    const s = f.expectedRevenue / 12;
    f.monthlyCash.push([date, f.cash]);
    book(state, club.id, 'wages', -(wageBill.get(club.id) ?? 0), date, 'výplaty hráčů');
    book(state, club.id, 'staff', -round(s * e.fixedCosts.staff), date);
    book(state, club.id, 'stadium', -round(s * e.fixedCosts.stadium), date);
    book(state, club.id, 'academy', -round(s * e.fixedCosts.academy), date);
    book(state, club.id, 'otherCost', -round(s * e.fixedCosts.other), date);
    const sponsorBase = e.sponsors.byLevelAndSize[`${level}`][`${club.size}`];
    book(state, club.id, 'sponsors', round(sponsorBase / 12), date);
    book(state, club.id, 'central', round(e.central.byLevel[`${level}`] / 12), date);
    if (f.loans > 0) book(state, club.id, 'interest', -round((f.loans * e.loans.annualRate) / 12), date, 'úroky z úvěru');
    if (f.stadiumValue > 0) {
      const dep = round(f.stadiumValue / e.stadium.depreciationYears / 12);
      f.stadiumValue -= dep;
      book(state, club.id, 'depreciation', -dep, date);
    }
    // AI clubs: the owner keeps them afloat (they never go bankrupt).
    if (club.id !== state.userClubId && f.cash < 0) book(state, club.id, 'ownerDeposit', round(-f.cash + f.expectedRevenue * e.owner.aiTopUpTo), date, 'vklad majitele');
  }
}

export interface MatchdayResult {
  attendance: number;
  capacity: number;
}

/** Home match: attendance and its money (design, sections 9 and 14). */
export function matchdayFinance(
  state: GameState,
  data: GameData,
  homeId: string,
  date: string,
  ctx: { tablePosition: number | null; teams: number; neutral?: boolean; rng: Rng },
): MatchdayResult {
  const e = data.balance.economy;
  const f = state.finances[homeId];
  if (!f) return { attendance: 0, capacity: 0 };
  const level = levelOf(state, data, homeId);
  const size = clubSize(data, homeId);
  const reserve = isReserve(data, homeId);
  const position = ctx.tablePosition === null ? 0 : 1 - (2 * (ctx.tablePosition - 1)) / Math.max(1, ctx.teams - 1); // +1 top … −1 bottom
  const reference = e.ticketPrice.reference[`${level}`];
  const priceFactor = (reference / Math.max(1, f.ticketPrice)) ** e.attendance.priceElasticity;
  const demand =
    baseAttendance(level, size, reserve, data.balance) *
    (1 + e.attendance.positionEffect * position) *
    priceFactor *
    (1 + ctx.rng.normal(0, e.attendance.noise));
  const attendance = Math.round(clamp(demand, 0, f.capacity));
  const payer = payingClub(data, homeId);
  const ticketIncome = attendance * f.ticketPrice * (1 - e.attendance.seasonTicketShare * e.attendance.seasonTicketDiscount);
  book(state, payer, 'tickets', round(ticketIncome, 100), date, 'vstupné');
  book(state, payer, 'merch', round(attendance * e.matchday.merchPerFan[`${level}`], 100), date);
  if (!reserve) book(state, payer, 'vip', e.matchday.vipPerMatchBySize[`${level}`][`${size}`], date);
  book(state, payer, 'matchday', -round(attendance * e.matchday.costPerFan + e.matchday.fixedCost[`${level}`], 100), date, 'pořadatelství');
  if (homeId === state.userClubId && level !== null) f.ticketPriceLocked = true;
  return { attendance, capacity: f.capacity };
}

/** Win/draw bonus for the squad (share of the monthly wage bill). */
export function matchBonus(state: GameState, data: GameData, clubId: string, outcome: 'W' | 'D' | 'L', date: string): void {
  if (outcome === 'L') return;
  const payer = payingClub(data, clubId);
  const monthly = state.players.filter((p) => p.clubId === clubId && !p.academy).reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
  const bonus = round(monthly * data.balance.economy.wages.winBonusShare * (outcome === 'W' ? 1 : 0.5), 100);
  book(state, payer, 'bonuses', -bonus, date, outcome === 'W' ? 'prémie za výhru' : 'prémie za remízu');
}

/** League prize money by final position. */
export function leaguePrize(level: Level, position: number, teams: number, balance: Balance): number {
  const [top, bottom] = balance.economy.prizeMoney.league[`${level}`];
  return round(top - ((top - bottom) * (position - 1)) / Math.max(1, teams - 1));
}

// ---------------------------------------------------------------- user actions

export function maxLoan(f: ClubFinance, balance: Balance): number {
  return Math.max(0, round(f.expectedRevenue * balance.economy.loans.maxShare - f.loans, 100_000));
}

export function takeLoan(state: GameState, data: GameData, amount: number): string | null {
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!id || !f) return 'Není klub.';
  const max = maxLoan(f, data.balance);
  if (amount <= 0 || amount > max) return `Banka půjčí nejvýš ${max.toLocaleString('cs-CZ')} Kč.`;
  f.loans += amount;
  book(state, id, 'loan', amount, state.date, 'úvěr od banky');
  return null;
}

export function repayLoan(state: GameState, amount: number): string | null {
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!id || !f) return 'Není klub.';
  const pay = Math.min(amount, f.loans);
  if (pay <= 0) return 'Klub nemá úvěr.';
  if (pay > f.cash) return 'Na splátku nejsou peníze.';
  f.loans -= pay;
  book(state, id, 'loanRepayment', -pay, state.date, 'splátka úvěru');
  return null;
}

export function setTicketPrice(state: GameState, data: GameData, price: number): string | null {
  const id = state.userClubId;
  const f = id ? state.finances[id] : undefined;
  if (!id || !f) return 'Není klub.';
  if (f.ticketPriceLocked) return 'Cena vstupenek se nastavuje jednou za sezónu, před prvním domácím zápasem.';
  const ref = data.balance.economy.ticketPrice.reference[`${levelOf(state, data, id)}`];
  const p = data.balance.economy.ticketPrice;
  f.ticketPrice = Math.round(clamp(price, ref * p.minFactor, ref * p.maxFactor) / 10) * 10;
  return null;
}

// ---------------------------------------------------------------- statements

export interface Statements {
  revenues: [TxType, number][];
  costs: [TxType, number][];
  result: number;
  assets: { stadium: number; registrations: number; cash: number };
  liabilities: { loans: number; overdue: number };
  equity: number;
  financing: [TxType, number][];
}

export function statements(f: ClubFinance): Statements {
  const entries = Object.entries(f.season) as [TxType, number][];
  const revenues = entries.filter(([t]) => TX[t].kind === 'revenue');
  const costs = entries.filter(([t]) => TX[t].kind === 'cost');
  const financing = entries.filter(([t]) => TX[t].kind === 'financing' || TX[t].kind === 'investing');
  const result = [...revenues, ...costs].reduce((s, [, v]) => s + v, 0);
  const assets = { stadium: f.stadiumValue, registrations: f.registrations, cash: Math.max(0, f.cash) };
  const liabilities = { loans: f.loans, overdue: Math.max(0, -f.cash) };
  const equity = assets.stadium + assets.registrations + assets.cash - liabilities.loans - liabilities.overdue;
  return { revenues, costs, result, assets, liabilities, equity, financing };
}

/** How many months the money lasts at the average pace of the last three months (null = not running out). */
export function runwayMonths(f: ClubFinance): number | null {
  const points = f.monthlyCash.slice(-4);
  if (points.length < 2) return null;
  const first = points[0] as [string, number];
  const last = points[points.length - 1] as [string, number];
  const months = Math.max(1, daysBetween(first[0], last[0]) / 30);
  const burn = (first[1] - last[1]) / months;
  if (burn <= 0) return null;
  return Math.max(0, f.cash / burn);
}

export function wageBill(state: GameState, data: GameData, clubId: string): number {
  return 12 * state.players.filter((p) => payingClub(data, p.clubId) === clubId).reduce((s, p) => s + (p.contract?.wage ?? 0), 0);
}

export function seasonBudget(f: ClubFinance, balance: Balance): Budget {
  const b = balance.economy.budget;
  return { wageCap: round(f.expectedRevenue * b.wageCapShare, 100_000), transfer: round(f.expectedRevenue * b.transferShare, 100_000), investment: round(f.expectedRevenue * b.investmentShare, 100_000) };
}

/** Licence check (design, section 13): negative cash on the licence date costs points next season. */
export function licenceDate(seasonYear: number, balance: Balance): string {
  return seasonDate(balance.economy.license.date, seasonYear);
}

export function crossesDate(from: string, to: string, date: string): boolean {
  return from < date && date <= to;
}

export function dayBefore(date: string): string {
  return addDays(date, -1);
}

export function monthsBetween(a: string, b: string): number {
  return (parseDate(b) - parseDate(a)) / (30.44 * 86_400_000);
}

export type { CompetitionId };
