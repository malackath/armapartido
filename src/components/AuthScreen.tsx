import React, { useState } from 'react';
import { DEMO_MODE, db, signInWithEmail, signInWithGoogle, signUpWithEmail } from '../lib/firebase';
import { refreshDemoIfStale } from '../demo/resetDemo';
import { DEMO_ACCOUNTS } from '../demo/demoWorld';
import { BrandIcon } from './BrandIcon';
import { useMarca } from '../lib/marcaClub';

/** Clave de sessionStorage con la pantalla a la que entra la cuenta de demo elegida. */
export const DEMO_LANDING_KEY = 'demoLanding';

/** A qué pantalla entra cada cuenta de demo y qué ve ahí. */
const DEMO_ROLE_INFO: Record<(typeof DEMO_ACCOUNTS)[number]['key'], { tab: string; sees: string }> = {
  plataforma: { tab: 'platform', sees: 'todos los clubes y lo que pagan' },
  dueno: { tab: 'admin', sees: 'administración, caja, clientes y números' },
  mostrador: { tab: 'staff', sees: 'canchas en vivo, cobros y venta suelta' },
  cantina: { tab: 'cantina', sees: 'solo la cantina: vender, cargar a una cancha y su caja' },
  jugador: { tab: 'home', sees: 'reservar, armar partido y torneos' },
  jugadora: { tab: 'home', sees: 'su partido armado y avisos' },
};

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
  if (code.includes('email-already-in-use')) return 'Ya hay una cuenta con ese mail. Tocá "Ya tengo cuenta" para entrar.';
  if (code.includes('weak-password')) return 'La contraseña es muy corta: usá al menos 8 letras o números.';
  if (code.includes('invalid-email')) return 'Ese mail no parece estar bien escrito.';
  if (code.includes('operation-not-allowed')) return 'Crear cuentas con mail no está habilitado todavía.';
  return err instanceof Error ? err.message : 'No se pudo entrar.';
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onError }) => {
  const marca = useMarca();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Registro (16/11/2026): 'inicio' muestra las opciones, 'crear' la cuenta nueva con mail, 'entrar' el ingreso.
  const [mode, setMode] = useState<'inicio' | 'crear' | 'entrar'>('inicio');
  const [showPass, setShowPass] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('La contraseña es muy corta: usá al menos 8 letras o números.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signUpWithEmail(email, password);
    } catch (err) {
      const msg = friendlyError(err);
      setError(msg);
      onError?.(msg);
      setLoading(false);
    }
  };

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
  const handleDemo = async (demoEmail: string, landing: string) => {
    // Cada cuenta de demo entra directo a su pantalla (la lee App al iniciar sesión).
    try {
      sessionStorage.setItem(DEMO_LANDING_KEY, landing);
    } catch {
      /* sin sessionStorage entra a Inicio */
    }
    setLoading(true);
    setError(null);
    setEmail(demoEmail);
    try {
      await signInWithEmail(demoEmail, import.meta.env.VITE_DEMO_PASSWORD ?? '');
      // Si la demo quedó vieja, se rearma el día alrededor de la hora actual (en segundo plano).
      if (DEMO_MODE) refreshDemoIfStale(db).catch((e) => console.warn('[demo] No se pudo poner la demo en hora:', e));
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
          {marca?.logo ? (
            <div className="mt-6 flex items-center gap-3">
              <img src={marca.logo} alt="" className="h-16 w-16 object-contain" />
              <div>
                <div className="font-display text-2xl font-bold leading-tight">{marca.nombre}</div>
                <div className="text-[13px] text-white/70">con Armá Partido</div>
              </div>
            </div>
          ) : (
            <img src="/brand/logo-horizontal-sobre-oscuro.svg" alt="Armá Partido" className="mt-6 h-10 w-auto" />
          )}
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
          {mode !== 'inicio' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode('inicio');
                  setError(null);
                }}
                className="mb-4 cursor-pointer text-sm font-semibold text-brand"
              >
                ← Volver
              </button>
              <h2 className="text-2xl font-bold">{mode === 'crear' ? 'Creá tu cuenta' : 'Entrá con tu mail'}</h2>
              <p className="mt-1 text-sm text-muted">
                {mode === 'crear'
                  ? DEMO_MODE
                    ? `Es una cuenta de prueba en ${marca ? `la app de ${marca.nombre}, con datos de ejemplo` : 'el club ficticio Los Jacarandás'}. Usá cualquier mail tuyo.`
                    : 'Es una sola cuenta. Te sirve en cualquier club que use Armá Partido.'
                  : 'Usá el mail y la contraseña con los que creaste tu cuenta.'}
              </p>
              <form onSubmit={mode === 'crear' ? handleSignup : handleEmail} className="mt-6 grid gap-3">
                <label className="grid gap-1 text-sm font-medium">
                  Mail
                  <input
                    id="auth-mail"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl border border-line bg-white px-3.5 text-base font-normal focus:border-brand focus:outline-none"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Contraseña
                  <span className="flex h-12 items-center rounded-xl border border-line bg-white focus-within:border-brand">
                    <input
                      id="auth-clave"
                      type={showPass ? 'text' : 'password'}
                      autoComplete={mode === 'crear' ? 'new-password' : 'current-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-base font-normal outline-none"
                    />
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="cursor-pointer px-3.5 text-sm font-semibold text-brand">
                      {showPass ? 'Ocultar' : 'Ver'}
                    </button>
                  </span>
                  {mode === 'crear' && <span className="text-[13px] font-normal text-muted">Al menos 8 letras o números.</span>}
                </label>
                {error && (
                  <p role="alert" className="rounded-xl bg-due-bg px-3 py-2 text-sm text-due">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  data-testid="auth-enviar"
                  className="mt-1 h-12 cursor-pointer rounded-xl bg-action text-base font-semibold text-on-action hover:brightness-95 disabled:opacity-60"
                >
                  {loading ? (mode === 'crear' ? 'Creando…' : 'Entrando…') : mode === 'crear' ? 'Crear cuenta' : 'Entrar'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold">{DEMO_MODE ? 'Probá la demo' : 'Entrá a tu club'}</h2>
              <p className="mt-1 text-sm text-muted">
                {DEMO_MODE
                  ? marca ? `Elegí con quién entrar. Es la app de ${marca.nombre} con datos de ejemplo: podés tocar todo.` : 'Elegí con quién entrar. Es el club ficticio Los Jacarandás, podés tocar todo.'
                  : 'Reservar y armar partidos es gratis. Pagás la cancha en el club.'}
              </p>

              {!DEMO_MODE && (
                <div className="mt-6 grid gap-2.5">
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={loading}
                    className="h-12 w-full cursor-pointer rounded-xl border border-line bg-white text-base font-semibold text-ink hover:bg-mist disabled:opacity-60"
                  >
                    Seguir con Google
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('crear')}
                    className="h-12 w-full cursor-pointer rounded-xl bg-action text-base font-semibold text-on-action hover:brightness-95"
                  >
                    Crear cuenta con mi mail
                  </button>
                  <button type="button" onClick={() => setMode('entrar')} className="h-10 cursor-pointer text-[15px] font-semibold text-brand">
                    Ya tengo cuenta, entrar
                  </button>
                  {error && (
                    <p role="alert" className="rounded-xl bg-due-bg px-3 py-2 text-sm text-due">
                      {error}
                    </p>
                  )}
                </div>
              )}

              {DEMO_MODE && (
                <div className="mt-6 grid gap-2.5">
                  {[...DEMO_ACCOUNTS].reverse().map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      disabled={loading}
                      onClick={() => handleDemo(a.email, DEMO_ROLE_INFO[a.key].tab)}
                      className={`flex min-h-[60px] cursor-pointer items-center justify-between rounded-2xl border bg-white px-4 py-2.5 text-left hover:bg-mist disabled:opacity-60 ${
                        loading && email === a.email ? 'border-emerald-600' : 'border-line'
                      }`}
                    >
                      <span>
                        <span className="block text-[15px] font-semibold">Entrar como {a.label.toLowerCase()}</span>
                        <span className="block text-[13px] text-muted">
                          {a.name} · {DEMO_ROLE_INFO[a.key].sees}
                        </span>
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
                  <div className="mt-3 rounded-2xl border border-dashed border-[#9fc3c5] p-4">
                    <p className="text-[15px] font-semibold">¿Querés ver cómo se suma un jugador nuevo?</p>
                    <p className="mt-0.5 text-[13px] text-muted">Creá una cuenta de prueba con tu mail y hacé el registro completo.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('crear');
                        setEmail('');
                        setPassword('');
                        setError(null);
                      }}
                      data-testid="demo-crear-cuenta"
                      className="mt-3 h-11 w-full cursor-pointer rounded-xl bg-action text-[15px] font-semibold text-on-action hover:brightness-95"
                    >
                      Crear una cuenta de jugador
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('entrar');
                        setEmail('');
                        setPassword('');
                        setError(null);
                      }}
                      className="mt-1 h-10 w-full cursor-pointer text-sm font-semibold text-brand"
                    >
                      Ya creé una, entrar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
