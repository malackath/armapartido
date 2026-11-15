/** Datos de caja y cantina del club, piezas de interfaz compartidas y etiquetas. */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { PaymentRecord } from '../../types/padel';
import type { CashDay, Consumption, FixedBooking, MonthlyReport, Product, Recovery } from '../../types/caja';
import { subscribeClubOps } from '../../services/cajaService';
import type { CounterPaymentMethod } from '../../services/firestoreService';

export interface ClubOps {
  ready: boolean;
  products: Product[];
  consumptions: Consumption[];
  cashDays: CashDay[];
  fixed: FixedBooking[];
  recoveries: Recovery[];
  reports: MonthlyReport[];
  allPayments: PaymentRecord[];
}

const EMPTY: ClubOps = { ready: false, products: [], consumptions: [], cashDays: [], fixed: [], recoveries: [], reports: [], allPayments: [] };

/** Se suscribe a productos, consumos, cajas, turnos fijos, recuperados, informes y todos los cobros. */
export function useClubOps(clubId: string | undefined): ClubOps {
  const [ops, setOps] = useState<ClubOps>(EMPTY);
  useEffect(() => {
    if (!clubId) return;
    setOps(EMPTY);
    const set = <K extends keyof ClubOps>(k: K) => (v: ClubOps[K]) => setOps((prev) => ({ ...prev, [k]: v, ready: true }));
    const subs = subscribeClubOps(clubId, {
      onProducts: (v) => set('products')([...v].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))),
      onConsumptions: set('consumptions'),
      onCashDays: set('cashDays'),
      onFixed: set('fixed'),
      onRecoveries: set('recoveries'),
      onReports: set('reports'),
      onAllPayments: set('allPayments'),
    });
    return () => subs.forEach((u) => u());
  }, [clubId]);
  return ops;
}

export const ClubOpsContext = createContext<ClubOps>(EMPTY);
export const useOps = () => useContext(ClubOpsContext);

export const KIND_LABEL: Record<PaymentRecord['kind'], string> = {
  booking_full: 'Turno',
  booking_deposit: 'Seña de turno',
  match_share: 'Parte de partido armado',
  tournament_fee: 'Inscripción a torneo',
  refund: 'Devolución',
  platform_subscription: 'Cuota de la plataforma',
  cantina: 'Cantina',
  retiro: 'Retiro de caja',
  anulacion: 'Anulación',
};

export const PAY_METHODS: { id: CounterPaymentMethod; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'debito_club', label: 'Tarjeta' },
];

export const MethodPicker: React.FC<{ value: CounterPaymentMethod; onChange: (m: CounterPaymentMethod) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-2">
    {PAY_METHODS.map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => onChange(p.id)}
        className={`rounded-xl border py-2.5 text-[13px] font-semibold cursor-pointer ${
          value === p.id ? 'border-2 border-emerald-600 bg-emerald-50 text-brand' : 'border-line bg-white text-ink hover:bg-mist'
        }`}
      >
        {p.label}
      </button>
    ))}
  </div>
);

export const Card: React.FC<{ title?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }> = ({ title, action, className = '', children }) => (
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

export const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-3 rounded-xl bg-[#ecfcfc] px-3.5 py-2.5 text-[12.5px] text-muted">{children}</p>
);

export const Row: React.FC<{ label: React.ReactNode; value: React.ReactNode; strong?: boolean; tone?: 'red' | 'green' }> = ({ label, value, strong, tone }) => (
  <div className={`flex items-baseline justify-between gap-3 border-b border-[#eef5f5] py-2 text-sm last:border-0 ${strong ? 'font-bold text-ink' : 'text-ink'}`}>
    <span className={strong ? '' : 'text-muted'}>{label}</span>
    <span className={`tabular-nums ${tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : ''}`}>{value}</span>
  </div>
);

export const inputCls = 'mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink tabular-nums';
export const labelCls = 'block text-[12.5px] font-semibold text-ink';
export const btnPrimary =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer';
export const btnSecondary =
  'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white py-3 text-sm font-semibold text-ink hover:bg-mist disabled:opacity-50 cursor-pointer';

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
