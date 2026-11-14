import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadDefaultData } from './engine/data.ts';
import { indexedDbStorage, memoryStorage } from './state/persistence.ts';
import { createAppStore, setAppStore } from './state/store.ts';
import { App } from './ui/App.tsx';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Chybí element #root');

setAppStore(
  createAppStore({
    data: loadDefaultData(),
    storage: typeof indexedDB !== 'undefined' ? indexedDbStorage() : memoryStorage(),
  }),
);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
