import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { levelOf, maxLoan, runwayMonths, statements, TX, wageBill, type TxType } from '../../engine/game/finance.ts';
import { getAppStore, useGame } from '../../state/store.ts';
import { formatDate, money } from '../format.ts';

function Lines({ rows }: { rows: [TxType, number][] }) {
  return (
    <>
      {[...rows]
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .map(([t, v]) => (
          <tr key={t}>
            <td>{TX[t].label}</td>
            <td className={`num ${v < 0 ? 'bad' : ''}`}>{money(v)}</td>
          </tr>
        ))}
    </>
  );
}

export function FinanceScreen() {
  const { game, data } = useGame();
  const store = getAppStore().getState();
  const clubId = game.userClubId as string;
  const f = game.finances[clubId];
  const [loan, setLoan] = useState(1_000_000);
  if (!f) return <p>Klub nemá finance.</p>;
  const st = statements(f);
  const runway = runwayMonths(f);
  const budget = game.board?.budget;
  const wages = wageBill(game, data, clubId);
  const level = levelOf(game, data, clubId);
  const ref = data.balance.economy.ticketPrice.reference[`${level}`];
  const chart = [...f.monthlyCash, [game.date, f.cash] as [string, number]].map(([d, c]) => ({ label: d.slice(5, 7) + '/' + d.slice(2, 4), cash: Math.round(c / 100_000) / 10 }));
  const last = data.balance.economy.loans;

  return (
    <div className="grid">
      <div className="grid cols-3">
        <section className="card">
          <h3>Peníze na účtu</h3>
          <div className={`big ${f.cash < 0 ? 'bad' : ''}`}>{money(f.cash)}</div>
          <p className="muted">
            {runway === null ? 'Peníze teď přibývají nebo se drží.' : `Finanční ředitel: při současném tempu vydrží zhruba ${Math.floor(runway)} měsíců.`}
          </p>
          {f.cash < 0 && <p className="bad">Klub má závazky po splatnosti. Když to vydrží do {formatDate(`${game.seasonYear + 1}-${data.balance.economy.license.date}`)}, přijde o body (licence).</p>}
          {f.pointDeduction > 0 && <p className="bad">V této sezóně má klub odečteno {f.pointDeduction} bodů za licenci.</p>}
        </section>
        <section className="card">
          <h3>Rozpočet od vedení</h3>
          {budget && (
            <table className="data">
              <tbody>
                <tr>
                  <td>Platy hráčů (ročně)</td>
                  <td className={`num ${wages > budget.wageCap ? 'bad' : ''}`}>
                    {money(wages)} / {money(budget.wageCap)}
                  </td>
                </tr>
                <tr>
                  <td>Přestupy</td>
                  <td className="num">{money(budget.transfer)}</td>
                </tr>
                <tr>
                  <td>Investice</td>
                  <td className="num">{money(budget.investment)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="help">Mezi rozpočty jde přesunout nejvýš {Math.round(data.balance.economy.budget.maxShift * 100)} % (přestupy od fáze 6, investice od fáze 7).</p>
        </section>
        <section className="card">
          <h3>Vstupné</h3>
          <div className="field">
            <label htmlFor="price">Cena vstupenky na běžný zápas (Kč)</label>
            <input
              id="price"
              type="number"
              step={10}
              defaultValue={f.ticketPrice}
              disabled={f.ticketPriceLocked}
              onBlur={(e) => store.setTicketPrice(Number(e.target.value))}
            />
            <div className="help">
              Obvyklá cena v této soutěži je {ref} Kč. Dražší vstupenky = víc peněz z každého diváka, ale méně diváků.{' '}
              {f.ticketPriceLocked ? 'Cena je pro tuto sezónu uzamčená (nastavuje se jednou za sezónu před prvním domácím zápasem).' : 'Cenu jde měnit do prvního domácího zápasu.'}
            </div>
          </div>
          <p className="muted">Stadion: {f.capacity.toLocaleString('cs-CZ')} míst.</p>
        </section>
      </div>

      <section className="card">
        <h3>Stav peněz po měsících</h3>
        {chart.length < 2 ? (
          <p className="muted">Graf se ukáže po prvním měsíci sezóny.</p>
        ) : (
          <div style={{ height: 220 }} aria-label="graf peněz">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} unit=" mil." width={70} />
                <Tooltip formatter={(v) => [`${String(v).replace('.', ',')} mil. Kč`, 'peníze']} />
                <ReferenceLine y={0} stroke="var(--bad)" />
                <Line type="monotone" dataKey="cash" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid cols-2">
        <section className="card">
          <h3>Výsledovka sezóny (zjednodušená)</h3>
          <table className="data">
            <tbody>
              <tr>
                <td colSpan={2}>
                  <strong>Výnosy</strong>
                </td>
              </tr>
              <Lines rows={st.revenues} />
              <tr>
                <td colSpan={2}>
                  <strong>Náklady</strong>
                </td>
              </tr>
              <Lines rows={st.costs} />
              <tr>
                <td>
                  <strong>Hospodářský výsledek</strong>
                </td>
                <td className={`num ${st.result < 0 ? 'bad' : 'good'}`}>
                  <strong>{money(st.result)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="help">Odpisy stadionu a hráčských smluv jsou náklad, ale peníze z účtu neubírají; prodej hráče je výnos hned, peníze chodí ve splátkách. Proto se výsledek a stav peněz liší.</p>
        </section>
        <section className="card">
          <h3>Rozvaha (zjednodušená)</h3>
          <table className="data">
            <tbody>
              <tr>
                <td>Stadion</td>
                <td className="num">{money(st.assets.stadium)}</td>
              </tr>
              <tr>
                <td>Hráčské smlouvy</td>
                <td className="num">{money(st.assets.registrations)}</td>
              </tr>
              {st.assets.receivables > 0 && (
                <tr>
                  <td>Pohledávky z přestupů</td>
                  <td className="num">{money(st.assets.receivables)}</td>
                </tr>
              )}
              <tr>
                <td>Peníze</td>
                <td className="num">{money(st.assets.cash)}</td>
              </tr>
              {st.liabilities.payables > 0 && (
                <tr>
                  <td>Splátky přestupů</td>
                  <td className="num bad">{money(-st.liabilities.payables)}</td>
                </tr>
              )}
              <tr>
                <td>Úvěry</td>
                <td className={`num ${st.liabilities.loans > 0 ? 'bad' : ''}`}>{money(-st.liabilities.loans)}</td>
              </tr>
              {st.liabilities.overdue > 0 && (
                <tr>
                  <td>Závazky po splatnosti</td>
                  <td className="num bad">{money(-st.liabilities.overdue)}</td>
                </tr>
              )}
              <tr>
                <td>
                  <strong>Vlastní kapitál</strong>
                </td>
                <td className="num">
                  <strong>{money(st.equity)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 14 }}>Úvěr</h3>
          <p className="muted">
            Dluh {money(f.loans)}, úrok {Math.round(last.annualRate * 100)} % ročně. Banka půjčí ještě {money(maxLoan(f, data.balance))}.
          </p>
          <div className="row">
            <input type="number" step={500_000} value={loan} onChange={(e) => setLoan(Number(e.target.value))} aria-label="částka úvěru" style={{ width: 140 }} />
            <button onClick={() => store.takeLoan(loan)}>Vzít úvěr</button>
            <button disabled={f.loans <= 0} onClick={() => store.repayLoan(loan)}>
              Splatit
            </button>
          </div>
        </section>
      </div>

      <section className="card">
        <h3>Poslední pohyby</h3>
        <table className="data">
          <tbody>
            {[...game.transactions]
              .reverse()
              .slice(0, 25)
              .map((t, i) => (
                <tr key={i}>
                  <td className="muted">{formatDate(t.date)}</td>
                  <td>{TX[t.type].label}</td>
                  <td className="muted">{t.note}</td>
                  <td className={`num ${t.amount < 0 ? 'bad' : 'good'}`}>{money(t.amount)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
