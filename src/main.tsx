import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Service worker de la app (vite-plugin-pwa, autoUpdate): cuando hay una versión nueva publicada,
// se instala sola, toma el control y la página se recarga. El Mostrador queda abierto todo el día,
// así que además se busca una versión nueva cada 30 minutos.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(<App />);
