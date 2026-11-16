/**
 * Página pública del link de "Falta uno" (16/11/2026).
 * La abre cualquiera desde WhatsApp, sin app y sin cuenta. No muestra nombres ni fotos de los jugadores
 * (Ley 18.331): solo club, día, hora, categorías, tipo de partido, su parte del precio y cómo llegar.
 * Wireframe aprobado: project files informes/diferenciacion-mejoras/wireframes-mejoras-chicas.png (2).
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { claimFillSeatByLink, getPublicFillLink, type LinkClaimResult, type PublicFillLink } from '../services/firestoreService';
import { categoryRangeLabel, mapsUrlFromQuery } from '../lib/compartir';
import { formatDateFriendly, formatMinutes, formatUYU } from '../lib/padelUtils';
import { BrandIcon } from './BrandIcon';

const MODALITY: Record<string, string> = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' };

const RESULT_TEXT: Record<Exclude<LinkClaimResult, 'won'>, { title: string; body: string }> = {
  late: { title: 'Llegaste tarde', body: 'Otro jugador confirmó antes. El partido ya está completo.' },
  closed: { title: 'Este partido ya no busca jugadores', body: 'Se completó o se cerró la búsqueda.' },
  busy: { title: 'Ya tenés otro turno a esa hora', body: 'No te podemos anotar en dos canchas a la vez.' },
  category: { title: 'No coincide la categoría', body: 'Para que el partido salga parejo, este lugar es para otra categoría. Te avisamos de partidos de la tuya.' },
  gender: { title: 'Este partido es para otro tipo de jugadores', body: 'Es un partido masculino, femenino o mixto que no coincide con tu perfil.' },
  blocked: { title: 'Tu cuenta tiene una restricción del club', body: 'Hablá con el club para volver a sumarte a partidos.' },
  already_in: { title: 'Ya estás en este partido', body: 'Te esperamos en la cancha.' },
  left: { title: 'Te bajaste de este partido', body: 'Si podés ir igual, avisale al club.' },
  not_member: { title: 'Te falta sumarte al club', body: 'Confirmá tu mail y volvé a abrir el link.' },
};

export const FaltaUnoLinkPage: React.FC<{
  clubId: string;
  searchId: string;
  authUser: User | null;
  ready: boolean;
  onLogin: () => void;
  onExit: () => void;
}> = ({ clubId, searchId, authUser, ready, onLogin, onExit }) => {
  const [info, setInfo] = useState<PublicFillLink | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LinkClaimResult | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      setInfo(await getPublicFillLink(clubId, searchId));
    } catch {
      setError(true);
    }
  }, [clubId, searchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async () => {
    if (!authUser) return onLogin();
    setBusy(true);
    try {
      const r = await claimFillSeatByLink(clubId, searchId);
      setResult(r);
      void load();
    } catch {
      setResult('closed');
    } finally {
      setBusy(false);
    }
  };

  const open = info?.status === 'open';
  const btn = 'flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl text-base font-bold disabled:opacity-60';

  return (
    <div className="min-h-screen bg-page">
      <header className="bg-ink">
        <div className="mx-auto flex h-14 max-w-md items-center px-4">
          <img src="/brand/logo-horizontal-sobre-oscuro.svg" alt="Armá Partido" className="h-6 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pt-5 pb-10" data-testid="link-falta-uno">
        {info === undefined && !error && <p className="py-16 text-center text-sm text-muted">Cargando el partido…</p>}
        {error && (
          <div className="rounded-xl border border-line bg-white p-5 text-center">
            <p className="font-semibold text-ink">No pudimos abrir el partido.</p>
            <button type="button" onClick={load} className={`${btn} mt-4 bg-mist text-brand`}>
              Reintentar
            </button>
          </div>
        )}
        {info === null && (
          <div className="rounded-xl border border-line bg-white p-5 text-center">
            <p className="font-semibold text-ink">Este link no existe o ya no está activo.</p>
            <button type="button" onClick={onExit} className={`${btn} mt-4 bg-action text-on-action`}>
              Ir a la app
            </button>
          </div>
        )}
        {info && (
          <>
            <p className="text-center text-sm font-semibold text-muted">{info.clubName}</p>
            <div className="mt-3 rounded-xl border border-line bg-white p-5">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${open ? 'bg-wait-bg text-wait' : 'bg-ok-bg text-ok'}`}
              >
                {open ? (info.seatsLeft === 1 ? 'Falta 1' : `Faltan ${info.seatsLeft}`) : 'Completo'}
              </span>
              <h1 className="mt-2 font-display text-[26px] leading-tight font-bold text-ink">
                {open ? (info.seatsLeft === 1 ? 'Falta 1 para jugar' : `Faltan ${info.seatsLeft} para jugar`) : 'Este partido ya está completo'}
              </h1>
              <dl className="mt-3 divide-y divide-line text-[15px]">
                <Row k="Cuándo" v={`${formatDateFriendly(info.date)} · ${formatMinutes(info.startMinute)} a ${formatMinutes(info.endMinute)}`} />
                <Row k="Dónde" v={`${info.courtName} · ${info.clubName}`} />
                <Row k="Categoría" v={categoryRangeLabel(info.minCategory, info.maxCategory)} />
                <Row k="Partido" v={MODALITY[info.modality] ?? info.modality} />
                <Row k="Tu parte" v={`${formatUYU(info.pricePerPlayer)} · se paga en el club`} />
              </dl>
              <a
                href={mapsUrlFromQuery(info.mapsQuery)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-brand"
              >
                <BrandIcon name="ubicacion" size={16} />
                Cómo llegar{info.clubAddress ? ` · ${info.clubAddress}` : ''}
              </a>
            </div>

            {result === 'won' ? (
              <div className="mt-4 rounded-xl border border-ok/30 bg-ok-bg p-5 text-center" data-testid="link-resultado">
                <p className="font-display text-xl font-bold text-ok">¡Adentro!</p>
                <p className="mt-1 text-sm text-ink">Jugás {formatDateFriendly(info.date).toLowerCase()} a las {formatMinutes(info.startMinute)}. Te mandamos el aviso con los detalles.</p>
                <button type="button" onClick={onExit} className={`${btn} mt-4 bg-action text-on-action`}>
                  Ver mis partidos
                </button>
              </div>
            ) : result ? (
              <div className="mt-4 rounded-xl border border-line bg-white p-5 text-center" data-testid="link-resultado">
                <p className="font-semibold text-ink">{RESULT_TEXT[result].title}</p>
                <p className="mt-1 text-sm text-muted">{RESULT_TEXT[result].body}</p>
                <button type="button" onClick={onExit} className={`${btn} mt-4 bg-mist text-brand`}>
                  Buscar otro partido en {info.clubName}
                </button>
              </div>
            ) : open ? (
              <>
                <button type="button" disabled={busy || (!!authUser && !ready)} onClick={join} className={`${btn} mt-4 bg-action text-on-action`}>
                  {busy ? 'Confirmando…' : 'Quiero jugar'}
                </button>
                <p className="mt-2 text-center text-[13px] text-muted">
                  {authUser ? 'Entra el primero que confirma.' : `Si no tenés cuenta, te registrás en ${info.clubName} en un minuto y volvés acá.`}
                </p>
              </>
            ) : (
              <button type="button" onClick={onExit} className={`${btn} mt-4 bg-mist text-brand`}>
                Buscar otro partido en {info.clubName}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-2.5">
    <dt className="text-muted">{k}</dt>
    <dd className="text-right font-semibold text-ink">{v}</dd>
  </div>
);
