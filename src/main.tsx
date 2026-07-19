import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

import { Capacitor } from '@capacitor/core';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader';

async function bootstrap() {
  if (Capacitor.getPlatform() === 'web') {
    jeepSqlite(window);

    if (!document.querySelector('jeep-sqlite')) {
      const jeepSqliteEl = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepSqliteEl);
    }

    await customElements.whenDefined('jeep-sqlite');
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap().catch((err) => {
  console.error('Error bootstrapping application:', err);
});
