import React, { useState } from 'react';
import { DEMO_MODE, signInWithEmail, signInWithGoogle } from '../lib/firebase';
import { DEMO_ACCOUNTS } from '../demo/demoWorld';
import { BrandIcon } from './BrandIcon';

interface AuthScreenProps {
  onError?: (msg: string) => void;
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'El mail o la contraseña no coinciden. Revisalos y probá de nuevo.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.';
  if (code.includes('network')) return 'No hay conexión. Revisá internet y probá de nuevo.';
  if (code.includes('popup-closed')) return 'Cerraste la ventana de Google antes de terminar.';
  return err instanceof Error ? err.message : 'No se pudo entrar.';
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      const msg = friendlyError(err);
      setError(msg);
      onError?.(msg);
      setLoading(false);
    }
  };

  // Demo: un toque entra con la cuenta de prueba. La clave de demo llega por variable de build
  // (VITE_DEMO_PASSWORD, fuera del repo) y solo existe en el proyecto Firebase de la demo.
  const handleDemo = async (demoEmail: string) => {
    setLoading(true);
    setError(null);
    setEmail(demoEmail);
    try {
      await signInWithEmail(demoEmail, import.meta.env.VITE_DEMO_PASSWORD ?? '');
    } catch (err) {
      const msg = friendlyError(err);
      setError(msg);
      onError?.(msg);
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = friendlyError(err);
      setError(msg);
      onError?.(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-white md:grid md:grid-cols-2">
      <div
        className="relative flex min-h-[46vh] flex-col bg-ink bg-cover bg-center md:min-h-screen"
        style={{ backgroundImage: "url('/img/entrada-vertical.webp')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-ink/50 via-ink/20 to-ink" />
        <div className="relative px-5 pt-safe">
          <img src="/brand/logo-horizontal-sobre-oscuro.svg" alt="Armá Partido" className="mt-6 h-10 w-auto" />
        </div>
        <div className="relative mt-auto px-5 pb-6 md:pb-16">
          <h1 className="max-w-[14ch] font-display text-[34px] font-bold leading-[1.05] tracking-tight md:text-5xl">
            Reservá cancha y armá partidos parejos.
          </h1>
          <ul className="mt-5 grid gap-2.5 text-[15px] text-[#cfe9ea]">
            <li className="flex items-center gap-2.5">
              <BrandIcon name="reservar" size={20} className="text-action" /> Reservás gratis y pagás en el club
            </li>
            <li className="flex items-center gap-2.5">
              <BrandIcon name="armar-partido" size={20} className="text-action" /> La app te junta con gente de tu categoría
            </li>
            <li className="flex items-center gap-2.5">
              <BrandIcon name="torneos" size={20} className="text-action" /> Torneos en pareja con avisos
            </li>
          </ul>
        </div>
      </div>

      <div className="flex items-start justify-center bg-surface px-5 py-8 text-ink md:items-center md:py-16">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold">{DEMO_MODE ? 'Probá la demo' : 'Entrá a tu club'}</h2>
          <p className="mt-1 text-sm text-muted">
            {DEMO_MODE
              ? 'Elegí con quién entrar. Es el club ficticio Los Jacarandás, podés tocar todo.'
              : 'Usá tu mail y tu contraseña.'}
          </p>

          {!DEMO_MODE && (
          <form onSubmit={handleEmail} className="mt-6 grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Mail
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl border border-line bg-white px-3.5 text-base font-normal focus:border-emerald-600 focus:outline-none"
              />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl border border-line bg-white px-3.5 text-base font-normal focus:border-emerald-600 focus:outline-none"
              />
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#9b2c1b]">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-12 cursor-pointer rounded-2xl bg-action text-base font-semibold text-on-action hover:brightness-95 disabled:opacity-60"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          )}

          {!DEMO_MODE && (
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="mt-3 h-12 w-full cursor-pointer rounded-2xl border border-line bg-white text-base font-semibold text-ink hover:bg-mist disabled:opacity-60"
            >
              Entrar con Google
            </button>
          )}

          {DEMO_MODE && (
            <div className="mt-6 grid gap-2.5">
              {[...DEMO_ACCOUNTS].reverse().map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemo(a.email)}
                  className={`flex min-h-[60px] cursor-pointer items-center justify-between rounded-2xl border bg-white px-4 py-2.5 text-left hover:bg-mist disabled:opacity-60 ${
                    loading && email === a.email ? 'border-emerald-600' : 'border-line'
                  }`}
                >
                  <span>
                    <span className="block text-[15px] font-semibold">Entrar como {a.label.toLowerCase()}</span>
                    <span className="block text-[13px] text-muted">{a.name}</span>
                  </span>
                  <span className="text-sm font-semibold text-brand">
                    {loading && email === a.email ? 'Entrando…' : <BrandIcon name="perfil" size={20} className="text-brand" />}
                  </span>
                </button>
              ))}
              {error && (
                <p role="alert" className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#9b2c1b]">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
