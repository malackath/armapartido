/**
 * Mostrador → "Leer cuponera" (19/11/2026). El encargado apunta la cámara de la compu o la tablet al código
 * de la cuponera (en la billetera del celular o en la app) o lo pasa con un lector USB, que escribe el código
 * en el campo de texto. Muestra de quién es, cuánto le queda y sus turnos de hoy; al tocar un turno se abre su
 * cuenta, donde "Usar cuponera" descuenta como siempre (mismas reglas de horario y vencimiento).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import jsQR from 'jsqr';
import type { Booking, ProposedMatch } from '../../types/padel';
import { formatMinutes } from '../../lib/padelUtils';
import { dmy, participantsWithClients, readPackQr, VALIDITY_LABEL } from '../../lib/clientes';
import { useClientes } from '../clientes/data';

type Estado = { tipo: 'esperando' } | { tipo: 'error'; texto: string } | { tipo: 'encontrada'; packId: string };

export const LeerCuponera: React.FC<{
  clubId: string;
  today: string;
  minuteNow: number;
  bookings: Booking[];
  proposedMatches: ProposedMatch[];
  nameOf: (uid: string) => string;
  onOpenTurn: (bookingId: string) => void;
  onClose: () => void;
}> = ({ clubId, today, minuteNow, bookings, proposedMatches, nameOf, onOpenTurn, onClose }) => {
  const { packs, clients } = useClientes();
  const video = useRef<HTMLVideoElement>(null);
  const [camara, setCamara] = useState<'prendiendo' | 'lista' | 'sin_permiso' | 'no_hay'>('prendiendo');
  const [estado, setEstado] = useState<Estado>({ tipo: 'esperando' });
  const [texto, setTexto] = useState('');
  const leyendo = useRef(true);

  const leer = (valor: string) => {
    const q = readPackQr(valor);
    if (!q) return setEstado({ tipo: 'error', texto: 'Ese código no es de una cuponera de Armá Partido.' });
    if (q.clubId !== clubId) return setEstado({ tipo: 'error', texto: 'Es una cuponera de otro club.' });
    const p = packs.find((x) => x.qr === q.code);
    if (!p) return setEstado({ tipo: 'error', texto: 'No encontramos esa cuponera en el club.' });
    leyendo.current = false;
    setEstado({ tipo: 'encontrada', packId: p.id });
  };

  // Cámara: lee un cuadro cada 250 ms hasta encontrar un código.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setCamara('no_hay');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        return setCamara((e as Error).name === 'NotAllowedError' ? 'sin_permiso' : 'no_hay');
      }
      const v = video.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      setCamara('lista');
      const paso = () => {
        if (leyendo.current && v.videoWidth && ctx) {
          const w = Math.min(640, v.videoWidth);
          const h = Math.round((v.videoHeight / v.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(v, 0, 0, w, h);
          const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
          if (r?.data) leer(r.data);
        }
        timer = window.setTimeout(paso, 250);
      };
      paso();
    })();
    return () => {
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs]);

  const pack = estado.tipo === 'encontrada' ? packs.find((p) => p.id === estado.packId) : undefined;
  const cliente = pack ? clients.find((c) => c.id === pack.clientId) : undefined;
  const problema = !pack ? '' : pack.status === 'voided' ? 'Está anulada.' : pack.usesLeft <= 0 ? 'Ya no le quedan usos.' : pack.expiresOn < today ? `Venció el ${dmy(pack.expiresOn)}.` : '';

  /** Turnos de hoy donde juega esa persona, del que está en juego en adelante. */
  const turnos = useMemo(() => {
    if (!pack) return [];
    return bookings
      .filter((b) => b.date === today && b.status !== 'cancelled' && b.endMinute > minuteNow - 30)
      .filter((b) => {
        const m = proposedMatches.find((x) => x.bookingId === b.id);
        return participantsWithClients(b, m, nameOf, clients).some((p) => p.client?.id === pack.clientId);
      })
      .sort((a, z) => a.startMinute - z.startMinute);
  }, [pack, bookings, proposedMatches, nameOf, clients, today, minuteNow]);

  const otraVez = () => {
    setEstado({ tipo: 'esperando' });
    setTexto('');
    leyendo.current = true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Leer cuponera" className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()} data-testid="leer-cuponera">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink">Leer cuponera</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-muted hover:bg-mist cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="relative aspect-[4/3] max-w-full overflow-hidden rounded-xl bg-[#1b2526]">
              <video ref={video} muted playsInline className={`h-full w-full object-cover ${camara === 'lista' ? '' : 'hidden'}`} />
              {camara === 'lista' && <div className="pointer-events-none absolute inset-[18%] rounded-xl border-[3px] border-[#05e2f2]" />}
              {camara !== 'lista' && (
                <div className="absolute inset-0 grid place-items-center p-4 text-center text-[13px] text-[#9bb3b6]">
                  {camara === 'prendiendo' ? 'Prendiendo la cámara…' : camara === 'sin_permiso' ? 'El navegador no dejó usar la cámara. Permitila en la barra de direcciones o usá el campo de abajo.' : 'No hay cámara en este equipo. Usá el campo de abajo o un lector.'}
                </div>
              )}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                leer(texto);
              }}
            >
              <input
                id="codigo-cuponera"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoFocus
                placeholder="O pasá el lector / pegá el código"
                className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm"
                autoComplete="off"
              />
              <button type="submit" className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:bg-mist cursor-pointer">
                Buscar
              </button>
            </form>
          </div>

          <div className="min-w-0">
            {estado.tipo === 'esperando' && <p className="rounded-xl bg-mist p-4 text-sm text-muted">Apuntá la cámara al código de la cuponera, en la billetera del celular o en la app del jugador.</p>}
            {estado.tipo === 'error' && (
              <div className="rounded-xl border-l-4 border-[#f97316] bg-wait-bg p-4 text-sm text-wait" data-testid="cuponera-error">
                <b>{estado.texto}</b>
                <button type="button" onClick={otraVez} className="mt-2 block font-semibold underline cursor-pointer">Leer otra</button>
              </div>
            )}
            {pack && (
              <div className="flex flex-col gap-2 rounded-xl border border-line p-4 text-sm" data-testid="cuponera-leida">
                <span className={`font-semibold ${problema ? 'text-wait' : 'text-emerald-700'}`}>{problema ? `✕ ${problema}` : '✓ Cuponera válida'}</span>
                <b className="text-[15px] text-ink">{cliente?.name || pack.clientName}</b>
                <span>
                  {pack.name} · quedan <b>{pack.usesLeft}</b> de {pack.usesTotal}
                </span>
                <span className="text-[12.5px] text-muted">Vale {VALIDITY_LABEL[pack.validity]} · vence {dmy(pack.expiresOn)}</span>
                {!problema && (
                  <>
                    <p className="mt-2 text-xs font-semibold tracking-wide text-muted uppercase">Turnos de hoy</p>
                    {turnos.length === 0 && <p className="text-[13px] text-muted">No tiene turnos hoy. Cargá la reserva y usá la cuponera desde la cuenta del turno.</p>}
                    {turnos.map((b) => (
                      <button key={b.id} type="button" onClick={() => onOpenTurn(b.id)} className="rounded-xl bg-action px-4 py-2.5 text-left text-sm font-semibold text-on-action hover:brightness-95 cursor-pointer" data-testid="cuponera-turno">
                        Usar en {b.courtName} · {formatMinutes(b.startMinute)}
                      </button>
                    ))}
                  </>
                )}
                <button type="button" onClick={otraVez} className="mt-1 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mist cursor-pointer">
                  Leer otra
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
