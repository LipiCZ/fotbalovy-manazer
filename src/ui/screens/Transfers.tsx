import { useMemo, useState } from 'react';
import { exactAge } from '../../engine/game/development.ts';
import { levelOf } from '../../engine/game/finance.ts';
import { clubName, expiringContracts, isUserOrg, marketValue, personalDemand, windowOn, windowStart } from '../../engine/game/market.ts';
import { FREE_AGENT, POSITION_LABEL_CS, POSITIONS, type Player, type Position } from '../../engine/types.ts';
import { getAppStore, useGame, type TransfersTab } from '../../state/store.ts';
import { PlayerLink } from '../components.tsx';
import { formatDate, money } from '../format.ts';
import { EstimateCells, estimateMid, IncomingOfferActions, offerStatus } from '../market.tsx';

const TABS: { id: TransfersTab; label: string }[] = [
  { id: 'search', label: 'Hledat hráče' },
  { id: 'offers', label: 'Nabídky' },
  { id: 'free', label: 'Volní hráči' },
  { id: 'mine', label: 'Můj trh' },
];

const LIMIT = 80;

function PlayerRows({ players, extra }: { players: Player[]; extra?: (p: Player) => React.ReactNode }) {
  const { game, data } = useGame();
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Jméno</th>
          <th>Poz.</th>
          <th className="num">Věk</th>
          <th>Klub</th>
          <th className="num" title="odhad CEL">CEL</th>
          <th className="num" title="odhad POT">POT</th>
          <th className="num">Hodnota</th>
          <th>Smlouva</th>
          {extra && <th />}
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id}>
            <td>
              <PlayerLink player={p} />
              {p.listed && <span className="warn"> {p.listed.kind === 'sale' ? '• na prodej' : '• k hostování'}</span>}
            </td>
            <td>{p.positions.map((x) => POSITION_LABEL_CS[x]).join('/')}</td>
            <td className="num">{Math.floor(exactAge(p.birthDate, game.date))}</td>
            <td>{clubName(data, p.clubId)}</td>
            <EstimateCells game={game} data={data} p={p} />
            <td className="num">{p.contract ? money(marketValue(game, data, p)) : '–'}</td>
            <td>{p.contract ? p.contract.until.slice(0, 4) : '–'}</td>
            {extra && <td>{extra(p)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Search() {
  const { game, data, revision } = useGame();
  const [pos, setPos] = useState<Position | ''>('');
  const [maxAge, setMaxAge] = useState(40);
  const [comp, setComp] = useState('');
  const [listedOnly, setListedOnly] = useState(false);
  const [maxValue, setMaxValue] = useState(0);
  const rows = useMemo(() => {
    const out = game.players.filter(
      (p) =>
        !p.academy &&
        p.clubId !== FREE_AGENT &&
        !isUserOrg(game, data, p.clubId) &&
        (!pos || p.positions.includes(pos)) &&
        exactAge(p.birthDate, game.date) <= maxAge &&
        (!comp || game.membership[p.clubId] === comp) &&
        (!listedOnly || p.listed) &&
        (maxValue <= 0 || marketValue(game, data, p) <= maxValue * 1_000_000),
    );
    return out.sort((a, b) => estimateMid(game, data, b, 'cel') - estimateMid(game, data, a, 'cel') || a.id.localeCompare(b.id)).slice(0, LIMIT);
  }, [game, data, revision, pos, maxAge, comp, listedOnly, maxValue]);
  return (
    <section className="card">
      <div className="row wrap">
        <select value={pos} onChange={(e) => setPos(e.target.value as Position | '')} aria-label="pozice">
          <option value="">všechny pozice</option>
          {POSITIONS.map((x) => (
            <option key={x} value={x}>
              {POSITION_LABEL_CS[x]}
            </option>
          ))}
        </select>
        <select value={comp} onChange={(e) => setComp(e.target.value)} aria-label="soutěž">
          <option value="">všechny soutěže</option>
          {data.competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shortName}
            </option>
          ))}
        </select>
        <label className="row" style={{ gap: 6 }}>
          věk do
          <input type="number" value={maxAge} min={16} max={40} onChange={(e) => setMaxAge(Number(e.target.value))} style={{ width: 60 }} aria-label="maximální věk" />
        </label>
        <label className="row" style={{ gap: 6 }}>
          hodnota do
          <input type="number" value={maxValue} min={0} step={1} onChange={(e) => setMaxValue(Number(e.target.value))} style={{ width: 70 }} aria-label="maximální hodnota" />
          mil. Kč (0 = bez limitu)
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={listedOnly} onChange={(e) => setListedOnly(e.target.checked)} /> jen na prodej / k hostování
        </label>
      </div>
      <p className="help">
        CEL a POT jsou odhady: hráče 1. a 2. ligy zná každý (hrubě), ostatní jen přes skauty. Řazeno podle odhadu CEL, prvních {LIMIT}. Nabídku podáš v profilu hráče.
      </p>
      <PlayerRows players={rows} />
    </section>
  );
}

function Offers() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const userId = game.userClubId as string;
  const incoming = game.market.offers.filter((o) => o.initiatedBy === 'ai' && o.status === 'open' && isUserOrg(game, data, o.sellerId));
  const mine = game.market.offers.filter((o) => o.buyerId === userId && o.initiatedBy === 'user' && ['open', 'countered', 'agreed', 'pending'].includes(o.status));
  const history = game.market.offers.filter((o) => (o.buyerId === userId || isUserOrg(game, data, o.sellerId)) && ['done', 'rejected', 'withdrawn', 'expired'].includes(o.status) && o.sellerId !== FREE_AGENT).slice(-15).reverse();
  const player = (id: string) => game.players.find((p) => p.id === id);
  return (
    <div className="grid">
      <section className="card">
        <h3>Nabídky na moje hráče</h3>
        {incoming.length === 0 ? (
          <p className="muted">Žádné. Hráče, o které nestojíš, dej na prodej – zájemci se ozvou v přestupním okně.</p>
        ) : (
          <table className="data">
            <tbody>
              {incoming.map((o) => {
                const p = player(o.playerId);
                return (
                  <tr key={o.id}>
                    <td>{p ? <PlayerLink player={p} /> : o.playerId}</td>
                    <td>{clubName(data, o.buyerId)}</td>
                    <td className="num">{o.kind === 'loan' ? `hostování (${Math.round((o.loan?.wageShare ?? 0) * 100)} % platu)` : money(o.fee)}</td>
                    <td className="muted">do {formatDate(o.expiresAt)}</td>
                    <td>
                      <IncomingOfferActions offer={o} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h3>Moje nabídky</h3>
        {mine.length === 0 ? (
          <p className="muted">Žádné rozjednané.</p>
        ) : (
          <table className="data">
            <tbody>
              {mine.map((o) => {
                const p = player(o.playerId);
                return (
                  <tr key={o.id}>
                    <td>{p ? <PlayerLink player={p} /> : o.playerId}</td>
                    <td>{clubName(data, o.sellerId)}</td>
                    <td className="num">{o.kind === 'loan' ? 'hostování' : money(o.status === 'countered' ? (o.counterFee ?? o.fee) : o.fee)}</td>
                    <td>
                      <strong>{offerStatus(o)}</strong>
                      {o.note ? <span className="muted"> – {o.note}</span> : null}
                    </td>
                    <td>{p && <button onClick={() => store.navigate({ name: 'player', playerId: p.id })}>Jednat</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      {history.length > 0 && (
        <section className="card">
          <h3>Poslední jednání</h3>
          <table className="data">
            <tbody>
              {history.map((o) => {
                const p = player(o.playerId);
                return (
                  <tr key={o.id}>
                    <td>{p ? `${p.firstName} ${p.lastName}` : 'hráč už nehraje'}</td>
                    <td>
                      {clubName(data, o.sellerId)} → {clubName(data, o.buyerId)}
                    </td>
                    <td className="num">{o.kind === 'loan' ? 'hostování' : money(o.fee)}</td>
                    <td className="muted">{offerStatus(o)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function FreeAgents() {
  const { game, data, revision } = useGame();
  const userId = game.userClubId as string;
  const [pos, setPos] = useState<Position | ''>('');
  const rows = useMemo(
    () =>
      game.players
        .filter((p) => p.clubId === FREE_AGENT && (!pos || p.positions.includes(pos)) && (!p.lowerLeagueOnly || (game.membership[userId] !== undefined && levelOf(game, data, userId) === 3)))
        .sort((a, b) => estimateMid(game, data, b, 'cel') - estimateMid(game, data, a, 'cel') || a.id.localeCompare(b.id))
        .slice(0, LIMIT),
    [game, data, revision, pos],
  );
  return (
    <section className="card">
      <div className="row">
        <select value={pos} onChange={(e) => setPos(e.target.value as Position | '')} aria-label="pozice">
          <option value="">všechny pozice</option>
          {POSITIONS.map((x) => (
            <option key={x} value={x}>
              {POSITION_LABEL_CS[x]}
            </option>
          ))}
        </select>
      </div>
      <p className="help">Volného hráče můžeš podepsat kdykoli, bez odstupného. Čím déle je bez klubu, tím míň chce, ale po třech měsících mu klesá kondice (FS).</p>
      <PlayerRows players={rows} extra={(p) => <span className="muted">chce {money(personalDemand(game, data, p, userId).wage)}/měs.{p.lowerLeagueOnly ? ' · jen nižší soutěž' : ''}</span>} />
    </section>
  );
}

function MyMarket() {
  const { game, data } = useGame();
  const own = game.players.filter((p) => isUserOrg(game, data, p.clubId) || (p.loan && isUserOrg(game, data, p.loan.fromClubId)));
  const listed = own.filter((p) => p.listed);
  const loanedOut = own.filter((p) => p.loan && isUserOrg(game, data, p.loan.fromClubId));
  const loanedIn = own.filter((p) => p.loan && !isUserOrg(game, data, p.loan.fromClubId));
  const expiring = expiringContracts(game, data);
  return (
    <div className="grid cols-2">
      <section className="card">
        <h3>Na prodej a k hostování</h3>
        {listed.length === 0 ? <p className="muted">Nikoho jsi nenabídl. Hráče dáš na trh v jeho profilu.</p> : <PlayerRows players={listed} />}
      </section>
      <section className="card">
        <h3>Končící smlouvy (30. 6.)</h3>
        {expiring.length === 0 ? <p className="muted">Nikomu letos smlouva nekončí.</p> : <PlayerRows players={expiring} />}
        <p className="help">Hráč bez prodloužené smlouvy v létě odejde zadarmo. Prodloužit jde v profilu hráče.</p>
      </section>
      <section className="card">
        <h3>Na hostování jinde</h3>
        {loanedOut.length === 0 ? <p className="muted">Nikdo.</p> : <PlayerRows players={loanedOut} />}
      </section>
      <section className="card">
        <h3>Na hostování u nás</h3>
        {loanedIn.length === 0 ? <p className="muted">Nikdo.</p> : <PlayerRows players={loanedIn} />}
      </section>
    </div>
  );
}

export function TransfersScreen({ tab: initial }: { tab?: TransfersTab }) {
  const { game, data } = useGame();
  const [tab, setTab] = useState<TransfersTab>(initial ?? 'search');
  const w = windowOn(game.date, data);
  const incoming = game.market.offers.filter((o) => o.initiatedBy === 'ai' && o.status === 'open' && isUserOrg(game, data, o.sellerId)).length;
  return (
    <div className="grid">
      <section className="card">
        <h2>Přestupy</h2>
        <p>
          {w ? (
            <strong className="good">Přestupní okno je otevřené ({w === 'summer' ? 'letní' : 'zimní'}).</strong>
          ) : (
            <span>Okno je zavřené, další se otevře {formatDate(windowStart(game.date, data))}. Dohodnout se jde i teď, hráč přijde při otevření.</span>
          )}{' '}
          Rozpočet na přestupy od vedení: {money(game.board?.budget.transfer ?? 0)}.
        </p>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'offers' && incoming > 0 ? ` (${incoming})` : ''}
            </button>
          ))}
        </div>
      </section>
      {tab === 'search' && <Search />}
      {tab === 'offers' && <Offers />}
      {tab === 'free' && <FreeAgents />}
      {tab === 'mine' && <MyMarket />}
    </div>
  );
}
