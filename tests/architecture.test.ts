import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('architektura (CLAUDE.md)', () => {
  const engine = files('src/engine').map((f) => [f, readFileSync(f, 'utf8')] as const);

  it('engine neimportuje React, stav ani UI', () => {
    for (const [f, src] of engine) {
      expect(src, f).not.toMatch(/from ['"](react|react-dom|zustand)/);
      expect(src, f).not.toMatch(/from ['"][./]*\/(state|ui)\//);
    }
  });

  it('engine nepoužívá Math.random ani prohlížečové API', () => {
    for (const [f, src] of engine) {
      const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, f).not.toMatch(/Math\.random\(/);
      expect(code, f).not.toMatch(/\b(window|document|localStorage|indexedDB)\./);
    }
  });
});
