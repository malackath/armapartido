import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { cargarMarcaClub } from './lib/marcaClub';

// Service worker de la app (vite-plugin-pwa, autoUpdate): cuando hay una versión nueva publicada,
// se instala sola, toma el control y la página se recarga. El Mostrador queda abierto todo el día,
// así que además se busca una versión nueva cada 30 minutos.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
  },
});

// Marca del club (logo y colores) antes de mostrar la app, para que no aparezca un instante la de Armá Partido.
cargarMarcaClub().finally(() => createRoot(document.getElementById('root')!).render(<App />));
