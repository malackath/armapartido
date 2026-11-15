import React, { useMemo, useState } from 'react';
import { Banknote, Palette, Plus, Settings, Trash2, Trophy, Users } from 'lucide-react';
import type {
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
import {
  addDaysISO,
  formatCategory,
  formatUYU,
  getTodayISO,
  type PlayerLevelSummary,
} from '../lib/padelUtils';
import {
  addClubCourt,
  closeRegistrationAndDraw,
  createTournament,
  removeClubCourt,
  updateClubSettings,
  updateMembershipByAdmin,
} from '../services/firestoreService';
import { ClubRankingSection } from './ClubRankingSection';

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

export const ClubAdminView: React.FC<ClubAdminViewProps> = ({
  club,
  courts,
  memberships,
  bookings,
  proposedMatches,
  tournaments,
  payments,
  playerMatchResults,
  clubMatchResults,
  playerLevelsMap,
  userProfile,
  onToast,
}) => {
  const [section, setSection] = useState<'config' | 'courts' | 'tournaments' | 'cash' | 'members' | 'ranking'>('config');
  const [busy, setBusy] = useState(false);

  // Club settings form state
  const [clubName, setClubName] = useState(club.name);
  const [primaryColor, setPrimaryColor] = useState(club.primaryColor);
  const [openHour, setOpenHour] = useState(club.openHour);
  const [closeHour, setCloseHour] = useState(club.closeHour);
  const [slotDuration, setSlotDuration] = useState(club.slotDurationMinutes);
  const [basePrice, setBasePrice] = useState(club.basePrice);
  const [nightFrom, setNightFrom] = useState(club.nightFromHour);
  const [nightPrice, setNightPrice] = useState(club.nightPrice);
  const [weekendPrice, setWeekendPrice] = useState(club.weekendPrice);
  const [cancelHours, setCancelHours] = useState(club.cancellationHours);
  const [maxNoShows, setMaxNoShows] = useState(club.maxNoShowsBeforeBlock);
  const [mpEnabled, setMpEnabled] = useState(club.mpEnabled);
  const [mpMode, setMpMode] = useState<'full' | 'deposit'>(club.mpMode);
  const [mpDeposit, setMpDeposit] = useState(club.mpDepositPercent);

  // New Court form
  const [courtName, setCourtName] = useState('');
  const [courtRoof, setCourtRoof] = useState<RoofType>('techada');
  const [courtSurface, setCourtSurface] = useState<SurfaceType>('cristal');
  const [courtLights, setCourtLights] = useState(true);

  // New Tournament form
  const [trnName, setTrnName] = useState('');
  const [trnStart, setTrnStart] = useState(addDaysISO(getTodayISO(), 4));
  const [trnEnd, setTrnEnd] = useState(addDaysISO(getTodayISO(), 6));
  const [trnCat, setTrnCat] = useState(5);
  const [trnMaxPairs, setTrnMaxPairs] = useState(8);
  const [trnFee, setTrnFee] = useState(1400);
  const [trnFormat, setTrnFormat] = useState<TournamentFormat>('groups_knockout');

  const cashTotals = useMemo(() => {
    const clubPayments = payments.filter((p) => p.kind !== 'platform_subscription');
    const net = clubPayments.reduce((acc, p) => acc + p.amount, 0);
    const mp = clubPayments
      .filter((p) => p.method === 'mercadopago')
      .reduce((acc, p) => acc + p.amount, 0);
    const counter = clubPayments
      .filter((p) => p.method === 'efectivo' || p.method === 'transferencia')
      .reduce((acc, p) => acc + p.amount, 0);
    return { net, mp, counter, entries: clubPayments };
  }, [payments]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
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
      });
      onToast('Configuración del club actualizada.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courtName.trim()) return;
    setBusy(true);
    try {
      await addClubCourt({
        club,
        currentCourtsCount: courts.length,
        name: courtName.trim(),
        roof: courtRoof,
        surface: courtSurface,
        hasLights: courtLights,
      });
      setCourtName('');
      onToast('Cancha agregada al club.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trnName.trim()) return;
    setBusy(true);
    try {
      await createTournament({
        club,
        memberships,
        creatorUid: userProfile.uid,
        name: trnName.trim(),
        startDate: trnStart,
        endDate: trnEnd,
        categories: [trnCat, Math.min(8, trnCat + 1)],
        maxPairs: trnMaxPairs,
        entryFee: trnFee,
        format: trnFormat,
      });
      setTrnName('');
      onToast('Torneo creado y notificado a las categorías habilitadas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-emerald-700">Administración del club · {club.name}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Panel de gestión del club
          </h1>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1">
          {(
            [
              ['config', 'Marca y Reglas'],
              ['courts', 'Canchas'],
              ['tournaments', 'Torneos'],
              ['cash', 'La Caja'],
              ['members', 'Jugadores y Staff'],
              ['ranking', 'Ranking'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                section === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {section === 'config' && (
        <form onSubmit={handleSaveConfig} className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Palette className="h-4 w-4 text-emerald-600" />
              <h2 className="font-display text-lg font-bold text-slate-900">Marca blanca y horarios</h2>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Nombre visible de la app del club</label>
              <input
                type="text"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Color principal del club</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200"
                />
                <span className="font-mono text-xs text-slate-600">{primaryColor}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Abre (hs)</label>
                <input
                  type="number"
                  min={5}
                  max={14}
                  value={openHour}
                  onChange={(e) => setOpenHour(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cierra (hs)</label>
                <input
                  type="number"
                  min={18}
                  max={24}
                  value={closeHour}
                  onChange={(e) => setCloseHour(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Turno (min)</label>
                <input
                  type="number"
                  min={60}
                  max={120}
                  step={30}
                  value={slotDuration}
                  onChange={(e) => setSlotDuration(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Settings className="h-4 w-4 text-emerald-600" />
              <h2 className="font-display text-lg font-bold text-slate-900">Tarifas, faltas y Mercado Pago</h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Precio base (UYU)</label>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => setBasePrice(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Nocturno desde (hs)</label>
                <input
                  type="number"
                  value={nightFrom}
                  onChange={(e) => setNightFrom(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Precio noche (UYU)</label>
                <input
                  type="number"
                  value={nightPrice}
                  onChange={(e) => setNightPrice(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Precio finde (UYU)</label>
                <input
                  type="number"
                  value={weekendPrice}
                  onChange={(e) => setWeekendPrice(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cancelación gratis (hs antes)</label>
                <input
                  type="number"
                  value={cancelHours}
                  onChange={(e) => setCancelHours(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Faltas para bloqueo</label>
                <input
                  type="number"
                  value={maxNoShows}
                  onChange={(e) => setMaxNoShows(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800">Mercado Pago directo al club activado</span>
                <input
                  type="checkbox"
                  checked={mpEnabled}
                  onChange={(e) => setMpEnabled(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
              </div>
              {mpEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={mpMode}
                    onChange={(e) => setMpMode(e.target.value as 'full' | 'deposit')}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium"
                  >
                    <option value="deposit">Cobrar seña (%)</option>
                    <option value="full">Cobrar turno entero (100%)</option>
                  </select>
                  {mpMode === 'deposit' && (
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={mpDeposit}
                      onChange={(e) => setMpDeposit(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs tabular-nums"
                    />
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
            >
              {busy ? 'Guardando...' : 'Guardar configuración del club'}
            </button>
          </div>
        </form>
      )}

      {section === 'courts' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <form onSubmit={handleAddCourt} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-5">
            <h2 className="font-display text-lg font-bold text-slate-900">Agregar cancha</h2>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Nombre</label>
              <input
                type="text"
                required
                value={courtName}
                onChange={(e) => setCourtName(e.target.value)}
                placeholder="Ej. Cancha 5 · Panorámica"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Techo</label>
                <select
                  value={courtRoof}
                  onChange={(e) => setCourtRoof(e.target.value as RoofType)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="techada">Techada</option>
                  <option value="aire_libre">Al aire libre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Pared</label>
                <select
                  value={courtSurface}
                  onChange={(e) => setCourtSurface(e.target.value as SurfaceType)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="cristal">Cristal</option>
                  <option value="muro">Muro</option>
                </select>
              </div>
            </div>
            <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700">
              <span>Tiene iluminación artificial</span>
              <input
                type="checkbox"
                checked={courtLights}
                onChange={(e) => setCourtLights(e.target.checked)}
                className="h-4 w-4 accent-emerald-600"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Crear cancha
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Canchas configuradas ({courts.length})
            </h2>
            <div className="mt-4 divide-y divide-slate-100">
              {courts.map((ct) => (
                <div key={ct.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{ct.name}</p>
                    <p className="text-xs text-slate-500">
                      {ct.roof === 'techada' ? 'Techada' : 'Al aire libre'} ·{' '}
                      {ct.surface === 'cristal' ? 'Cristal' : 'Muro'} ·{' '}
                      {ct.hasLights ? 'Con luz' : 'Sin luz'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeClubCourt(club, ct.id, courts.length)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    aria-label="Eliminar cancha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'tournaments' && (
        <div className="grid gap-6 lg:grid-cols-12">
          <form onSubmit={handleCreateTournament} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-600" />
              <h2 className="font-display text-lg font-bold text-slate-900">Crear torneo</h2>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Nombre del torneo</label>
              <input
                type="text"
                required
                value={trnName}
                onChange={(e) => setTrnName(e.target.value)}
                placeholder="Ej. Torneo Primavera 5ta"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Inicio</label>
                <input
                  type="date"
                  value={trnStart}
                  onChange={(e) => setTrnStart(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cierre</label>
                <input
                  type="date"
                  value={trnEnd}
                  onChange={(e) => setTrnEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Categoría base</label>
                <select
                  value={trnCat}
                  onChange={(e) => setTrnCat(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                    <option key={c} value={c}>
                      {formatCategory(c)} y {formatCategory(Math.min(8, c + 1))}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cupo parejas</label>
                <input
                  type="number"
                  min={4}
                  max={32}
                  value={trnMaxPairs}
                  onChange={(e) => setTrnMaxPairs(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Inscripción (UYU)</label>
                <input
                  type="number"
                  value={trnFee}
                  onChange={(e) => setTrnFee(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Formato</label>
                <select
                  value={trnFormat}
                  onChange={(e) => setTrnFormat(e.target.value as TournamentFormat)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <option value="groups_knockout">Grupos + Eliminación</option>
                  <option value="knockout">Eliminación directa</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
            >
              Publicar torneo y avisar jugadores
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7 space-y-4">
            <h2 className="font-display text-lg font-bold text-slate-900">Torneos del club</h2>
            {tournaments.map((trn) => (
              <div key={trn.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">{trn.name}</p>
                  <p className="text-xs text-slate-500">
                    {trn.pairs.filter((p) => p.partnerAccepted).length} parejas confirmadas · Estado: {trn.status}
                  </p>
                </div>
                {trn.status === 'registration_open' && (
                  <button
                    type="button"
                    disabled={busy || trn.pairs.filter((p) => p.partnerAccepted).length < 2}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await closeRegistrationAndDraw({
                          club,
                          tournament: trn,
                          courts,
                          adminUid: userProfile.uid,
                        });
                        onToast('Inscripción cerrada, cuadro sorteado y canchas bloqueadas.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Cerrar inscripción y sortear cuadro
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'cash' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Total neto en caja</p>
              <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {formatUYU(cashTotals.net)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Mercado Pago (directo)</p>
              <p className="mt-1 font-mono text-2xl font-bold text-sky-700 tabular-nums">
                {formatUYU(cashTotals.mp)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500">Efectivo y transferencias</p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                {formatUYU(cashTotals.counter)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-3 font-semibold">Detalle / Pagador</th>
                  <th className="px-4 py-3 font-semibold">Concepto</th>
                  <th className="px-4 py-3 font-semibold">Medio</th>
                  <th className="px-4 py-3 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashTotals.entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      Sin movimientos registrados todavía.
                    </td>
                  </tr>
                ) : (
                  cashTotals.entries.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{p.payerName}</td>
                      <td className="px-4 py-3 text-slate-600">{p.kind}</td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{p.method}</td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${p.amount < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {formatUYU(p.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'members' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Users className="h-4 w-4 text-emerald-600" />
            <h2 className="font-display text-lg font-bold text-slate-900">
              Jugadores, corrección de categoría y encargados
            </h2>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4 font-semibold">Persona</th>
                  <th className="py-2.5 pr-4 font-semibold">Rol en el club</th>
                  <th className="py-2.5 pr-4 font-semibold">Categoría</th>
                  <th className="py-2.5 pr-4 font-semibold">Ausencias</th>
                  <th className="py-2.5 font-semibold">Acceso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberships.map((m) => (
                  <tr key={m.uid}>
                    <td className="py-3 pr-4 font-semibold text-slate-900">{m.displayName}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={m.role}
                        onChange={(e) =>
                          updateMembershipByAdmin(club.id, m.uid, {
                            role: e.target.value as ClubMembership['role'],
                          }).then(() => onToast(`Rol actualizado para ${m.displayName}.`))
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        <option value="player">Jugador</option>
                        <option value="staff">Encargado</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        value={m.category}
                        onChange={(e) =>
                          updateMembershipByAdmin(club.id, m.uid, {
                            category: Number(e.target.value),
                          }).then(() => onToast(`Categoría corregida para ${m.displayName}.`))
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                          <option key={c} value={c}>
                            {formatCategory(c)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums text-slate-700">{m.noShowCount}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() =>
                          updateMembershipByAdmin(club.id, m.uid, {
                            blocked: !m.blocked,
                            noShowCount: m.blocked ? 0 : m.noShowCount,
                          }).then(() =>
                            onToast(m.blocked ? `${m.displayName} desbloqueado.` : `${m.displayName} bloqueado.`)
                          )
                        }
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                          m.blocked
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {m.blocked ? 'Bloqueado (Desbloquear)' : 'Activo (Bloquear)'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'ranking' && (
        <ClubRankingSection
          club={club}
          memberships={memberships}
          bookings={bookings}
          proposedMatches={proposedMatches}
          tournaments={tournaments}
          playerMatchResults={playerMatchResults}
          clubMatchResults={clubMatchResults}
          playerLevelsMap={playerLevelsMap}
          userProfile={userProfile}
          onToast={onToast}
        />
      )}
    </div>
  );
};
