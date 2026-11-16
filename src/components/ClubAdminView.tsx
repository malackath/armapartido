import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type {
  RecoveryRecord,
  Booking,
  Club,
  ClubMembership,
  Court,
  PaymentRecord,
  PlayerMatchResult,
  ProposedMatch,
  RoofType,
  SurfaceType,
  Tournament,
  TournamentFormat,
  UserProfile,
} from '../types/padel';
import { addDaysISO, formatCategory, formatMinutes, formatUYU, generateDaySlots, getTodayISO, type PlayerLevelSummary } from '../lib/padelUtils';
import {
  addClubCourt,
  closeRegistrationAndDraw,
  createTournament,
  removeClubCourt,
  updateClubCourt,
  subscribeRecoveries,
  updateClubSettings,
  updateMembershipByAdmin,
} from '../services/firestoreService';
import { BrandIcon, type BrandIconName } from './BrandIcon';
import { payMethodLabel } from './StaffCounterView';
import { ClubOpsContext, useClubOps } from './caja/ops';
import { CantinaAdmin, CashDaysCard, DepositCard, FixedAdmin, MonthlyReportAdmin } from './caja/AdminSections';
import { auth } from '../lib/firebase';
import { ClientesContext, useClientesData } from './clientes/data';
import { ClientsPanel } from './clientes/ClientsPanel';
import { Libro } from './clientes/Libro';
import { Numeros } from './clientes/Numeros';
import { CuponerasAdmin } from './clientes/CuponerasAdmin';

interface ClubAdminViewProps {
  club: Club;
  courts: Court[];
  memberships: ClubMembership[];
  bookings: Booking[];
  proposedMatches: ProposedMatch[];
  tournaments: Tournament[];
  payments: PaymentRecord[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults: PlayerMatchResult[];
  playerLevelsMap?: Map<string, PlayerLevelSummary>;
  userProfile: UserProfile;
  onToast: (msg: string) => void;
}

type Section = 'courts' | 'prices' | 'fill' | 'members' | 'clients' | 'numbers' | 'tournaments' | 'cash' | 'packs' | 'cantina' | 'fixed' | 'report' | 'club';

const SECTIONS: { id: Section; label: string; icon: BrandIconName; title: string; subtitle: string }[] = [
  { id: 'courts', label: 'Canchas y horarios', icon: 'cancha', title: 'Canchas y horarios', subtitle: 'Lo que cambies acá se ve al instante en la app de los jugadores y en el Mostrador.' },
  { id: 'prices', label: 'Precios y reglas', icon: 'pago-en-club', title: 'Precios y reglas', subtitle: 'Precio por turno, cancelación, faltas y Mercado Pago.' },
  { id: 'fill', label: 'Falta uno', icon: 'falta-uno', title: '"Falta uno" automático', subtitle: 'Cuando alguien se baja, la app busca reemplazo sola y te muestra los turnos recuperados.' },
  { id: 'members', label: 'Jugadores y encargados', icon: 'pareja', title: 'Jugadores y encargados', subtitle: 'Corregí categorías, nombrá encargados del mostrador y bloqueá a quien falta seguido.' },
  { id: 'clients', label: 'Clientes', icon: 'perfil', title: 'Clientes del club', subtitle: 'Una ficha por persona, con app o sin app: lo que debe, sus cuponeras, sus turnos y sus datos.' },
  { id: 'numbers', label: 'Números', icon: 'resultado', title: 'Números del club', subtitle: 'Altas, clientes que vuelven, ocupación, ventas, deuda y cuponeras. Tocá un número para ver quiénes lo forman.' },
  { id: 'tournaments', label: 'Torneos', icon: 'torneos', title: 'Torneos', subtitle: 'Creá torneos, seguí la inscripción y sorteá el cuadro.' },
  { id: 'cash', label: 'Caja', icon: 'pago-online', title: 'Caja', subtitle: 'Cierres de cada día y el libro del club: cada cobro con su rubro, medio y factura.' },
  { id: 'packs', label: 'Cuponeras', icon: 'pago-en-club', title: 'Cuponeras', subtitle: 'Paquetes de partes o turnos que se venden en el Mostrador. Usarlas no es plata nueva.' },
  { id: 'cantina', label: 'Cantina', icon: 'paleta', title: 'Cantina', subtitle: 'Productos, precios y cuántos quedan. Se venden desde el Mostrador, pegados al turno.' },
  { id: 'fixed', label: 'Turnos fijos', icon: 'horario', title: 'Turnos fijos', subtitle: 'Reservas que se repiten todas las semanas.' },
  { id: 'report', label: 'Informe del mes', icon: 'resultado', title: 'Lo que ganaste con Armá Partido', subtitle: 'Los turnos que llenaron nuestros avisos, en pesos, al lado de la cuota. Llega por mail el día 1.' },
  { id: 'club', label: 'Datos del club', icon: 'ubicacion', title: 'Datos del club', subtitle: 'Nombre y color de la app del club.' },
];

const STATUS_LABEL: Record<Tournament['status'], { text: string; cls: string }> = {
  registration_open: { text: 'Inscripción abierta', cls: 'bg-green-50 text-green-800' },
  draw_generated: { text: 'Cuadro sorteado', cls: 'bg-indigo-50 text-indigo-800' },
  in_progress: { text: 'En juego', cls: 'bg-indigo-50 text-indigo-800' },
  completed: { text: 'Terminado', cls: 'bg-mist text-muted' },
};

const KIND_LABEL: Record<PaymentRecord['kind'], string> = {
  booking_full: 'Turno',
  booking_deposit: 'Seña de turno',
  match_share: 'Parte de partido armado',
  tournament_fee: 'Inscripción a torneo',
  refund: 'Devolución',
  platform_subscription: 'Cuota de la plataforma',
  cantina: 'Cantina',
  venta: 'Venta',
  retiro: 'Retiro de caja',
  anulacion: 'Anulación',
};

const inputCls = 'mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink tabular-nums';
const labelCls = 'block text-[12.5px] font-semibold text-ink';

const Card: React.FC<{ title?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, action, className = '', children }) => (
  <section className={`rounded-2xl border border-line bg-white p-5 sm:p-6 ${className}`}>
    {(title || action) && (
      <div className="mb-4 flex items-center justify-between gap-3">
        {title && <h2 className="font-display text-[17px] font-bold text-ink">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-3 rounded-xl bg-[#ecfcfc] px-3.5 py-2.5 text-[12.5px] text-muted">{children}</p>
);

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!on)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Admin → "Falta uno": encender, diferencia de categoría y turnos recuperados del mes (vista 8). */
const FillSection: React.FC<{
  club: Club;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  maxGap: 1 | 2;
  setMaxGap: (v: 1 | 2) => void;
}> = ({ club, enabled, setEnabled, maxGap, setMaxGap }) => {
  const [records, setRecords] = useState<RecoveryRecord[]>([]);
  useEffect(() => subscribeRecoveries(club.id, setRecords), [club.id]);

  const month = getTodayISO().slice(0, 7);
  const summary = useMemo(() => {
    const mine = records.filter((r) => r.date.startsWith(month));
    const counted = mine.filter((r) => r.status === 'counted');
    const pending = mine.filter((r) => r.status === 'pending');
    const replaced = counted.filter((r) => r.kind === 'player_replaced');
    const filled = counted.filter((r) => r.kind === 'slot_filled');
    const saved = counted.filter((r) => r.kind === 'match_completed');
    const sum = (list: RecoveryRecord[]) => list.reduce((a, r) => a + (r.amountRecovered || 0), 0);
    return { replaced, filled, saved, pending, total: sum(replaced) + sum(filled), sumReplaced: sum(replaced), sumFilled: sum(filled) };
  }, [records, month]);
  const monthName = MONTH_NAMES[Number(month.slice(5, 7)) - 1];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5">
        <Card title="Buscar reemplazo solo" action={<Toggle on={enabled} onChange={setEnabled} label="Buscar reemplazo solo" />}>
          <p className="text-[13px] text-muted">
            Cuando alguien se baja de un partido armado o no contesta a tiempo, avisamos a jugadores del club de la misma categoría. El primero que confirma entra. Nadie del mostrador tiene que llamar.
          </p>
          {!enabled && <Hint>Apagado: si alguien se baja, solo les avisamos a los demás jugadores del partido.</Hint>}
        </Card>

        <Card title="Diferencia de categoría permitida">
          <div className={`grid grid-cols-2 gap-2 ${enabled ? '' : 'pointer-events-none opacity-50'}`}>
            {([1, 2] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={maxGap === g}
                onClick={() => setMaxGap(g)}
                className={`h-11 rounded-xl border text-sm font-semibold cursor-pointer ${maxGap === g ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:bg-mist'}`}
              >
                {g} {g === 1 ? 'categoría' : 'categorías'}
              </button>
            ))}
          </div>
          <Hint>Entre el más alto y el más bajo de los 4. Si un jugador pidió menos en su perfil, vale lo que pidió él.</Hint>
        </Card>

        <Card title="Llenar turnos libres" action={<span className="rounded-full bg-mist px-2.5 py-1 text-xs font-semibold text-muted">Próximamente</span>}>
          <p className="text-[13px] text-muted">Invitar a armar partido en canchas vacías de hoy y mañana, en las franjas que elijas. Llega en la próxima versión.</p>
        </Card>
      </div>

      <Card title={`Este mes · ${monthName}`}>
        <p className="font-display text-3xl font-bold text-ink tabular-nums">{formatUYU(summary.total)}</p>
        <p className="text-sm font-semibold text-emerald-700">recuperados con "Falta uno"</p>
        <ul className="mt-4 divide-y divide-[#eef5f5] text-[13.5px]">
          <li className="flex justify-between py-2.5">
            <span className="text-ink">{plural(summary.replaced.length, 'reemplazo', 'reemplazos')}</span>
            <span className="font-semibold tabular-nums text-ink">{formatUYU(summary.sumReplaced)}</span>
          </li>
          {summary.filled.length > 0 && (
            <li className="flex justify-between py-2.5">
              <span className="text-ink">{plural(summary.filled.length, 'turno libre lleno', 'turnos libres llenos')}</span>
              <span className="font-semibold tabular-nums text-ink">{formatUYU(summary.sumFilled)}</span>
            </li>
          )}
          <li className="flex justify-between py-2.5">
            <span className="text-ink">{plural(summary.saved.length, 'partido que se habría caído', 'partidos que se habrían caído')}</span>
            <span className="text-muted">se jugaron</span>
          </li>
        </ul>
        {summary.pending.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {plural(summary.pending.length, 'reemplazo todavía no jugado', 'reemplazos todavía no jugados')}: se suman cuando pase el partido.
          </p>
        )}
        <Hint>Cuenta solo los lugares que se llenaron por la app y que se jugaron. Si la reserva se cancela o alguien falta, no se suma.</Hint>
      </Card>
    </div>
  );
};

const hourOptions = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const ClubAdminView: React.FC<ClubAdminViewProps> = ({ club, courts, memberships, bookings, proposedMatches, tournaments, payments, userProfile, onToast }) => {
  const ops = useClubOps(club.id);
  const clientes = useClientesData(club.id);
  const [section, setSection] = useState<Section>('courts');
  const today = getTodayISO();
  const staff = { uid: userProfile.uid, name: userProfile.displayName };
  // Dueño del club (o plataforma con el mail listado): baja la planilla de clientes y borra datos
  const isOwner = club.ownerUid === userProfile.uid || (import.meta.env.VITE_PLATFORM_OWNER_EMAILS || '').toLowerCase().split(',').map((s: string) => s.trim()).includes((auth.currentUser?.email || '').toLowerCase());
  const [busy, setBusy] = useState(false);

  // Configuración del club (se guarda con "Guardar cambios")
  const [clubName, setClubName] = useState(club.name);
  const [primaryColor, setPrimaryColor] = useState(club.primaryColor);
  const [openHour, setOpenHour] = useState(club.openHour);
  const [closeHour, setCloseHour] = useState(club.closeHour);
  const [slotDuration, setSlotDuration] = useState(club.slotDurationMinutes || 90);
  const [basePrice, setBasePrice] = useState(club.basePrice);
  const [nightFrom, setNightFrom] = useState(club.nightFromHour);
  const [nightPrice, setNightPrice] = useState(club.nightPrice);
  const [weekendPrice, setWeekendPrice] = useState(club.weekendPrice);
  const [cancelHours, setCancelHours] = useState(club.cancellationHours);
  const [maxNoShows, setMaxNoShows] = useState(club.maxNoShowsBeforeBlock);
  const [mpEnabled, setMpEnabled] = useState(club.mpEnabled);
  const [mpMode, setMpMode] = useState<'full' | 'deposit'>(club.mpMode);
  const [mpDeposit, setMpDeposit] = useState(club.mpDepositPercent);
  const [fillEnabled, setFillEnabled] = useState(club.fillEnabled !== false);
  const [fillMaxGap, setFillMaxGap] = useState<1 | 2>(club.fillMaxGap ?? 1);

  const dirty =
    clubName !== club.name ||
    primaryColor !== club.primaryColor ||
    openHour !== club.openHour ||
    closeHour !== club.closeHour ||
    slotDuration !== (club.slotDurationMinutes || 90) ||
    basePrice !== club.basePrice ||
    nightFrom !== club.nightFromHour ||
    nightPrice !== club.nightPrice ||
    weekendPrice !== club.weekendPrice ||
    cancelHours !== club.cancellationHours ||
    maxNoShows !== club.maxNoShowsBeforeBlock ||
    mpEnabled !== club.mpEnabled ||
    mpMode !== club.mpMode ||
    mpDeposit !== club.mpDepositPercent ||
    fillEnabled !== (club.fillEnabled !== false) ||
    fillMaxGap !== (club.fillMaxGap ?? 1);

  const previewSlots = useMemo(
    () => generateDaySlots({ ...club, openHour, closeHour, slotDurationMinutes: slotDuration }),
    [club, openHour, closeHour, slotDuration]
  );

  const saveConfig = async () => {
    if (!clubName.trim()) {
      onToast('El club necesita un nombre.');
      return;
    }
    if (closeHour <= openHour) {
      onToast('La hora de cierre tiene que ser después de la de apertura.');
      return;
    }
    setBusy(true);
    try {
      await updateClubSettings(club.id, {
        name: clubName.trim(),
        primaryColor,
        openHour,
        closeHour,
        slotDurationMinutes: slotDuration,
        basePrice,
        nightFromHour: nightFrom,
        nightPrice,
        weekendPrice,
        cancellationHours: cancelHours,
        maxNoShowsBeforeBlock: maxNoShows,
        mpEnabled,
        mpMode,
        mpDepositPercent: mpDeposit,
        fillEnabled,
        fillMaxGap,
      });
      onToast('Cambios guardados.');
    } finally {
      setBusy(false);
    }
  };

  const current = SECTIONS.find((s) => s.id === section)!;
  const showSave = section === 'courts' || section === 'prices' || section === 'fill' || section === 'club';

  return (
    <ClubOpsContext.Provider value={ops}>
    <ClientesContext.Provider value={clientes}>
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      {/* Menú de secciones */}
      <nav aria-label="Secciones de administración" className="-mx-4 mb-5 overflow-x-auto px-4 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0">
        <p className="mb-2 hidden px-3 text-xs font-semibold tracking-wider text-muted uppercase lg:block">Administración</p>
        <div className="flex gap-2 lg:sticky lg:top-28 lg:flex-col lg:gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap cursor-pointer lg:py-2.5 ${
                section === s.id
                  ? 'bg-brand text-white lg:bg-mist lg:text-brand'
                  : 'border border-line bg-white text-muted hover:text-ink lg:border-0 lg:bg-transparent'
              }`}
            >
              <BrandIcon name={s.icon} size={18} className="hidden lg:block" />
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="min-w-0 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Administración del club</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">{current.title}</h1>
            <p className="mt-1 text-sm text-muted">{current.subtitle}</p>
          </div>
          {showSave && (
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={saveConfig}
              className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}
            </button>
          )}
        </div>

        {section === 'courts' && (
          <div className="grid items-start gap-5 xl:grid-cols-[1.25fr_1fr]">
            <CourtsCard club={club} courts={courts} busy={busy} setBusy={setBusy} onToast={onToast} />
            <Card title="Horario y turnos">
              <div className="grid grid-cols-3 gap-3">
                <label className={labelCls}>
                  Abre
                  <select value={openHour} onChange={(e) => setOpenHour(Number(e.target.value))} className={inputCls}>
                    {hourOptions(5, 14).map((h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Cierra
                  <select value={closeHour} onChange={(e) => setCloseHour(Number(e.target.value))} className={inputCls}>
                    {hourOptions(18, 24).map((h) => (
                      <option key={h} value={h}>{h === 24 ? '0:00' : `${h}:00`}</option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>
                  Turno
                  <select value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))} className={inputCls}>
                    {[60, 90, 120].map((m) => (
                      <option key={m} value={m}>{m} minutos</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-3 text-[13px] text-muted">
                {previewSlots.length} turnos por día y por cancha
                {previewSlots.length > 0 && (
                  <>: {previewSlots.slice(0, 3).map((s) => formatMinutes(s.startMinute)).join(', ')}
                    {previewSlots.length > 3 ? ` … ${formatMinutes(previewSlots[previewSlots.length - 1].startMinute)}` : ''}.</>
                )}
              </p>
              <Hint>Si cambiás el horario, las reservas que ya existen no se mueven.</Hint>
            </Card>
          </div>
        )}

        {section === 'prices' && (
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <Card title="Precio por turno">
              <PriceRow label="De día" detail={`Lunes a viernes, hasta las ${nightFrom}:00`} value={basePrice} onChange={setBasePrice} />
              <PriceRow
                label="De noche"
                detail={
                  <>
                    Lunes a viernes, desde las{' '}
                    <select value={nightFrom} onChange={(e) => setNightFrom(Number(e.target.value))} className="rounded-lg border border-line bg-white px-1.5 py-0.5 text-[12.5px]">
                      {hourOptions(16, 22).map((h) => (
                        <option key={h} value={h}>{h}:00</option>
                      ))}
                    </select>
                  </>
                }
                value={nightPrice}
                onChange={setNightPrice}
              />
              <PriceRow label="Fin de semana" detail="Sábado y domingo" value={weekendPrice} onChange={setWeekendPrice} />
              <Hint>Precio de la cancha entera. En un partido armado se divide entre los 4.</Hint>
            </Card>

            <div className="space-y-5">
              <Card title="Cancelaciones y faltas">
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelCls}>
                    Cancelación gratis hasta
                    <select value={cancelHours} onChange={(e) => setCancelHours(Number(e.target.value))} className={inputCls}>
                      {[1, 2, 3, 4, 6, 8, 12, 24, 48].map((h) => (
                        <option key={h} value={h}>{h} {h === 1 ? 'hora' : 'horas'} antes</option>
                      ))}
                    </select>
                  </label>
                  <label className={labelCls}>
                    Bloquear después de
                    <select value={maxNoShows} onChange={(e) => setMaxNoShows(Number(e.target.value))} className={inputCls}>
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                        <option key={n} value={n}>{n} {n === 1 ? 'falta' : 'faltas'}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <Hint>Las faltas las marca el encargado en el Mostrador cuando alguien no viene.</Hint>
              </Card>

              <DepositCard club={club} onToast={onToast} />

              <Card title="Mercado Pago" action={<Toggle on={mpEnabled} onChange={setMpEnabled} label="Activar Mercado Pago" />}>
                <p className="text-[13px] text-muted">
                  La reserva es gratis y se paga en el club. Si lo activás, el jugador también puede pagar por Mercado Pago y el dinero le llega directo al club.
                </p>
                {mpEnabled && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <label className={labelCls}>
                      Qué cobra
                      <select value={mpMode} onChange={(e) => setMpMode(e.target.value as 'full' | 'deposit')} className={inputCls}>
                        <option value="deposit">Una seña</option>
                        <option value="full">El turno entero</option>
                      </select>
                    </label>
                    {mpMode === 'deposit' && (
                      <label className={labelCls}>
                        Seña
                        <select value={mpDeposit} onChange={(e) => setMpDeposit(Number(e.target.value))} className={inputCls}>
                          {[10, 20, 25, 30, 40, 50].map((p) => (
                            <option key={p} value={p}>{p}% del turno</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
                <Hint>Conectar la cuenta de Mercado Pago del club todavía no está disponible: por ahora el cobro online es de prueba.</Hint>
              </Card>
            </div>
          </div>
        )}

        {section === 'fill' && (
          <FillSection club={club} enabled={fillEnabled} setEnabled={setFillEnabled} maxGap={fillMaxGap} setMaxGap={setFillMaxGap} />
        )}

        {section === 'members' && <MembersCard club={club} memberships={memberships} userProfile={userProfile} onToast={onToast} />}

        {section === 'tournaments' && (
          <TournamentsSection club={club} courts={courts} memberships={memberships} tournaments={tournaments} userProfile={userProfile} busy={busy} setBusy={setBusy} onToast={onToast} />
        )}

        {section === 'cash' && (
          <div className="space-y-5">
            <CashDaysCard />
            <Libro club={club} bookings={bookings} matches={proposedMatches} staff={staff} today={today} onToast={onToast} />
          </div>
        )}

        {section === 'clients' && (
          <div className="max-w-3xl">
            <ClientsPanel club={club} memberships={memberships} bookings={bookings} matches={proposedMatches} payments={ops.allPayments} consumptions={ops.consumptions} staff={staff} isOwner={isOwner} today={today} nowMinute={new Date().getHours() * 60 + new Date().getMinutes()} closedToday={ops.cashDays.find((d) => d.id === today)?.status === 'closed'} onToast={onToast} />
          </div>
        )}

        {section === 'numbers' && <Numeros club={club} courts={courts} bookings={bookings} matches={proposedMatches} memberships={memberships} staff={staff} isOwner={isOwner} today={today} onToast={onToast} />}

        {section === 'packs' && <CuponerasAdmin club={club} today={today} onToast={onToast} />}

        {section === 'cantina' && <CantinaAdmin club={club} onToast={onToast} />}

        {section === 'fixed' && <FixedAdmin club={club} courts={courts} bookings={bookings} userProfile={userProfile} onToast={onToast} />}

        {section === 'report' && (
          <MonthlyReportAdmin club={club} courts={courts} bookings={bookings} matches={proposedMatches} memberships={memberships} userProfile={userProfile} onToast={onToast} />
        )}

        {section === 'club' && (
          <Card className="max-w-xl">
            <label className={labelCls}>
              Nombre del club en la app
              <input value={clubName} onChange={(e) => setClubName(e.target.value)} className={inputCls} />
            </label>
            <div className="mt-4">
              <p className={labelCls}>Color del club</p>
              <div className="mt-1.5 flex items-center gap-3">
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-white" />
                <span className="text-sm text-muted tabular-nums">{primaryColor.toUpperCase()}</span>
              </div>
            </div>
            <p className="mt-4 text-[13px] text-muted">{club.address}{club.neighborhood ? ` · ${club.neighborhood}` : ''} · {club.city}</p>
          </Card>
        )}
      </div>
    </div>
    </ClientesContext.Provider>
    </ClubOpsContext.Provider>
  );
};

// ---------- Secciones ----------

const PriceRow: React.FC<{ label: string; detail: React.ReactNode; value: number; onChange: (n: number) => void }> = ({ label, detail, value, onChange }) => (
  <div className="grid grid-cols-[1fr_130px] items-center gap-3 border-t border-[#eef5f5] py-3 first:border-0 first:pt-0">
    <div>
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="text-[12.5px] text-muted">{detail}</p>
    </div>
    <label className="flex items-center rounded-xl border border-line bg-white px-3">
      <span className="text-sm text-muted">$</span>
      <input
        type="number"
        min={0}
        step={50}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        aria-label={`Precio ${label}`}
        className="w-full bg-transparent py-2.5 pl-1.5 text-sm text-ink tabular-nums outline-none"
      />
    </label>
  </div>
);

const courtLabel = (c: { roof: RoofType; surface: SurfaceType; hasLights: boolean }) =>
  `${c.roof === 'techada' ? 'Techada' : 'Aire libre'} · ${c.surface === 'cristal' ? 'cristal' : 'muro'} · ${c.hasLights ? 'con luz' : 'sin luz'}`;

const CourtsCard: React.FC<{ club: Club; courts: Court[]; busy: boolean; setBusy: (b: boolean) => void; onToast: (m: string) => void }> = ({ club, courts, busy, setBusy, onToast }) => {
  const [editing, setEditing] = useState<Court | 'new' | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={`Canchas (${courts.length})`}
      action={
        <button type="button" onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-xl bg-mist px-3.5 py-2 text-sm font-semibold text-brand hover:bg-emerald-100 cursor-pointer">
          <Plus className="h-4 w-4" /> Agregar cancha
        </button>
      }
    >
      {courts.length === 0 && <p className="text-sm text-muted">Todavía no cargaste canchas.</p>}
      <ul>
        {courts.map((ct) => (
          <li key={ct.id} className="flex items-center gap-3 border-t border-[#eef5f5] py-3 first:border-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mist text-brand">
              <BrandIcon name={ct.roof === 'techada' ? 'techada' : 'descubierta'} size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{ct.name}</span>
              <span className="block text-[12.5px] text-muted">{courtLabel(ct)}</span>
            </span>
            <span className="hidden text-[12.5px] text-muted sm:inline">{ct.active ? 'Habilitada' : 'En mantenimiento'}</span>
            <Toggle
              on={ct.active}
              disabled={busy}
              label={ct.active ? `Deshabilitar ${ct.name}` : `Habilitar ${ct.name}`}
              onChange={(v) => run(() => updateClubCourt(club.id, ct.id, { active: v }), v ? `${ct.name} habilitada.` : `${ct.name} en mantenimiento.`)}
            />
            <button type="button" onClick={() => setEditing(ct)} aria-label={`Editar ${ct.name}`} className="rounded-lg p-2 text-muted hover:bg-mist cursor-pointer">
              <Pencil className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <Hint>Una cancha en mantenimiento no aparece para reservar ni para armar partidos. Las reservas que ya tenía siguen en el Mostrador.</Hint>

      {editing && (
        <CourtModal
          court={editing === 'new' ? null : editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            run(async () => {
              if (editing === 'new') {
                await addClubCourt({ club, currentCourtsCount: courts.length, ...data });
              } else {
                await updateClubCourt(club.id, editing.id, data);
              }
              setEditing(null);
            }, editing === 'new' ? `${data.name} agregada.` : 'Cancha actualizada.')
          }
          onDelete={
            editing === 'new'
              ? undefined
              : () =>
                  run(async () => {
                    await removeClubCourt(club, editing.id, courts.length);
                    setEditing(null);
                  }, `${editing.name} eliminada.`)
          }
        />
      )}
    </Card>
  );
};

const CourtModal: React.FC<{
  court: Court | null;
  busy: boolean;
  onClose: () => void;
  onSave: (d: { name: string; roof: RoofType; surface: SurfaceType; hasLights: boolean }) => void;
  onDelete?: () => void;
}> = ({ court, busy, onClose, onSave, onDelete }) => {
  const [name, setName] = useState(court?.name ?? '');
  const [roof, setRoof] = useState<RoofType>(court?.roof ?? 'techada');
  const [surface, setSurface] = useState<SurfaceType>(court?.surface ?? 'cristal');
  const [hasLights, setHasLights] = useState(court?.hasLights ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const choice = <T extends string,>(value: T, set: (v: T) => void, options: [T, string, BrandIconName][]) => (
    <div className="mt-1.5 grid grid-cols-2 gap-2">
      {options.map(([v, label, icon]) => (
        <button
          key={v}
          type="button"
          onClick={() => set(v)}
          className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold cursor-pointer ${
            value === v ? 'border-2 border-emerald-600 bg-emerald-50 text-brand' : 'border-line bg-white text-ink'
          }`}
        >
          <BrandIcon name={icon} size={18} /> {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave({ name: name.trim(), roof, surface, hasLights });
        }}
        className="w-full max-w-md rounded-t-3xl border border-line bg-white p-6 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between">
          <h3 className="font-display text-lg font-bold text-ink">{court ? `Editar ${court.name}` : 'Agregar cancha'}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className={`${labelCls} mt-4`}>
          Nombre
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cancha 5" className={inputCls} />
        </label>
        <p className={`${labelCls} mt-4`}>Techo</p>
        {choice<RoofType>(roof, setRoof, [['techada', 'Techada', 'techada'], ['aire_libre', 'Aire libre', 'descubierta']])}
        <p className={`${labelCls} mt-4`}>Paredes</p>
        {choice<SurfaceType>(surface, setSurface, [['cristal', 'Cristal', 'cristal'], ['muro', 'Muro', 'muro']])}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-mist px-3.5 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <BrandIcon name="luz" size={18} /> Tiene luz
          </span>
          <Toggle on={hasLights} onChange={setHasLights} label="Tiene luz" />
        </div>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-ink hover:bg-mist cursor-pointer">
            Volver
          </button>
          <button type="submit" disabled={busy || !name.trim()} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer">
            {court ? 'Guardar' : 'Agregar cancha'}
          </button>
        </div>
        {onDelete && (
          <div className="mt-4 text-center text-[13px] font-semibold">
            {confirmDelete ? (
              <span className="text-muted">
                ¿Eliminar la cancha para siempre?{' '}
                <button type="button" disabled={busy} onClick={onDelete} className="text-red-700 hover:underline cursor-pointer">Sí, eliminar</button>{' '}
                <button type="button" onClick={() => setConfirmDelete(false)} className="hover:underline cursor-pointer">No</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-red-700 hover:underline cursor-pointer">
                <Trash2 className="h-4 w-4" /> Eliminar cancha
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
};

const MembersCard: React.FC<{ club: Club; memberships: ClubMembership[]; userProfile: UserProfile; onToast: (m: string) => void }> = ({ club, memberships, userProfile, onToast }) => {
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'staff' | 'blocked'>('all');
  const list = memberships
    .filter((m) => m.displayName.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((m) => (roleFilter === 'staff' ? m.role !== 'player' : roleFilter === 'blocked' ? m.blocked : true))
    .sort((a, b) => Number(b.role !== 'player') - Number(a.role !== 'player') || a.displayName.localeCompare(b.displayName));

  const selectCls = 'rounded-lg border border-line bg-white px-2 py-1.5 text-[13px] text-ink';

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 sm:w-72">
          <Search className="h-4 w-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </label>
        <div className="flex rounded-xl bg-mist p-1">
          {(
            [
              ['all', `Todos (${memberships.length})`],
              ['staff', 'Encargados'],
              ['blocked', `Bloqueados (${memberships.filter((m) => m.blocked).length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRoleFilter(id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold cursor-pointer ${roleFilter === id ? 'bg-white text-ink shadow-xs' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-2 pr-3 font-semibold">Persona</th>
              <th className="py-2 pr-3 font-semibold">Rol</th>
              <th className="py-2 pr-3 font-semibold">Categoría</th>
              <th className="py-2 pr-3 font-semibold">Faltas</th>
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const isOwner = m.uid === club.ownerUid;
              const isMe = m.uid === userProfile.uid;
              const near = !m.blocked && m.noShowCount > 0 && m.noShowCount >= club.maxNoShowsBeforeBlock - 1;
              return (
                <tr key={m.uid} className="border-b border-[#eef5f5] last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap">
                    <span className="mr-2.5 inline-grid h-8 w-8 place-items-center rounded-full bg-mist align-middle text-xs font-bold text-brand">
                      {m.displayName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                    <span className="font-semibold text-ink">{m.displayName}</span>
                    {isOwner && <span className="ml-2 text-xs text-muted">dueño</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <select
                      value={m.role}
                      disabled={isOwner || isMe}
                      onChange={(e) =>
                        updateMembershipByAdmin(club.id, m.uid, { role: e.target.value as ClubMembership['role'] }).then(() =>
                          onToast(`${m.displayName}: ahora es ${e.target.value === 'staff' ? 'encargado' : e.target.value === 'cantina' ? 'de cantina' : e.target.value === 'admin' ? 'administrador' : 'jugador'}.`)
                        )
                      }
                      className={`${selectCls} disabled:opacity-60`}
                    >
                      <option value="player">Jugador</option>
                      <option value="staff">Encargado</option>
                      <option value="cantina">Cantina</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td className="py-2.5 pr-3">
                    <select
                      value={m.category}
                      onChange={(e) =>
                        updateMembershipByAdmin(club.id, m.uid, { category: Number(e.target.value) }).then(() =>
                          onToast(`Categoría de ${m.displayName}: ${formatCategory(Number(e.target.value))}.`)
                        )
                      }
                      className={selectCls}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                        <option key={c} value={c}>{formatCategory(c)}</option>
                      ))}
                    </select>
                  </td>
                  <td className={`py-2.5 pr-3 tabular-nums ${m.blocked ? 'font-bold text-red-700' : near ? 'font-bold text-wait' : 'text-ink'}`}>
                    {m.noShowCount} de {club.maxNoShowsBeforeBlock}
                  </td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    {!isOwner && !isMe && (
                      <button
                        type="button"
                        onClick={() =>
                          updateMembershipByAdmin(club.id, m.uid, { blocked: !m.blocked, noShowCount: m.blocked ? 0 : m.noShowCount }).then(() =>
                            onToast(m.blocked ? `${m.displayName} desbloqueado. Sus faltas vuelven a cero.` : `${m.displayName} bloqueado.`)
                          )
                        }
                        className={`rounded-full px-3 py-1 text-xs font-semibold cursor-pointer ${
                          m.blocked ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'border border-line text-muted hover:bg-mist'
                        }`}
                      >
                        {m.blocked ? 'Bloqueado · desbloquear' : 'Bloquear'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted">No hay nadie con ese filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Hint>Los encargados ven el Mostrador; los administradores, además, esta pantalla. La categoría la declara cada jugador y el club la puede corregir.</Hint>
    </Card>
  );
};

const TournamentsSection: React.FC<{
  club: Club;
  courts: Court[];
  memberships: ClubMembership[];
  tournaments: Tournament[];
  userProfile: UserProfile;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onToast: (m: string) => void;
}> = ({ club, courts, memberships, tournaments, userProfile, busy, setBusy, onToast }) => {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState(addDaysISO(getTodayISO(), 7));
  const [end, setEnd] = useState(addDaysISO(getTodayISO(), 9));
  const [cats, setCats] = useState<number[]>([5, 6]);
  const [maxPairs, setMaxPairs] = useState(16);
  const [fee, setFee] = useState(1400);
  const [format, setFormat] = useState<TournamentFormat>('groups_knockout');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || cats.length === 0) return;
    setBusy(true);
    try {
      await createTournament({
        club,
        memberships,
        creatorUid: userProfile.uid,
        name: name.trim(),
        startDate: start,
        endDate: end,
        categories: [...cats].sort((a, b) => a - b),
        maxPairs,
        entryFee: fee,
        format,
      });
      onToast('Torneo publicado. Se avisó a los jugadores de esas categorías.');
      setName('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...tournaments].sort((a, b) => (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0) || a.startDate.localeCompare(b.startDate));
  const fmtDate = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d}/${m}`;
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_400px]">
      <Card
        title={`Torneos del club (${tournaments.length})`}
        action={
          !creating && (
            <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-mist px-3.5 py-2 text-sm font-semibold text-brand hover:bg-emerald-100 cursor-pointer xl:hidden">
              <Plus className="h-4 w-4" /> Crear torneo
            </button>
          )
        }
      >
        {sorted.length === 0 && <p className="text-sm text-muted">Todavía no hay torneos.</p>}
        <div className="space-y-3">
          {sorted.map((t) => {
            const confirmed = t.pairs.filter((p) => p.partnerAccepted).length;
            const st = STATUS_LABEL[t.status];
            const done = t.matches.filter((m) => m.status === 'completed').length;
            return (
              <div key={t.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {fmtDate(t.startDate)} al {fmtDate(t.endDate)} · {t.categories.map(formatCategory).join(' y ')} ·{' '}
                      {t.format === 'knockout' ? 'eliminación directa' : 'grupos y eliminación'} · {formatUYU(t.entryFee)} por pareja
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
                </div>
                {t.status === 'registration_open' ? (
                  <>
                    <div className="mt-3 h-1.5 rounded-full bg-mist">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, (confirmed / t.maxPairs) * 100)}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <span className="text-muted">
                        {confirmed} de {t.maxPairs} parejas confirmadas
                        {t.pairs.length > confirmed ? ` · ${t.pairs.length - confirmed} esperando a su compañero` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={busy || confirmed < 2}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await closeRegistrationAndDraw({ club, tournament: t, courts, adminUid: userProfile.uid });
                            onToast('Inscripción cerrada. Se sorteó el cuadro y se reservaron las canchas.');
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="font-semibold text-emerald-700 hover:underline disabled:text-muted disabled:no-underline cursor-pointer"
                      >
                        Cerrar inscripción y sortear cuadro
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-[12.5px] text-muted">
                    {confirmed} parejas · {done} de {t.matches.length} partidos jugados
                    {t.status !== 'completed' ? ' · los resultados se cargan en el Mostrador' : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <form onSubmit={create} className={`${creating ? '' : 'hidden xl:block'}`}>
        <Card title="Crear torneo">
          <label className={labelCls}>
            Nombre
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Torneo de Verano" className={inputCls} />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Empieza
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>
              Termina
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
            </label>
          </div>
          <p className={`${labelCls} mt-3`}>Categorías que juegan</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => {
              const on = cats.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCats((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                  className={`rounded-lg border py-2 text-[13px] font-semibold cursor-pointer ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}
                >
                  {formatCategory(c)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Cupo
              <select value={maxPairs} onChange={(e) => setMaxPairs(Number(e.target.value))} className={inputCls}>
                {[4, 8, 12, 16, 24, 32].map((n) => (
                  <option key={n} value={n}>{n} parejas</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Inscripción por pareja
              <input type="number" min={0} step={100} value={fee} onChange={(e) => setFee(Math.max(0, Number(e.target.value)))} className={inputCls} />
            </label>
          </div>
          <label className={`${labelCls} mt-3`}>
            Formato
            <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)} className={inputCls}>
              <option value="groups_knockout">Grupos y después eliminación</option>
              <option value="knockout">Eliminación directa</option>
            </select>
          </label>
          <div className="mt-5 flex gap-3">
            {creating && (
              <button type="button" onClick={() => setCreating(false)} className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-ink xl:hidden cursor-pointer">
                Volver
              </button>
            )}
            <button type="submit" disabled={busy || !name.trim() || cats.length === 0} className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer">
              Publicar y avisar a los jugadores
            </button>
          </div>
          <Hint>Les llega un aviso a los jugadores de las categorías elegidas. Se inscriben en pareja desde la app.</Hint>
        </Card>
      </form>
    </div>
  );
};

const CashSection: React.FC<{ payments: PaymentRecord[] }> = ({ payments }) => {
  const entries = payments.filter((p) => p.kind !== 'platform_subscription');
  const sum = (f: (p: PaymentRecord) => boolean) => entries.filter(f).reduce((a, p) => a + p.amount, 0);
  const tiles = [
    { t: 'Total', v: sum(() => true) },
    { t: 'Efectivo', v: sum((p) => p.method === 'efectivo') },
    { t: 'Transferencia y tarjeta', v: sum((p) => p.method === 'transferencia' || p.method === 'debito_club') },
    { t: 'Mercado Pago', v: sum((p) => p.method === 'mercadopago') },
  ];
  const dateOf = (v: unknown) => {
    const d = v && typeof v === 'object' && 'toDate' in v ? (v as { toDate: () => Date }).toDate() : null;
    return d ? `${d.getDate()}/${d.getMonth() + 1} ${formatMinutes(d.getHours() * 60 + d.getMinutes())}` : '';
  };
  const sorted = [...entries].sort((a, b) => {
    const ta = a.createdAt && typeof a.createdAt === 'object' && 'toMillis' in a.createdAt ? (a.createdAt as { toMillis: () => number }).toMillis() : 0;
    const tb = b.createdAt && typeof b.createdAt === 'object' && 'toMillis' in b.createdAt ? (b.createdAt as { toMillis: () => number }).toMillis() : 0;
    return tb - ta;
  });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.t} className="rounded-2xl border border-line bg-white px-5 py-4">
            <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">{x.t}</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{formatUYU(x.v)}</p>
          </div>
        ))}
      </div>
      <Card title="Movimientos">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 pr-3 font-semibold">Fecha</th>
                <th className="py-2 pr-3 font-semibold">Quién</th>
                <th className="py-2 pr-3 font-semibold">Concepto</th>
                <th className="py-2 pr-3 font-semibold">Medio</th>
                <th className="py-2 text-right font-semibold">Monto</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">Todavía no hay movimientos.</td>
                </tr>
              )}
              {sorted.map((p) => (
                <tr key={p.id} className="border-b border-[#eef5f5] last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-muted tabular-nums">{dateOf(p.createdAt)}</td>
                  <td className="py-2.5 pr-3 font-semibold text-ink">{p.payerName}</td>
                  <td className="py-2.5 pr-3 text-muted">{KIND_LABEL[p.kind] ?? p.kind}</td>
                  <td className="py-2.5 pr-3 text-muted">{payMethodLabel(p.method)}</td>
                  <td className={`py-2.5 text-right font-semibold tabular-nums ${p.amount < 0 ? 'text-red-700' : 'text-ink'}`}>{formatUYU(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
