import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the game from https://<user>.github.io/fotbalovy-manazer/, so the production
// build (and `vite preview` of it) needs that base path. The dev server and tests keep '/'.
export const PAGES_BASE = '/fotbalovy-manazer/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 60_000,
  },
}));
