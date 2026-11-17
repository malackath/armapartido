/**
 * Registro del jugador (aprobado por Ber el 16/11/2026): 6 pasos cortos después de crear la cuenta.
 * Vos, Foto, Categoría, Cómo jugás, Cuándo podés jugar y Avisos. Todo se guarda junto al final.
 * Vista previa: Paddle.URU/Pantallas/perfil-y-registro.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { ArrowLeft, Camera, Check, ImageIcon, Mail } from 'lucide-react';
import { DEMO_MODE } from '../../lib/firebase';
import { normalizePhone } from '../../lib/clientes';
import { formatCategory, MAX_CATEGORY } from '../../lib/padelUtils';
import { CATEGORY_QUESTIONS, availabilitySentence, suggestCategory, windowsFromGrid, type CategoryAnswers, type GridKey } from '../../lib/registro';
import { CategoryBadge } from '../ui/People';
import { subscribeClubs } from '../../services/firestoreService';
import { finishSignup, uploadSignupPhoto } from '../../services/registroService';
import type { JoinAnswer } from '../../services/sumarseService';
import type { AlertPrefs, Club, CourtSide, Gender, Hand, Modality, UserProfile, WeeklyInvites } from '../../types/padel';
import { BrandIcon } from '../BrandIcon';
import { initialsOf } from '../ui/People';
import { AvailabilityGrid, CategoryLadder, OptionGroup, PlayerFicha } from './parts';

type Step = 'vos' | 'foto' | 'categoria' | 'ayuda' | 'juego' | 'cuando' | 'avisos' | 'listo';
const NUMBERED: { id: Step; label: string }[] = [
  { id: 'vos', label: 'Vos' },
  { id: 'foto', label: 'Foto' },
  { id: 'categoria', label: 'Categoría' },
  { id: 'juego', label: 'Cómo jugás' },
  { id: 'cuando', label: 'Cuándo podés jugar' },
  { id: 'avisos', label: 'Avisos' },
];
const ORDER: Step[] = ['vos', 'foto', 'categoria', 'juego', 'cuando', 'avisos', 'listo'];

export type AfterSignup = 'matchmaking' | 'bookings';

const btnPri =
  'flex h-[50px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-action text-base font-semibold text-on-action hover:brightness-95 disabled:cursor-default disabled:opacity-50';
const btnSec =
  'flex h-[50px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-line bg-white text-base font-semibold text-ink hover:bg-mist';
const inputCls =
  'h-[50px] w-full rounded-xl border border-line bg-white px-3.5 text-base text-ink outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgba(10,87,97,.12)]';

export const RegistroFlow: React.FC<{
  authUser: User;
  onDone: (profile: UserProfile, go: AfterSignup) => void;
  onLogout: () => void;
  /** Llegó por el link de un "Falta uno": se suma a ese club. */
  preferredClubId?: string;
}> = ({ authUser, onDone, onLogout, preferredClubId }) => {
  const [step, setStep] = useState<Step>('vos');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [name, setName] = useState((authUser.displayName ?? '').slice(0, 80));
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(authUser.photoURL ?? '');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [category, setCategory] = useState<number | null>(null);
  const [answers, setAnswers] = useState<CategoryAnswers>({});
  const suggestion = suggestCategory(answers);
  const [gender, setGender] = useState<Gender | null>(null);
  const [modality, setModality] = useState<Modality>('mixto');
  const [side, setSide] = useState<CourtSide | null>(null);
  const [hand, setHand] = useState<Hand | null>(null);
  const [grid, setGrid] = useState<Set<GridKey>>(new Set());
  const [prefs, setPrefs] = useState<AlertPrefs>({ weeklyInvites: 3, maxCategoryGap: 1 });
  const [push, setPush] = useState<NotificationPermission | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ profile: UserProfile; joined: boolean; join: JoinAnswer | null } | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => subscribeClubs(setClubs), []);
  // La app de cada club: en la demo hay un solo club (Los Jacarandás).
  const club = clubs.find((c) => c.id === preferredClubId) ?? clubs[0] ?? null;
  const clubName = club?.name ?? (DEMO_MODE ? 'Los Jacarandás Pádel' : 'tu club');

  useEffect(() => {
    setError(null);
    setTouched(false);
    window.scrollTo({ top: 0 });
  }, [step]);

  const phoneOk = !!normalizePhone(phone);
  const nameOk = name.trim().length >= 2;
  const idx = NUMBERED.findIndex((s) => s.id === (step === 'ayuda' ? 'categoria' : step));
  const windows = useMemo(() => windowsFromGrid(grid), [grid]);

  const go = (s: Step) => setStep(s);
  const next = () => go(ORDER[ORDER.indexOf(step === 'ayuda' ? 'categoria' : step) + 1]);
  const back = () => {
    if (step === 'ayuda') return go('categoria');
    const i = ORDER.indexOf(step);
    if (i > 0) go(ORDER[i - 1]);
  };

  const range = (gap: number) => {
    const c = category ?? 5;
    const lo = Math.max(1, c - gap);
    const hi = Math.min(MAX_CATEGORY, c + gap);
    if (hi - lo <= 2) {
      const l = Array.from({ length: hi - lo + 1 }, (_, i) => formatCategory(lo + i));
      return l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}` : l[0];
    }
    return `${formatCategory(lo)} a ${formatCategory(hi)}`;
  };

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    setError(null);
    try {
      setPhotoUrl(await uploadSignupPhoto(authUser.uid, f));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto. Probá con otra.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const askPush = async () => {
    if (!('Notification' in window)) return;
    try {
      setPush(await Notification.requestPermission());
    } catch {
      setPush(Notification.permission);
    }
  };

  const finish = async () => {
    if (!category || !gender || !side) return;
    setSaving(true);
    setError(null);
    try {
      const res = await finishSignup(
        {
          uid: authUser.uid,
          email: authUser.email ?? '',
          displayName: name.trim(),
          phone: normalizePhone(phone),
          photoUrl,
          category,
          gender,
          preferredModality: modality,
          courtSide: side,
          ...(hand ? { hand } : {}),
          weeklyAvailability: windows,
          alertPrefs: prefs,
        },
        club
      );
      setDone(res);
      go('listo');
    } catch (e) {
      console.error('[registro]', e);
      setError('No se pudo guardar tu perfil. Revisá la conexión y probá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- pasos ----------
  let body: React.ReactNode = null;
  let foot: React.ReactNode = null;
  let skip: (() => void) | null = null;

  if (step === 'vos') {
    const ok = nameOk && phoneOk && accepted;
    body = (
      <>
        {authUser.email && !authUser.emailVerified && (
          <div className="mb-5 flex gap-2.5 rounded-xl border border-line bg-white px-3.5 py-3 text-sm leading-snug text-ink">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <span>
              Te mandamos un mail a <b className="font-semibold break-all">{authUser.email}</b> para confirmarlo. Podés seguir mientras tanto.
            </span>
          </div>
        )}
        <H title="¿Cómo te llamás?" sub="Así te ven los otros jugadores y el club." />
        <label className="mt-5 grid gap-1.5 text-sm font-semibold text-ink">
          Nombre y apellido
          <input id="reg-nombre" className={inputCls} value={name} autoComplete="name" maxLength={80} onChange={(e) => setName(e.target.value)} />
          {touched && !nameOk && <Err>Escribí tu nombre y apellido.</Err>}
        </label>
        <label className="mt-4 grid gap-1.5 text-sm font-semibold text-ink">
          Celular
          <span className="flex h-[50px] items-center rounded-xl border border-line bg-white focus-within:border-brand focus-within:shadow-[0_0_0_3px_rgba(10,87,97,.12)]">
            <span className="border-r border-line px-3 text-base font-normal text-muted">+598</span>
            <input
              id="reg-celular"
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-normal text-ink outline-none"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="099 123 456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </span>
          <span className="text-[13px] font-normal text-muted">Lo ve solo el club, por si tiene que avisarte algo del turno.</span>
          {touched && !phoneOk && <Err>Revisá el celular: son 9 números y empieza con 09.</Err>}
        </label>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-snug text-[#2c3c3e]">
          <input id="reg-acepto" type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0a5761]" />
          <span>
            Acepto las condiciones de uso y que {clubName} y Armá Partido guarden mis datos para las reservas y los avisos.
          </span>
        </label>
        {touched && !accepted && <Err>Para seguir tenés que aceptar.</Err>}
      </>
    );
    foot = (
      <button type="button" className={btnPri} onClick={() => (ok ? next() : setTouched(true))}>
        Seguir
      </button>
    );
  }

  if (step === 'foto') {
    skip = next;
    body = (
      <>
        <H title="Poné una foto" sub="Así te reconocen en la cancha cuando la app te junta con gente que no conocés." />
        <div className="mx-auto mt-6 w-44">
          {photoUrl ? (
            <img src={photoUrl} alt="Tu foto" className="aspect-square w-full rounded-xl object-cover outline-3 outline-offset-3 outline-brand" />
          ) : (
            <span className="grid aspect-square w-full place-items-center rounded-xl bg-avatar font-display text-5xl font-bold text-[#3a5a5d]">
              {initialsOf(name)}
            </span>
          )}
          <p className="mt-2 text-center text-[13px] text-muted">{photoBusy ? 'Subiendo…' : photoUrl ? 'Tu foto' : 'Sin foto, se ven tus iniciales'}</p>
        </div>
        <div className="mt-5 grid gap-2.5">
          <label className={`${btnSec} md:hidden`}>
            <Camera className="h-5 w-5" /> Sacar una foto
            <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>
          <label className={btnSec}>
            <ImageIcon className="h-5 w-5" /> {photoUrl ? 'Elegir otra' : 'Elegir una foto'}
            <input id="reg-foto" type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>
        </div>
        <p className="mt-3 text-[13px] text-muted">Que se te vea la cara. Se recorta cuadrada.</p>
      </>
    );
    foot = (
      <button type="button" className={btnPri} disabled={photoBusy} onClick={next}>
        {photoUrl ? 'Seguir' : 'Seguir sin foto'}
      </button>
    );
  }

  if (step === 'categoria' || step === 'ayuda') {
    body = (
      <>
        <H title="¿En qué categoría jugás?" sub="Con esto la app te junta con gente de tu nivel. El club la puede corregir." />
        <div className="mt-5 max-w-md">
          <CategoryLadder value={category} onChange={setCategory} />
        </div>
        <button type="button" onClick={() => go('ayuda')} className="mt-3 h-10 cursor-pointer px-1 text-[15px] font-semibold text-brand">
          No sé mi categoría
        </button>
        {touched && !category && <Err>Elegí una categoría para seguir.</Err>}
      </>
    );
    foot = (
      <button type="button" className={btnPri} onClick={() => (category ? next() : setTouched(true))}>
        Seguir
      </button>
    );
  }

  if (step === 'juego') {
    const ok = !!gender && !!side;
    body = (
      <>
        <H title="¿Cómo jugás?" sub="Para armarte partidos y buscarte pareja." />
        <Q>Jugás en</Q>
        <OptionGroup label="Jugás en" value={gender} onChange={setGender} options={[{ v: 'masculino', label: 'Masculino' }, { v: 'femenino', label: 'Femenino' }]} />
        <Q>Querés que te armen partidos</Q>
        <OptionGroup
          label="Partidos"
          value={modality}
          onChange={setModality}
          options={[
            { v: 'masculino', label: 'Masculinos' },
            { v: 'femenino', label: 'Femeninos' },
            { v: 'mixto', label: 'Mixtos' },
          ]}
        />
        <Q>Lado de la cancha</Q>
        <OptionGroup
          label="Lado de la cancha"
          value={side}
          onChange={setSide}
          options={[
            { v: 'drive', label: 'Drive' },
            { v: 'reves', label: 'Revés' },
            { v: 'indistinto', label: 'Me da igual' },
          ]}
        />
        <Q>
          Mano <span className="font-normal text-muted">(si querés)</span>
        </Q>
        <OptionGroup label="Mano" value={hand} onChange={setHand} options={[{ v: 'derecha', label: 'Derecha' }, { v: 'izquierda', label: 'Izquierda' }]} />
        {touched && !ok && <Err>{!gender ? 'Contanos si jugás en masculino o femenino.' : 'Elegí de qué lado jugás.'}</Err>}
      </>
    );
    foot = (
      <button type="button" className={btnPri} onClick={() => (ok ? next() : setTouched(true))}>
        Seguir
      </button>
    );
  }

  if (step === 'cuando') {
    skip = next;
    body = (
      <>
        <H
          title="¿Cuándo podés jugar?"
          sub="Tu semana de siempre. Tocá los horarios en los que podés. Los pedidos puntuales (“hoy de 18 a 21”) se hacen en Armar partido."
        />
        <div className="mt-5 max-w-lg">
          <AvailabilityGrid value={grid} onChange={setGrid} />
        </div>
        <p className="mt-4 max-w-lg rounded-xl border border-line bg-white px-3.5 py-3 text-sm leading-snug text-ink" data-testid="resumen-horarios">
          {windows.length ? `Podés jugar: ${availabilitySentence(windows)}.` : 'Todavía no marcaste horarios.'}
        </p>
      </>
    );
    foot = (
      <button type="button" className={btnPri} onClick={next}>
        {windows.length ? 'Seguir' : 'Seguir sin horarios'}
      </button>
    );
  }

  if (step === 'avisos') {
    const weekly: { v: WeeklyInvites; label: string; sub?: string }[] = [
      { v: 0, label: 'Ninguna' },
      { v: 3, label: '3', sub: 'sugerido' },
      { v: 6, label: '6' },
      { v: -1, label: 'Todas' },
    ];
    body = (
      <>
        <H title="¿Cómo te avisamos?" sub="Cuando la app te arma un partido, tenés un rato para aceptar. Si no te llega el aviso, se lo pierde otro." />
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
          <span className="text-[15px] leading-snug">
            <b className="font-semibold">Avisos en este aparato</b>
            <small className="block text-[13px] text-muted">Partido armado, cambios de tu reserva y torneos</small>
          </span>
          {push === 'granted' ? (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ok">
              <Check className="h-4 w-4" /> Activados
            </span>
          ) : push === 'unsupported' ? (
            <span className="max-w-[45%] text-right text-[13px] text-muted">Este navegador no los permite. Los ves en la campanita.</span>
          ) : push === 'denied' ? (
            <span className="max-w-[45%] text-right text-[13px] text-muted">Están bloqueados en el navegador.</span>
          ) : (
            <button type="button" onClick={askPush} className="shrink-0 cursor-pointer rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white">
              Activar
            </button>
          )}
        </div>
        <Q>Invitaciones de “Falta uno”</Q>
        <p className="-mt-1 mb-2 text-[13px] text-muted">Cuando a un partido le falta un jugador de tu nivel. ¿Cuántas por semana como máximo?</p>
        <OptionGroup label="Invitaciones por semana" value={prefs.weeklyInvites} onChange={(v) => setPrefs({ ...prefs, weeklyInvites: v })} options={weekly} />
        <Q>¿Con quién jugás?</Q>
        <OptionGroup
          label="Con quién jugás"
          cols={1}
          value={prefs.maxCategoryGap}
          onChange={(v) => setPrefs({ ...prefs, maxCategoryGap: v })}
          options={[
            { v: 0, label: 'Solo mi categoría', sub: category ? formatCategory(category) : undefined },
            { v: 1, label: 'Hasta una de diferencia', sub: range(1) },
            { v: 2, label: 'Hasta dos de diferencia', sub: range(2) },
          ]}
        />
        <p className="mt-3 text-[13px] text-muted">De 23:00 a 08:00 no te mandamos invitaciones.</p>
      </>
    );
    foot = (
      <button type="button" className={btnPri} disabled={saving} onClick={finish} data-testid="reg-terminar">
        {saving ? 'Guardando…' : 'Terminar'}
      </button>
    );
  }

  if (step === 'listo' && done) {
    const first = done.profile.displayName.split(' ')[0];
    return (
      <div className="min-h-screen bg-page">
        <div className="bg-brand px-5 pt-[max(28px,env(safe-area-inset-top))] pb-20 text-white">
          <div className="mx-auto max-w-md">
            <h1 className="font-display text-[28px] leading-tight font-bold">
              {done.join?.status === 'encontrado' ? `¡Te encontramos, ${first}!` : `Listo, ${first}.`}
            </h1>
            <p className="mt-1.5 text-[15px] text-[#bfe3e5]">
              {done.joined ? `Ya sos parte de ${clubName}. Así te ven los demás:` : 'Tu perfil está armado. Así te ven los demás:'}
            </p>
          </div>
        </div>
        <div className="mx-auto -mt-14 max-w-md px-5 pb-10">
          <PlayerFicha profile={done.profile} clubName={done.joined ? clubName : undefined} />
          {done.join?.status === 'encontrado' && (
            <p className="mt-3 rounded-xl bg-ok-bg px-3.5 py-3 text-sm leading-snug text-ok" data-testid="sumarse-encontrado">
              {clubName} ya te tenía en su lista con este mail.
              {done.join.fixed ? ` Tu turno fijo de los ${done.join.fixed} ya está en la app.` : ''}
            </p>
          )}
          {done.join?.status === 'pendiente' && (
            <div className="mt-3 rounded-xl bg-wait-bg px-3.5 py-3 text-sm leading-snug text-wait" data-testid="sumarse-pendiente">
              <p className="font-semibold">Le mandamos tu pedido a {clubName}</p>
              <p className="mt-1">
                No encontramos tu mail en la lista del club. Te avisamos apenas te confirme. Mientras, podés mirar horarios y torneos. ¿Te anotaron con otro
                mail? Avisale al club.
              </p>
            </div>
          )}
          {done.join?.status === 'rechazado' && (
            <p className="mt-3 rounded-xl border border-line bg-white px-3.5 py-3 text-sm leading-snug" data-testid="sumarse-rechazado">
              {clubName} no confirmó tu pedido. Si sos jugador del club, hablá con el encargado: quizás te anotaron con otro mail.
            </p>
          )}
          {!done.join && (
            <p className="mt-3 rounded-xl border border-line bg-white px-3.5 py-3 text-sm leading-snug">
              Para sumarte a {clubName} confirmá tu mail con el enlace que te mandamos y volvé a entrar.
            </p>
          )}
          {done.profile.weeklyAvailability.length > 0 && (
            <div className="mt-3 rounded-xl border border-line bg-white px-3.5 py-3">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <BrandIcon name="horario" size={18} className="text-brand" /> Podés jugar
              </p>
              <p className="mt-1 text-sm text-ink">{availabilitySentence(done.profile.weeklyAvailability)}</p>
            </div>
          )}
          <div className="mt-5 grid gap-2.5">
            <button type="button" className={btnPri} onClick={() => onDone(done.profile, 'matchmaking')}>
              <BrandIcon name="armar-partido" size={20} /> Armar un partido
            </button>
            <button type="button" className={btnSec} onClick={() => onDone(done.profile, 'bookings')}>
              <BrandIcon name="reservar" size={20} /> Reservar cancha
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Compu: pasos siempre a la vista a la izquierda */}
      <aside className="hidden bg-brand p-7 text-white lg:block">
        <div className="sticky top-7">
          <img src="/brand/logo-horizontal-sobre-oscuro.svg" alt="Armá Partido" className="h-7 w-auto" />
          <p className="mt-1.5 text-[13px] text-[#bfe3e5]">{clubName}</p>
          <h2 className="mt-10 font-display text-xl font-bold">Armá tu perfil</h2>
          <p className="mt-1 text-sm leading-snug text-[#bfe3e5]">Seis pasos. Lo podés cambiar cuando quieras.</p>
          <ol className="mt-6 grid gap-1">
            {NUMBERED.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === idx ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-[10px] px-2.5 py-2 text-[15px] ${i === idx ? 'bg-white/12 font-semibold text-white' : 'text-[#bfe3e5]'}`}
              >
                <span
                  className={`grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] text-[13px] font-bold ${
                    i < idx ? 'border-[#bfe3e5] bg-[#bfe3e5] text-brand' : i === idx ? 'border-action bg-action text-on-action' : 'border-[#5f9ba1]'
                  }`}
                >
                  {i < idx ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
          <button type="button" onClick={onLogout} className="mt-10 cursor-pointer text-sm text-[#bfe3e5] underline underline-offset-2">
            Salir y seguir otro día
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 bg-surface px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3 lg:px-10 lg:pt-7">
          <button
            type="button"
            onClick={idx === 0 && step !== 'ayuda' ? onLogout : back}
            aria-label={idx === 0 ? 'Salir' : 'Volver'}
            className="grid h-[38px] w-[38px] shrink-0 cursor-pointer place-items-center rounded-xl border border-line bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 lg:hidden">
            <div className="grid grid-cols-6 gap-1">
              {NUMBERED.map((s, i) => (
                <span key={s.id} className={`h-[5px] rounded-full ${i <= idx ? 'bg-brand' : 'bg-line'}`} />
              ))}
            </div>
            <small className="mt-1 block text-xs font-semibold text-muted">
              Paso {idx + 1} de {NUMBERED.length}
            </small>
          </div>
          <span className="hidden flex-1 text-sm font-semibold text-muted lg:block">
            Paso {idx + 1} de {NUMBERED.length}
          </span>
          {skip && (
            <button type="button" onClick={skip} className="cursor-pointer px-2 py-2 text-sm font-semibold text-brand">
              Después
            </button>
          )}
        </header>

        <main className="flex-1 px-5 pt-2 pb-6 lg:px-10">
          <div className="max-w-xl">
            {body}
            {error && <Err>{error}</Err>}
          </div>
        </main>

        <footer className="sticky bottom-0 border-t border-line bg-surface px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] lg:static lg:border-0 lg:px-10 lg:pb-10">
          <div className="max-w-xl lg:max-w-[240px]">{foot}</div>
        </footer>
      </div>

      {step === 'ayuda' && (
        <div className="fixed inset-0 z-30 flex items-end bg-ink/50 sm:items-center sm:justify-center" onClick={() => go('categoria')}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ayuda-cat"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-[20px] bg-white px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-xl sm:pt-5"
          >
            <div className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-[#c9d8d9] sm:hidden" />
            <h3 id="ayuda-cat" className="font-display text-xl font-bold text-ink">
              Te ayudamos a elegir
            </h3>
            <p className="mt-1 text-[13.5px] text-muted">5 preguntas de un toque.</p>
            <div className="mt-2 grid gap-3">
              {CATEGORY_QUESTIONS.map((x, qi) => (
                <fieldset key={x.id}>
                  <legend className="mb-1.5 text-[14.5px] font-semibold text-ink">
                    {qi + 1}. {x.q}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {x.options.map((o, oi) => {
                      const on = answers[x.id] === oi;
                      return (
                        <button
                          key={o}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setAnswers({ ...answers, [x.id]: oi as 0 | 1 | 2 })}
                          className={`h-9 cursor-pointer rounded-full border px-3 text-[13.5px] font-semibold ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            {suggestion === 'torneo' ? (
              <div className="mt-4 rounded-xl border-2 border-brand/30 bg-mist p-3.5" data-testid="sugerencia-categoria">
                <p className="font-semibold text-ink">Usá la categoría de tu último torneo</p>
                <p className="mt-1 text-[13px] text-muted">Es la mejor referencia. El club la confirma después de verte jugar.</p>
              </div>
            ) : typeof suggestion === 'number' ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl border-2 border-brand/30 bg-mist p-3.5" data-testid="sugerencia-categoria">
                <CategoryBadge category={suggestion} size={40} />
                <div>
                  <p className="font-semibold text-ink">Te sugerimos {formatCategory(suggestion)}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">Es una sugerencia. Tu club la confirma después de verte jugar.</p>
                </div>
              </div>
            ) : null}
            {typeof suggestion === 'number' ? (
              <>
                <button
                  type="button"
                  className={`${btnPri} mt-4`}
                  onClick={() => {
                    setCategory(suggestion);
                    go('categoria');
                  }}
                >
                  Usar {formatCategory(suggestion)}
                </button>
                <button type="button" onClick={() => go('categoria')} className="mt-2 h-11 w-full cursor-pointer rounded-2xl border border-line bg-white text-[15px] font-semibold text-brand">
                  Elegir otra
                </button>
              </>
            ) : (
              <button type="button" className={`${btnPri} mt-4`} onClick={() => go('categoria')}>
                {suggestion === 'torneo' ? 'Elegir mi categoría' : 'Volver'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const H: React.FC<{ title: string; sub: string }> = ({ title, sub }) => (
  <>
    <h1 className="font-display text-[26px] leading-[1.12] font-bold tracking-tight text-ink lg:text-[30px]">{title}</h1>
    <p className="mt-1.5 text-[15px] leading-snug text-muted">{sub}</p>
  </>
);
const Q: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="mt-6 mb-2.5 text-base font-bold text-ink first:mt-0">{children}</p>;
const Err: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p role="alert" className="mt-2 rounded-xl bg-due-bg px-3 py-2 text-sm font-normal text-due">
    {children}
  </p>
);
