import React, { useState } from 'react';
import { CheckCircle2, CreditCard, ShieldCheck, X } from 'lucide-react';
import { formatUYU } from '../lib/padelUtils';

interface MercadoPagoModalProps {
  open: boolean;
  title: string;
  subtitle: string;
  amount: number;
  /** 'USD' para la cuota de la plataforma (US$ 39 / 59). */
  currency?: 'UYU' | 'USD';
  receiverName: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export const MercadoPagoModal: React.FC<MercadoPagoModalProps> = ({
  open,
  title,
  subtitle,
  amount,
  currency = 'UYU',
  receiverName,
  onConfirm,
  onClose,
}) => {
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [method, setMethod] = useState<'wallet' | 'card'>('wallet');

  if (!open) return null;

  const handlePay = async () => {
    setProcessing(true);
    try {
      await onConfirm();
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setProcessing(false);
        onClose();
      }, 900);
    } catch {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-sky-600">
              Checkout Mercado Pago (Simulado)
            </p>
            <h3 className="mt-1 font-display text-lg font-bold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Cerrar checkout"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="mt-3 font-display text-lg font-bold text-slate-900">
              Pago acreditado
            </p>
            <p className="mt-1 text-sm text-slate-600">
              El dinero ingresó directo a la cuenta de {receiverName}.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Destinatario</span>
                <span className="font-medium text-slate-800">{receiverName}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="text-sm font-medium text-slate-700">Total a pagar</span>
                <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                  {(currency === 'USD' ? `US$ ${amount}` : formatUYU(amount))}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMethod('wallet')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold transition-colors cursor-pointer ${
                  method === 'wallet'
                    ? 'border-sky-600 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Dinero en cuenta
              </button>
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold transition-colors cursor-pointer ${
                  method === 'card'
                    ? 'border-sky-600 bg-sky-50 text-sky-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="h-4 w-4" />
                Tarjeta Visa ··4821
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Si cancelás dentro del plazo gratuito del club, el monto se devuelve automáticamente.
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={processing}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={processing}
                className="flex-1 rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60 cursor-pointer"
              >
                {processing ? 'Procesando...' : `Pagar ${(currency === 'USD' ? `US$ ${amount}` : formatUYU(amount))}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
