import { useMemo, useState } from 'react';
import type { CompetitionId } from '../../engine/types.ts';
import { createWorld, teamStrength } from '../../engine/world.ts';
import { getAppStore, useApp } from '../../state/store.ts';
import { num } from '../format.ts';

function randomSeed(): string {
  return Date.now().toString(36);
}

export function NewGameScreen() {
  const data = useApp((s) => s.data);
  const [managerName, setManagerName] = useState('');
  const [seed, setSeed] = useState(randomSeed);
  const [competition, setCompetition] = useState<CompetitionId>('chance-liga');
  const [clubId, setClubId] = useState<string | null>(null);

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
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        {!canStart && <span className="muted">{clubId ? 'Vyplň jméno trenéra.' : 'Vyber klub.'}</span>}
        <button
          className="primary"
          disabled={!canStart}
          onClick={() => clubId && getAppStore().getState().startNewGame({ clubId, managerName: managerName.trim(), seed: seed || randomSeed() })}
        >
          Začít kariéru
        </button>
      </div>
    </div>
  );
}
