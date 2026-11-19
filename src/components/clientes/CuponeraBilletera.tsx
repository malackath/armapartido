/**
 * Cuponera del jugador con su código QR y el botón para guardarla en la billetera del celular (19/11/2026).
 * - Android: botón oficial "Agregar a la Billetera de Google" (así se llama Google Wallet en español de Latinoamérica) (si está prendida en el servidor; si no, "muy pronto").
 * - iPhone: Apple Wallet "muy pronto" (decisión de Ber: se prende cuando pague la cuenta de Apple).
 * - Compu: un QR para abrir la cuponera en el celular.
 * El QR del Mostrador (AP1.<club>.<código>) sirve siempre, con o sin billetera.
 */
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Club } from '../../types/padel';
import type { ClientPack } from '../../types/clientes';
import { dmy, VALIDITY_LABEL } from '../../lib/clientes';
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
  const pct = pack.usesTotal ? Math.round((pack.usesLeft / pack.usesTotal) * 100) : 0;

  return (
    <div className="rounded-xl border border-[#d3e4e4] bg-white px-4 py-3" data-testid="cuponera-billetera">
      <div className={equipo === 'compu' ? 'grid gap-4 sm:grid-cols-[1fr_170px]' : ''}>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">{pack.name}</p>
            <p className="truncate text-[12px] text-slate-500">{club.name}</p>
          </div>
          <p className="mt-1 font-display text-[26px] leading-tight font-bold text-[#0a5761] tabular-nums">
            {pack.usesLeft} <span className="text-sm font-medium text-slate-500">de {pack.usesTotal} {unidad} · vence {dmy(pack.expiresOn)}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dbe8e8]">
            <div className="h-full bg-[#0a5761]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-slate-500">Vale {VALIDITY_LABEL[pack.validity]}.</p>

          <div className="mt-3 flex flex-col gap-2">
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
            <button type="button" onClick={() => setVerCodigo((v) => !v)} className="rounded-lg border border-[#c9d7d8] bg-white px-4 py-2 text-sm font-semibold text-slate-800" data-testid="ver-codigo">
              {verCodigo ? 'Ocultar código' : 'Mostrar código para el mostrador'}
            </button>
            {aviso && <p className="text-center text-[12.5px] text-wait">{aviso}</p>}
          </div>
        </div>

        {equipo === 'compu' && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[#d3e4e4] bg-white p-3 text-center text-[12px]" data-testid="pasala-al-celular">
            <b className="text-[13px] text-slate-900">Guardala en tu celular</b>
            {qrCelular ? <img src={qrCelular} alt="Código para abrir la cuponera en el celular" className="h-[110px] w-[110px]" /> : <div className="h-[110px] w-[110px] rounded bg-slate-100" />}
            <span className="text-slate-500">Escaneá con la cámara del celular y tocá {pase?.google.disponible ? '"Agregar a la Billetera de Google"' : '"Mostrar código"'}.</span>
          </div>
        )}
      </div>

      {verCodigo && (
        <div className="mt-3 flex flex-col items-center gap-1 rounded-xl bg-[#f3f7f7] p-4" data-testid="codigo-mostrador">
          {qrMostrador ? <img src={qrMostrador} alt="Código de la cuponera" className="h-52 w-52 rounded-lg bg-white p-2" /> : <div className="h-52 w-52 rounded-lg bg-white" />}
          <p className="text-[12.5px] text-slate-600">Mostralo en el mostrador de {club.name}</p>
        </div>
      )}
    </div>
  );
};
