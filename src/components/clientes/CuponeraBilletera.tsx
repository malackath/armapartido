/**
 * Cuponera del jugador, estilo billetera (diseño aprobado por Ber 19/11: tarjeta grande, los cupones a la vista con los usados tachados), con su código QR y el botón para guardarla en la billetera del celular (19/11/2026).
 * - Android: botón oficial "Agregar a la Billetera de Google" (así se llama Google Wallet en español de Latinoamérica) (si está prendida en el servidor; si no, "muy pronto").
 * - iPhone: Apple Wallet "muy pronto" (decisión de Ber: se prende cuando pague la cuenta de Apple).
 * - Compu: un QR para abrir la cuponera en el celular.
 * El QR del Mostrador (AP1.<club>.<código>) sirve siempre, con o sin billetera.
 */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Club } from '../../types/padel';
import type { ClientPack } from '../../types/clientes';
import { dmy, dmyFull, VALIDITY_LABEL } from '../../lib/clientes';
import { History, QrCode, WalletCards } from 'lucide-react';
import { cuponeraBilletera, type CuponeraPase } from '../../services/firestoreService';

type Equipo = 'android' | 'iphone' | 'compu';

export function equipoActual(): Equipo {
  if (typeof navigator === 'undefined') return 'compu';
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  return 'compu';
}

const qrDe = (texto: string, ancho = 480) => QRCode.toDataURL(texto, { margin: 1, width: ancho, errorCorrectionLevel: 'M', color: { dark: '#172123', light: '#ffffff' } });

export const CuponeraBilletera: React.FC<{ club: Club; pack: ClientPack; abierta?: boolean }> = ({ club, pack, abierta }) => {
  const equipo = equipoActual();
  const [pase, setPase] = useState<CuponeraPase | null>(null);
  const [verCodigo, setVerCodigo] = useState(!!abierta);
  const [verHistorial, setVerHistorial] = useState(false);
  const [qrMostrador, setQrMostrador] = useState('');
  const [qrCelular, setQrCelular] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    cuponeraBilletera(club.id, pack.id)
      .then((p) => vivo && setPase(p))
      .catch(() => vivo && setPase({ qr: pack.qr || '', conMarca: false, google: { disponible: false }, apple: { disponible: false } }));
    return () => {
      vivo = false;
    };
  }, [club.id, pack.id, pack.qr]);

  const codigo = pase?.qr || pack.qr || '';
  useEffect(() => {
    if (verCodigo && codigo) qrDe(codigo).then(setQrMostrador);
  }, [verCodigo, codigo]);
  useEffect(() => {
    if (equipo !== 'compu') return;
    const url = `${window.location.origin}/?tab=profile&clubId=${encodeURIComponent(club.id)}&cuponera=${encodeURIComponent(pack.id)}`;
    qrDe(url, 360).then(setQrCelular);
  }, [equipo, club.id, pack.id]);

  const guardarGoogle = async () => {
    setGuardando(true);
    setAviso('');
    try {
      const r = await cuponeraBilletera(club.id, pack.id, 'google');
      if (r.google.url) window.location.href = r.google.url;
    } catch (e) {
      setAviso((e as Error).message || 'No pudimos abrir la Billetera de Google. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };
  const guardarApple = async () => {
    setGuardando(true);
    setAviso('');
    try {
      const r = await cuponeraBilletera(club.id, pack.id, 'apple');
      if (r.apple.url) window.location.href = r.apple.url;
    } catch (e) {
      setAviso((e as Error).message || 'No pudimos abrir Apple Wallet. Probá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const unidad = pack.unit === 'turno' ? 'turnos' : 'partes';
  const una = pack.unit === 'turno' ? 'turno' : 'parte';
  const pct = pack.usesTotal ? Math.round((pack.usesLeft / pack.usesTotal) * 100) : 0;
  const usados = Math.max(0, pack.usesTotal - pack.usesLeft);
  const usos = [...(pack.uses || [])].sort((a, z) => (a.atISO || a.date).localeCompare(z.atISO || z.date));
  const verCupones = pack.usesTotal > 0 && pack.usesTotal <= 30;
  const historial = [...usos].reverse();
  const diaCorto = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return `${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()]} ${dmy(iso)}`;
  };
  const botonRedondo = 'grid h-11 w-11 place-items-center rounded-full bg-white text-[var(--color-brand,#0a5761)] shadow-[0_1px_0_#dbe7e7] ring-1 ring-[#e3eded]';

  return (
    <div className="rounded-2xl border border-[#d3e4e4] bg-[#f4f7f7] p-3 sm:p-4" data-testid="cuponera-billetera">
      <div className={equipo === 'compu' ? 'grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_180px]' : 'flex flex-col gap-3'}>
        {/* Tarjeta grande, con los colores del club si tiene marca aprobada (variables de marca). */}
        <div
          className="relative overflow-hidden rounded-[20px] p-4 text-white"
          style={{
            background:
              'radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, var(--color-action,#05e2f2) 45%, transparent) 0%, transparent 55%), linear-gradient(140deg, color-mix(in srgb, var(--color-brand,#0a5761) 82%, white), var(--color-brand,#0a5761) 60%, color-mix(in srgb, var(--color-brand,#0a5761) 75%, black))',
          }}
          data-testid="cuponera-tarjeta"
        >
          <div className="flex items-center justify-between gap-2 text-[12px] opacity-90">
            <span className="truncate">{club.name}</span>
            <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-white">
              <img src="/brand/isotipo-color.svg" alt="" className="h-[18px] w-[18px]" />
            </span>
          </div>
          <p className="mt-2 text-[13px] opacity-85">{pack.name}</p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-[54px] leading-none font-bold tabular-nums">{pack.usesLeft}</span>
            <span className="text-[13px] opacity-85">de {pack.usesTotal} {unidad}</span>
          </p>
          <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-[var(--color-action,#05e2f2)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2.5 flex justify-between gap-2 text-[12px] opacity-90">
            <span>Vale {VALIDITY_LABEL[pack.validity]}</span>
            <span>Vence {dmyFull(pack.expiresOn)}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {/* Botones redondos */}
          <div className="grid grid-cols-3 gap-1 text-center text-[11px] text-slate-600 sm:max-w-[320px]">
            <button type="button" onClick={() => setVerCodigo((v) => !v)} className="flex flex-col items-center gap-1 cursor-pointer" data-testid="ver-codigo" aria-pressed={verCodigo}>
              <span className={verCodigo ? 'grid h-11 w-11 place-items-center rounded-full bg-[var(--color-brand,#0a5761)] text-white' : botonRedondo}>
                <QrCode className="h-[18px] w-[18px]" />
              </span>
              {verCodigo ? 'Ocultar código' : 'Mostrar código'}
            </button>
            <button
              type="button"
              onClick={() => (equipo === 'android' && pase?.google.disponible ? guardarGoogle() : equipo === 'iphone' && pase?.apple.disponible ? guardarApple() : setAviso(equipo === 'compu' ? 'Escaneá el código de la derecha con el celular para guardarla.' : `Guardarla en ${equipo === 'iphone' ? 'Apple Wallet' : 'la Billetera de Google'} llega muy pronto.`))}
              disabled={guardando}
              className="flex flex-col items-center gap-1 cursor-pointer"
            >
              <span className={botonRedondo}>
                <WalletCards className="h-[18px] w-[18px]" />
              </span>
              Billetera
            </button>
            <button type="button" onClick={() => setVerHistorial((v) => !v)} className="flex flex-col items-center gap-1 cursor-pointer" aria-pressed={verHistorial}>
              <span className={botonRedondo}>
                <History className="h-[18px] w-[18px]" />
              </span>
              Historial
            </button>
          </div>

          {equipo === 'android' && pase?.google.disponible && (
            <button type="button" onClick={guardarGoogle} disabled={guardando} className="self-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a5761]" aria-label="Agregar a la Billetera de Google" data-testid="boton-google-wallet">
              <img src="/wallet/agregar-a-google-wallet.svg" alt="Agregar a la Billetera de Google" className="h-12 w-auto" />
            </button>
          )}
          {equipo === 'iphone' && pase?.apple.disponible && (
            <button type="button" onClick={guardarApple} disabled={guardando} className="rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white" data-testid="boton-apple-wallet">
              Agregar a Apple Wallet
            </button>
          )}
          {pase && ((equipo === 'android' && !pase.google.disponible) || (equipo === 'iphone' && !pase.apple.disponible)) && (
            <p className="rounded-lg bg-[#ecfcfc] px-3 py-2 text-center text-[12.5px] text-slate-600" data-testid="billetera-pronto">
              Guardarla en {equipo === 'iphone' ? 'Apple Wallet' : 'la Billetera de Google'} llega muy pronto. Mientras, mostrá el código en el mostrador.
            </p>
          )}
          {aviso && <p className="text-center text-[12.5px] text-wait">{aviso}</p>}

          {verCodigo && (
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-4 text-center" data-testid="codigo-mostrador">
              {qrMostrador ? <img src={qrMostrador} alt="Código de la cuponera" className="h-48 w-48" /> : <div className="h-48 w-48 rounded-lg bg-slate-100" />}
              <p className="font-display text-[16px] font-bold text-slate-900">
                Quedan {pack.usesLeft} de {pack.usesTotal}
              </p>
              <p className="text-[12.5px] text-slate-600">Mostralo en el mostrador de {club.name}. Lo leen con la cámara y descuentan {una === 'turno' ? '1 turno' : '1 parte'}.</p>
            </div>
          )}

          {/* Los cupones: usados tachados con su fecha, el próximo marcado. */}
          {verCupones && (
            <div data-testid="cupones">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="font-display text-[14.5px] font-semibold text-slate-900">Tus {pack.usesTotal} cupones</p>
                <p className="text-[11.5px] text-slate-500">
                  {usados} {usados === 1 ? 'usado' : 'usados'} · {pack.usesLeft} {pack.usesLeft === 1 ? 'libre' : 'libres'}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: pack.usesTotal }, (_, i) => {
                  const usado = i < usados;
                  const sigue = i === usados;
                  return (
                    <div key={i} className={`cupon ${usado ? 'cupon-usado' : sigue ? 'cupon-sigue' : ''}`} data-testid={usado ? 'cupon-usado' : 'cupon-libre'} aria-label={usado ? `Cupón ${i + 1}, usado${usos[i] ? ` el ${dmy(usos[i].date)}` : ''}` : `Cupón ${i + 1}, libre`}>
                      <b className="font-display">{i + 1}</b>
                      <em>{usado ? (usos[i] ? dmy(usos[i].date) : 'usado') : sigue ? 'sigue' : 'libre'}</em>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {verHistorial && (
            <div className="rounded-xl bg-white px-3 py-1" data-testid="historial">
              {historial.length === 0 && <p className="py-2 text-[12.5px] text-slate-500">Todavía no usaste esta cuponera.</p>}
              {historial.map((u, i) => (
                <div key={u.saleId || i} className="flex justify-between gap-2 border-b border-[#edf2f2] py-2 text-[12.5px] last:border-0">
                  <span className="text-slate-500">{diaCorto(u.date)}</span>
                  <b className="font-semibold whitespace-nowrap text-wait">−1 {una}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        {equipo === 'compu' && (
          <div className="flex flex-col items-center gap-1.5 self-start rounded-xl border border-[#d3e4e4] bg-white p-3 text-center text-[12px]" data-testid="pasala-al-celular">
            <b className="text-[13px] text-slate-900">Guardala en tu celular</b>
            {qrCelular ? <img src={qrCelular} alt="Código para abrir la cuponera en el celular" className="h-[110px] w-[110px]" /> : <div className="h-[110px] w-[110px] rounded bg-slate-100" />}
            <span className="text-slate-500">Escaneá con la cámara del celular y tocá {pase?.google.disponible ? '"Agregar a la Billetera de Google"' : '"Mostrar código"'}.</span>
          </div>
        )}
      </div>
    </div>
  );
};
