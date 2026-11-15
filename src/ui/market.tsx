// Transfer and scouting widgets shared by the profile, the Transfers and the Scouting screens.

import { useState } from 'react';
import type { GameData } from '../engine/data.ts';
import {
  acceptCounter,
  agreeTerms,
  askingPrice,
  canRenew,
  clubName,
  exerciseOption,
  isUserOrg,
  listPlayer,
  makeOffer,
  marketValue,
  monthsLeft,
  personalDemand,
  releasePlayer,
  renewalDemand,
  renewContract,
  respondToOffer,
  signFreeAgent,
  windowOn,
  withdrawOffer,
} from '../engine/game/market.ts';
import { estimateOf, setScoutTask } from '../engine/game/scouting.ts';
import type { GameState, Offer } from '../engine/game/state.ts';
import { FREE_AGENT, type Player } from '../engine/types.ts';
import { getAppStore, useGame } from '../state/store.ts';
import { money } from './format.ts';

const STATUS: Record<Offer['status'], string> = {
  open: 'čeká na odpověď',
  countered: 'protinabídka',
  agreed: 'dohoda s klubem – zbývají osobní podmínky',
  pending: 'dohodnuto, čeká na okno',
  done: 'hotovo',
  rejected: 'odmítnuto',
  withdrawn: 'staženo',
  expired: 'vypršelo',
};
export const offerStatus = (o: Offer) => STATUS[o.status];

/** "62" or "58–66" or "?" */
export function rangeLabel(r: [number, number] | undefined | null): string {
  if (!r) return '?';
  return r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}

export function EstimateCells({ game, data, p }: { game: GameState; data: GameData; p: Player }) {
  const e = estimateOf(game, data, p);
  return (
    <>
      <td className="num" title={e ? `přesnost ±${e.accuracy}` : 'neznámý hráč – pošli skauta'}>
        {rangeLabel(e?.cel)}
      </td>
      <td className="num" title={e ? `přesnost ±${e.accuracy}` : 'neznámý hráč – pošli skauta'}>
        {rangeLabel(e?.pot)}
      </td>
    </>
  );
}

/** Middle of the estimate for sorting (unknown players last). */
export function estimateMid(game: GameState, data: GameData, p: Player, key: 'cel' | 'pot'): number {
  const e = estimateOf(game, data, p);
  return e ? (e[key][0] + e[key][1]) / 2 : -1;
}

const toThousands = (v: number) => Math.round(v / 1000);

function NumberField({ label, value, onChange, step = 10, suffix = 'tis. Kč' }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="row" style={{ gap: 6 }}>
      {label}
      <input type="number" step={step} min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} style={{ width: 110 }} />
      {suffix}
    </label>
  );
}

/** Market section of the player profile. */
export function PlayerMarketPanel({ p }: { p: Player }) {
  const { game, data } = useGame();
  const own = isUserOrg(game, data, p.clubId) || (p.loan ? isUserOrg(game, data, p.loan.fromClubId) : false);
  return (
    <section className="card">
      <h3>Smlouva a přestupy</h3>
      <ContractInfo p={p} />
      {own ? <OwnPlayerActions p={p} /> : p.clubId === FREE_AGENT ? <FreeAgentActions p={p} /> : <BuyActions p={p} />}
    </section>
  );
}

function ContractInfo({ p }: { p: Player }) {
  const { game, data } = useGame();
  const value = marketValue(game, data, p);
  return (
    <div className="row wrap" style={{ gap: 24 }}>
      <span>
        Hodnota: <strong>{p.contract ? money(value) : '–'}</strong>
      </span>
      {p.contract ? (
        <span>
          Smlouva do {p.contract.until.slice(0, 4)} ({Math.round(monthsLeft(p, game.date))} měs.), plat {money(p.contract.wage)} měsíčně
        </span>
      ) : (
        <span className="muted">bez smlouvy (volný hráč{p.freeSince ? ` od ${p.freeSince}` : ''})</span>
      )}
      {p.loan && (
        <span className="warn">
          na hostování z {clubName(data, p.loan.fromClubId)} do {p.loan.until.slice(0, 4)}, hostitel platí {Math.round(p.loan.wageShare * 100)} % platu
          {p.loan.optionFee ? `, opce ${money(p.loan.optionFee)}` : ''}
        </span>
      )}
      {p.listed && <span className="warn">{p.listed.kind === 'sale' ? `na prodej (${money(p.listed.askingPrice)})` : 'k hostování'}</span>}
      {p.registration && <span className="muted">účetní hodnota smlouvy {money(p.registration.bookValue)}</span>}
      {p.sellOn && <span className="muted">{clubName(data, p.sellOn.clubId)} má {Math.round(p.sellOn.share * 100)} % z dalšího prodeje</span>}
    </div>
  );
}

function OwnPlayerActions({ p }: { p: Player }) {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const [price, setPrice] = useState(toThousands(p.listed?.askingPrice ?? marketValue(game, data, p)));
  const demand = p.contract ? renewalDemand(game, data, p) : null;
  const [wage, setWage] = useState(toThousands(demand?.wage ?? 0));
  const [years, setYears] = useState(demand?.years ?? 2);
  if (p.loan && isUserOrg(game, data, p.clubId)) {
    // Borrowed player: option to buy.
    return p.loan.optionFee ? (
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => store.market((g, d, news) => exerciseOption(g, d, p.id, news))}>
          Uplatnit opci ({money(p.loan.optionFee)})
        </button>
      </div>
    ) : (
      <p className="help">Hráč je u nás na hostování do konce sezóny.</p>
    );
  }
  if (p.loan) return <p className="help">Hráč je na hostování, vrátí se po sezóně.</p>;
  return (
    <div className="grid" style={{ marginTop: 8 }}>
      {!p.academy && (
        <div className="row wrap">
          <NumberField label="Požadovaná cena" value={price} onChange={setPrice} step={50} />
          <button onClick={() => store.market((g, d) => listPlayer(g, d, p.id, 'sale', price * 1000))}>Dát na prodej</button>
          <button onClick={() => store.market((g, d) => listPlayer(g, d, p.id, 'loan'))}>Nabídnout k hostování</button>
          {p.listed && <button onClick={() => store.market((g, d) => listPlayer(g, d, p.id, null))}>Stáhnout z trhu</button>}
        </div>
      )}
      {demand && (
        <div className="row wrap">
          {canRenew(game, data, p) ? (
            <>
              <span>
                Prodloužení: hráč chce <strong>{money(demand.wage)}</strong> měsíčně.
              </span>
              <NumberField label="Plat" value={wage} onChange={setWage} />
              <label className="row" style={{ gap: 6 }}>
                na
                <select value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="délka smlouvy">
                  {[1, 2, 3, 4].map((y) => (
                    <option key={y} value={y}>
                      {y} {y === 1 ? 'rok' : y < 5 ? 'roky' : 'let'}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" onClick={() => store.market((g, d) => { const r = renewContract(g, d, p.id, wage * 1000, years); return { ok: r.ok, message: r.message }; })}>
                Prodloužit smlouvu
              </button>
            </>
          ) : (
            <span className="muted">Prodloužit smlouvu jde nejdřív dva roky před jejím koncem.</span>
          )}
        </div>
      )}
      {p.contract && !p.academy && (
        <div className="row">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && !window.confirm(`Propustit ${p.firstName} ${p.lastName}? Klub vyplatí odstupné.`)) return;
              store.market((g, d) => `${p.lastName} propuštěn, odstupné ${money(releasePlayer(g, d, p, { severance: true }))}.`);
            }}
          >
            Propustit (odstupné {money(Math.round(((p.contract.wage * monthsLeft(p, game.date) * data.balance.transfers.release.severanceShare) / 1000)) * 1000)})
          </button>
        </div>
      )}
    </div>
  );
}

function FreeAgentActions({ p }: { p: Player }) {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const userId = game.userClubId as string;
  const demand = personalDemand(game, data, p, userId);
  const [wage, setWage] = useState(toThousands(demand.wage));
  const [years, setYears] = useState(demand.years);
  return (
    <div className="row wrap" style={{ marginTop: 8 }}>
      <span>
        Chce <strong>{money(demand.wage)}</strong> měsíčně a podpisový bonus {money(demand.signingBonus)}.
      </span>
      <NumberField label="Plat" value={wage} onChange={setWage} />
      <select value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="délka smlouvy">
        {[1, 2, 3, 4].map((y) => (
          <option key={y} value={y}>
            {y} r.
          </option>
        ))}
      </select>
      <button className="primary" onClick={() => store.market((g, d, news) => { const r = signFreeAgent(g, d, p.id, wage * 1000, years, news); return { ok: r.offer?.status === 'done', message: r.message }; })}>
        Podepsat
      </button>
      <ScoutButton p={p} />
    </div>
  );
}

function BuyActions({ p }: { p: Player }) {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const userId = game.userClubId as string;
  const offer = game.market.offers.find((o) => o.playerId === p.id && o.buyerId === userId && ['open', 'countered', 'agreed', 'pending'].includes(o.status));
  const value = marketValue(game, data, p);
  const [fee, setFee] = useState(toThousands(offer?.fee ?? value));
  const [installments, setInstallments] = useState(offer?.installments ?? 1);
  const [sellOn, setSellOn] = useState(Math.round((offer?.sellOnShare ?? 0) * 100));
  const [share, setShare] = useState(Math.round(data.balance.transfers.loans.defaultWageShare * 100));
  const demand = personalDemand(game, data, p, userId);
  const [wage, setWage] = useState(toThousands(demand.wage));
  const [years, setYears] = useState(demand.years);
  const window = windowOn(game.date, data);
  if (p.academy) return <p className="help">Hráči akademií jiných klubů nejsou na prodej.</p>;
  if (p.loan) return <p className="help">Hráč je na hostování, jeho klub ho teď neprodá.</p>;
  return (
    <div className="grid" style={{ marginTop: 8 }}>
      <p className="help">
        {window ? 'Přestupní okno je otevřené: dohodnutý přestup proběhne hned.' : 'Okno je zavřené: dohodnout se můžeš, hráč přijde při otevření dalšího okna.'}{' '}
        Splátky (až 3 roky) klub bere jako méně peněz, podíl z dalšího prodeje jako bonus.
      </p>
      {offer && (
        <p>
          Nabídka {offer.kind === 'loan' ? 'na hostování' : money(offer.fee)}: <strong>{offerStatus(offer)}</strong>
          {offer.note ? ` – ${offer.note}` : ''}
        </p>
      )}
      {(!offer || offer.status === 'open' || offer.status === 'countered') && (
        <div className="row wrap">
          <NumberField label="Odstupné" value={fee} onChange={setFee} step={50} />
          <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))} aria-label="splátky">
            <option value={1}>najednou</option>
            <option value={2}>2 splátky</option>
            <option value={3}>3 splátky</option>
          </select>
          <NumberField label="Podíl z dalšího prodeje" value={sellOn} onChange={(v) => setSellOn(Math.min(30, v))} step={5} suffix="%" />
          <button className="primary" onClick={() => store.market((g, d) => makeOffer(g, d, { playerId: p.id, kind: 'transfer', fee: fee * 1000, installments, sellOnShare: sellOn / 100 }))}>
            Nabídnout přestup
          </button>
          {offer?.status === 'countered' && <button onClick={() => store.market((g) => acceptCounter(g, offer.id))}>Přijmout protinabídku {money(offer.counterFee ?? 0)}</button>}
        </div>
      )}
      {(!offer || offer.status === 'open' || offer.status === 'countered') && (
        <div className="row wrap">
          <NumberField label="Hostování: platíme" value={share} onChange={(v) => setShare(Math.min(100, v))} step={10} suffix="% platu" />
          <button onClick={() => store.market((g, d) => makeOffer(g, d, { playerId: p.id, kind: 'loan', fee: 0, wageShare: share / 100 }))}>Požádat o hostování</button>
        </div>
      )}
      {offer?.status === 'agreed' && (
        <div className="row wrap">
          {offer.kind === 'transfer' && (
            <>
              <span>
                Hráč chce <strong>{money(demand.wage)}</strong> měsíčně, podpisový bonus {money(demand.signingBonus)}.
              </span>
              <NumberField label="Plat" value={wage} onChange={setWage} />
              <select value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="délka smlouvy">
                {[1, 2, 3, 4].map((y) => (
                  <option key={y} value={y}>
                    {y} r.
                  </option>
                ))}
              </select>
            </>
          )}
          <button className="primary" onClick={() => store.market((g, d, news) => agreeTerms(g, d, offer.id, wage * 1000, years, news))}>
            {offer.kind === 'loan' ? 'Potvrdit hostování' : 'Podepsat smlouvu'}
          </button>
        </div>
      )}
      {offer && <button onClick={() => store.market((g) => withdrawOffer(g, offer.id))}>Stáhnout nabídku</button>}
      <p className="muted">
        Orientačně: tržní hodnota {money(value)}
        {game.scouting.scouts.some((s) => s.level === 'elitní') ? `, klub by chtěl kolem ${money(askingPrice(game, data, p, userId))} (odhad elitního skauta)` : ''}.
      </p>
      <ScoutButton p={p} />
    </div>
  );
}

function ScoutButton({ p }: { p: Player }) {
  const { game } = useGame();
  const store = getAppStore().getState();
  const free = game.scouting.scouts.find((s) => s.task === null) ?? game.scouting.scouts[0];
  if (!free) return <span className="muted">Na přesnější odhad najmi skauta (obrazovka Skauting).</span>;
  return (
    <button onClick={() => store.market((g) => { setScoutTask(g, free.id, { kind: 'player', playerId: p.id }); return `Skaut ${free.name} sleduje ${p.lastName}a.`; })}>
      Poslat skauta ({free.name})
    </button>
  );
}

/** Incoming AI offer row actions. */
export function IncomingOfferActions({ offer }: { offer: Offer }) {
  const store = getAppStore().getState();
  const [fee, setFee] = useState(toThousands(offer.fee * 1.2));
  return (
    <span className="row wrap">
      <button className="primary" onClick={() => store.market((g, d, news) => respondToOffer(g, d, offer.id, 'accept', undefined, news))}>
        Přijmout
      </button>
      <button onClick={() => store.market((g, d) => respondToOffer(g, d, offer.id, 'reject'))}>Odmítnout</button>
      {offer.kind === 'transfer' && (
        <>
          <input type="number" step={50} value={fee} onChange={(e) => setFee(Number(e.target.value))} aria-label="protinabídka" style={{ width: 100 }} />
          <button onClick={() => store.market((g, d, news) => respondToOffer(g, d, offer.id, 'counter', fee * 1000, news))}>Chci víc</button>
        </>
      )}
    </span>
  );
}
