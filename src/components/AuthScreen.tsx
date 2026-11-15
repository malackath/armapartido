import React, { useState } from 'react';
import { ArrowRight, CalendarCheck, ShieldCheck, Trophy, Users } from 'lucide-react';
import { signInWithGoogle } from '../lib/firebase';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthScreenProps {
  onError?: (msg: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onError }) => {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.';
      onError?.(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-8 border-b border-slate-200 px-6 py-4">
        <span className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          Sumate
        </span>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href="#reservas" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Reservas
          </a>
          <a href="#partidos" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Armado parejo
          </a>
          <a href="#torneos" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Torneos
          </a>
          <a href="#clubes" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
            Para clubes
          </a>
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-stretch">
          <div className="flex flex-col justify-between lg:col-span-7">
            <div>
              <p className="text-xs font-semibold tracking-wide text-emerald-700">
                Uruguay · Marca blanca para clubes de pádel
              </p>
              <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                Reservá cancha o dejá que la app arme tu cuarto parejo.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
                Una única cuenta de jugador para todos los clubes adheridos. Cada club personaliza su app con su nombre, canchas, tarifas y Mercado Pago directo, mientras el motor junta a cuatro jugadores de nivel compatible en una cancha libre.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loading}
                  className="inline-flex min-h-[48px] items-center gap-3 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>{loading ? 'Ingresando...' : 'Entrar con Google'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
                <span className="text-xs text-slate-500">
                  Cuenta única para jugador, mostrador y administración
                </span>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8 sm:grid-cols-4">
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">90 min</p>
                <p className="mt-1 text-xs text-slate-500">Duración base por turno</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">1ra–8va</p>
                <p className="mt-1 text-xs text-slate-500">Tolerancia ±1 categoría</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">30m / 2h</p>
                <p className="mt-1 text-xs text-slate-500">Retención hasta confirmar 4</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-slate-900 tabular-nums">0%</p>
                <p className="mt-1 text-xs text-slate-500">Comisión sobre reservas</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Todo el club en cuatro módulos reales
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Incluye dos clubes piloto precargados en Montevideo para probar todos los roles desde el primer momento.
                </p>

                <div className="mt-6 divide-y divide-slate-100">
                  <div id="reservas" className="flex items-start gap-3.5 py-4 first:pt-0">
                    <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Reservas y mostrador</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Confirmación al instante, tarifas nocturnas y de fin de semana, pagos en club o Mercado Pago y carga telefónica sin app.
                      </p>
                    </div>
                  </div>
                  <div id="partidos" className="flex items-start gap-3.5 py-4">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Armado de partidos parejos</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Disponibilidad semanal, pedidos puntuales prioritarios, pareja fija y división automática del pago entre los cuatro.
                      </p>
                    </div>
                  </div>
                  <div id="torneos" className="flex items-start gap-3.5 py-4">
                    <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Torneos con cuadro automático</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Eliminación directa o grupos, inscripción en pareja con aceptación del compañero y bloqueo automático de canchas.
                      </p>
                    </div>
                  </div>
                  <div id="clubes" className="flex items-start gap-3.5 py-4 last:pb-0">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Cuatro roles y PWA instalable</p>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Dueño de plataforma, administrador del club, encargado y jugador con avisos push y registro de mails.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                Dominio sugerido disponible para verificación: <span className="font-mono font-semibold text-slate-900">sumatepadel.com</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
