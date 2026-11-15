import React, { useMemo, useState } from 'react';
import { Building2, CreditCard, MapPin, Plus } from 'lucide-react';
import type { Club, UserProfile } from '../types/padel';
import { formatUYU } from '../lib/padelUtils';
import { onboardNewClub, processClubSubscriptionCharge } from '../services/firestoreService';
import { MercadoPagoModal } from './MercadoPagoModal';

interface PlatformOwnerViewProps {
  clubs: Club[];
  activeClubBookingsCount: number;
  activeClubMatchesCount: number;
  activeClubTournamentsCount: number;
  activeClubId?: string;
  userProfile: UserProfile;
  onSelectClub: (clubId: string) => void;
  onToast: (msg: string) => void;
}

export const PlatformOwnerView: React.FC<PlatformOwnerViewProps> = ({
  clubs,
  activeClubBookingsCount,
  activeClubMatchesCount,
  activeClubTournamentsCount,
  activeClubId,
  userProfile,
  onSelectClub,
  onToast,
}) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('Montevideo');
  const [lat, setLat] = useState(-34.9011);
  const [lng, setLng] = useState(-56.1645);
  const [primaryColor, setPrimaryColor] = useState('#059669');
  const [courtCount, setCourtCount] = useState(4);
  const [pricePerCourt, setPricePerCourt] = useState(1900);
  const [busy, setBusy] = useState(false);

  const [debitTarget, setDebitTarget] = useState<Club | null>(null);

  const metrics = useMemo(() => {
    const totalCourts = clubs.reduce((acc, c) => acc + c.courtCount, 0);
    const activeMRR = clubs
      .filter((c) => c.subscriptionStatus === 'active')
      .reduce((acc, c) => acc + c.courtCount * c.monthlyPricePerCourt, 0);
    const trialCount = clubs.filter((c) => c.subscriptionStatus === 'trial').length;
    return { totalCourts, activeMRR, trialCount };
  }, [clubs]);

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;
    setBusy(true);
    try {
      const created = await onboardNewClub({
        ownerUid: userProfile.uid,
        ownerName: userProfile.displayName,
        name: name.trim(),
        address: address.trim(),
        neighborhood: neighborhood.trim() || 'Centro',
        city: city.trim() || 'Montevideo',
        lat,
        lng,
        primaryColor,
        courtCount,
        monthlyPricePerCourt: pricePerCourt,
      });
      setName('');
      setAddress('');
      setNeighborhood('');
      onSelectClub(created.id);
      onToast(`Club "${created.name}" dado de alta con 1 mes de prueba gratis.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium text-emerald-700">
          Consola SaaS · Armá Partido (armapartido.com)
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
          Dueño de la plataforma
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Alta de clubes, ubicación georreferenciada para futura red inter-clubes, prueba gratis de 30 días y débito mensual por cantidad de canchas.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Clubes en plataforma</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">{clubs.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Canchas totales</p>
          <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">{metrics.totalCourts}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Cuota mensual activa</p>
          <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {formatUYU(metrics.activeMRR)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Clubes en prueba gratis</p>
          <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">{metrics.trialCount}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Onboard New Club */}
        <form onSubmit={handleOnboard} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2 className="h-4 w-4 text-emerald-600" />
            <h2 className="font-display text-lg font-bold text-slate-900">Dar de alta club</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Nombre del club</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Parque Batlle Pádel"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Dirección</label>
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Av. Italia 3120"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Barrio / Ciudad</label>
              <input
                type="text"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Parque Batlle"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Latitud (mapa)</label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Longitud (mapa)</label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => setLng(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Canchas iniciales</label>
              <input
                type="number"
                min={1}
                max={20}
                value={courtCount}
                onChange={(e) => setCourtCount(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Cuota por cancha (UYU)</label>
              <input
                type="number"
                value={pricePerCourt}
                onChange={(e) => setPricePerCourt(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">Color de marca del club</span>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-8 w-12 cursor-pointer rounded border border-slate-200"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {busy ? 'Creando club...' : 'Activar prueba gratis (1 mes)'}
          </button>
        </form>

        {/* Club Usage & Billing Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Clubes activos, uso y suscripción mensual
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Cuota mensual calculada por cantidad de canchas con débito automático Mercado Pago.
          </p>

          <div className="mt-4 divide-y divide-slate-100">
            {clubs.map((c) => {
              const monthlyTotal = c.courtCount * c.monthlyPricePerCourt;
              const isSelected = c.id === activeClubId;
              return (
                <div key={c.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: c.primaryColor }}
                      />
                      <button
                        type="button"
                        onClick={() => onSelectClub(c.id)}
                        className="text-sm font-bold text-slate-900 hover:underline cursor-pointer"
                      >
                        {c.name}
                      </button>
                      <span className="text-xs text-slate-500">
                        {c.subscriptionStatus === 'trial'
                          ? `Prueba gratis hasta ${c.trialEndsAt || '30 días'}`
                          : 'Suscripción activa'}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" />
                      {c.address} ({c.lat.toFixed(4)}, {c.lng.toFixed(4)})
                    </p>
                    {isSelected && (
                      <p className="mt-1 font-mono text-[11px] text-emerald-700 tabular-nums">
                        Uso en vivo: {activeClubBookingsCount} reservas · {activeClubMatchesCount} partidos armados · {activeClubTournamentsCount} torneos
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                        {formatUYU(monthlyTotal)}/mes
                      </p>
                      <p className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {c.courtCount} canchas × {formatUYU(c.monthlyPricePerCourt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDebitTarget(c)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 cursor-pointer whitespace-nowrap"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      {c.subscriptionStatus === 'trial' ? 'Activar débito MP' : 'Cobrar cuota'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <MercadoPagoModal
        open={!!debitTarget}
        title={debitTarget ? `Débito mensual · ${debitTarget.name}` : ''}
        subtitle={
          debitTarget
            ? `${debitTarget.courtCount} canchas × ${formatUYU(debitTarget.monthlyPricePerCourt)} (sin comisión por reservas)`
            : ''
        }
        amount={debitTarget ? debitTarget.courtCount * debitTarget.monthlyPricePerCourt : 0}
        receiverName="Armá Partido Plataforma"
        onConfirm={async () => {
          if (!debitTarget) return;
          await processClubSubscriptionCharge(debitTarget, userProfile.uid);
          onToast(`Suscripción mensual cobrada a ${debitTarget.name}.`);
        }}
        onClose={() => setDebitTarget(null)}
      />
    </div>
  );
};
