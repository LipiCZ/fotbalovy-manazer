import { useMemo, useState } from 'react';
import type { CompetitionId } from '../../engine/types.ts';
import { createWorld, teamStrength } from '../../engine/world.ts';
import { getAppStore, useApp } from '../../state/store.ts';
import { num } from '../format.ts';
import { careerStartOffers } from '../../engine/game/career.ts';
import type { CoachBackground } from '../../engine/data.ts';

function randomSeed(): string {
  return Date.now().toString(36);
}

export function NewGameScreen() {
  const data = useApp((s) => s.data);
  const [managerName, setManagerName] = useState('');
  const [seed, setSeed] = useState(randomSeed);
  const [competition, setCompetition] = useState<CompetitionId>('chance-liga');
  const [clubId, setClubId] = useState<string | null>(null);
  const [mode, setMode] = useState<'career' | 'free'>('career');
  const [background, setBackground] = useState<CoachBackground>('hráč');
  const offers = useMemo(() => careerStartOffers(data, seed || 'x'), [data, seed]);
  const offer = offers.find((o) => o.clubId === clubId);

  // Squad strength preview for the chosen seed (same world the game will create).
  const strength = useMemo(() => {
    const world = createWorld(data, seed || 'x');
    return new Map(data.clubs.map((c) => [c.id, teamStrength(world, c.id)]));
  }, [data, seed]);

  const clubs = data.clubs.filter((c) => c.competitionId === competition && !c.parentClubId);
  const canStart = clubId !== null && managerName.trim().length > 0;

  return (
    <div className="main" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Nová hra</h1>
        <button onClick={() => getAppStore().getState().back()}>Zpět</button>
      </div>
      <div className="card grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="manager">Jméno trenéra</label>
          <input id="manager" value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="např. Jan Novák" maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="seed">Semínko světa (stejné semínko = stejní hráči a los)</label>
          <div className="row">
            <input id="seed" value={seed} onChange={(e) => setSeed(e.target.value.trim())} style={{ flex: 1 }} />
            <button onClick={() => setSeed(randomSeed())}>Náhodné</button>
          </div>
        </div>
      </div>
      <div className="tabs">
        <button className={mode === 'career' ? 'active' : ''} onClick={() => { setMode('career'); setClubId(null); }}>
          Kariéra od dna
        </button>
        <button className={mode === 'free' ? 'active' : ''} onClick={() => { setMode('free'); setClubId(null); }}>
          Volný výběr
        </button>
      </div>
      {mode === 'career' ? (
        <>
          <p className="muted">Začínáš ve 3. lize. Minulost trenéra určí startovní reputaci a vztahy, kluby se liší profilem.</p>
          <div className="club-grid">
            {(Object.entries(data.balance.career.backgrounds) as [CoachBackground, (typeof data.balance.career.backgrounds)[CoachBackground]][]).map(([id, b]) => (
              <button key={id} className={`club-card ${background === id ? 'selected' : ''}`} onClick={() => setBackground(id)} aria-pressed={background === id}>
                <span>
                  <strong>{b.label}</strong>
                  <br />
                  <span className="muted">
                    {b.text} Reputace {b.reputation}.
                  </span>
                </span>
              </button>
            ))}
          </div>
          <h3 style={{ marginTop: 16 }}>Nabídky</h3>
          <div className="club-grid">
            {offers.map((o) => {
              const c = data.clubs.find((x) => x.id === o.clubId)!;
              return (
                <button key={o.clubId} className={`club-card ${clubId === o.clubId ? 'selected' : ''}`} onClick={() => setClubId(o.clubId)} aria-pressed={clubId === o.clubId}>
                  <span className="swatch" style={{ background: `linear-gradient(135deg, ${c.primaryColor} 50%, ${c.secondaryColor} 50%)` }} />
                  <span>
                    <strong>{c.name}</strong>
                    <br />
                    <span className="muted">
                      {o.profile ? data.balance.career.profiles[o.profile].label : ''} · síla {num(strength.get(c.id) ?? 0)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
      <div className="tabs">
        {data.competitions.map((c) => (
          <button key={c.id} className={c.id === competition ? 'active' : ''} onClick={() => setCompetition(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <p className="muted">B a C týmy vést nejde, vybírej A-týmy. Velikost klubu (★) je herní odhad, síla = průměrný CEL nejlepší jedenáctky.</p>
      <div className="club-grid">
        {clubs.map((c) => (
          <button key={c.id} className={`club-card ${clubId === c.id ? 'selected' : ''}`} onClick={() => setClubId(c.id)} aria-pressed={clubId === c.id}>
            <span className="swatch" style={{ background: `linear-gradient(135deg, ${c.primaryColor} 50%, ${c.secondaryColor} 50%)` }} />
            <span>
              <strong>{c.name}</strong>
              <br />
              <span className="muted">
                {c.city} · {'★'.repeat(c.size)} · síla {num(strength.get(c.id) ?? 0)}
              </span>
            </span>
          </button>
        ))}
      </div>
        </>
      )}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        {!canStart && <span className="muted">{clubId ? 'Vyplň jméno trenéra.' : 'Vyber klub.'}</span>}
        <button
          className="primary"
          disabled={!canStart}
          onClick={() =>
            clubId &&
            getAppStore()
              .getState()
              .startNewGame({
                clubId,
                managerName: managerName.trim(),
                seed: seed || randomSeed(),
                career: mode === 'career' ? { mode, background, ...(offer?.profile ? { profile: offer.profile } : {}) } : { mode },
              })
          }
        >
          Začít kariéru
        </button>
      </div>
    </div>
  );
}
