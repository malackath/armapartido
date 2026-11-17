/**
 * Quién puede sumarse al club y pedidos para sumarse (17/11/2026).
 * Wireframe aprobado por Ber: project files informes/validar-jugador/wireframe-validar-jugador.png (A).
 * El interruptor lo cambia el dueño o el administrador; los pedidos los aprueban también los encargados.
 */
import React, { useState } from 'react';
import type { Club, JoinPolicy, JoinRequest } from '../../types/padel';
import { formatPhone } from '../../lib/clientes';
import { joinPolicyOf } from '../../lib/sumarse';
import { resolveJoinRequest, setJoinPolicy } from '../../services/sumarseService';
import { CategoryBadge, PlayerAvatar } from '../ui/People';

const OPTIONS: { id: JoinPolicy; title: string; text: string }[] = [
  { id: 'abierto', title: 'Cualquiera', text: 'Como hoy. Si su mail está en tu lista de clientes, se une a su ficha sola.' },
  {
    id: 'solo_clientes',
    title: 'Solo mis jugadores',
    text: 'Si su mail está en tu lista de clientes, entra directo. Si no, te llega un pedido y lo aprobás vos o el encargado.',
  },
];

export const JoinPolicyCard: React.FC<{ club: Club; onToast: (m: string) => void }> = ({ club, onToast }) => {
  const saved = joinPolicyOf(club);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mb-5 rounded-xl border border-line bg-white p-4 sm:p-5" data-testid="quien-se-suma">
      <h3 className="font-display text-lg font-bold text-ink">¿Quién puede sumarse al club desde la app?</h3>
      <div className="mt-3 grid gap-2.5" role="radiogroup" aria-label="Quién puede sumarse al club">
        {OPTIONS.map((o) => {
          const on = saved === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              data-testid={`politica-${o.id}`}
              onClick={async () => {
                if (on) return;
                setBusy(true);
                try {
                  await setJoinPolicy(club.id, o.id);
                  onToast(o.id === 'abierto' ? 'Listo: cualquiera puede sumarse al club.' : 'Listo: solo tus jugadores entran directo; los demás te piden permiso.');
                } catch {
                  onToast('No se pudo guardar. Probá de nuevo.');
                } finally {
                  setBusy(false);
                }
              }}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-left disabled:opacity-70 ${on ? 'border-brand bg-mist' : 'border-line bg-white hover:bg-mist'}`}
            >
              <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full ${on ? 'border-[6px] border-brand' : 'border-2 border-muted'}`} />
              <span>
                <span className="block font-semibold text-ink">{o.title}</span>
                <span className="block text-sm text-muted">{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

function whenLabel(r: JoinRequest): string {
  const d = (r.createdAt as { toDate?: () => Date } | undefined)?.toDate?.();
  if (!d) return 'recién';
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 60) return min <= 1 ? 'recién' : `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export const JoinRequestsCard: React.FC<{ club: Club; requests: JoinRequest[]; onToast: (m: string) => void; hideWhenEmpty?: boolean }> = ({
  club,
  requests,
  onToast,
  hideWhenEmpty,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  if (!requests.length && (hideWhenEmpty || joinPolicyOf(club) === 'abierto')) return null;
  const run = async (r: JoinRequest, action: 'aprobar' | 'unir' | 'rechazar') => {
    setBusy(r.uid);
    try {
      await resolveJoinRequest(club.id, r.uid, action);
      onToast(
        action === 'rechazar'
          ? `Pedido de ${r.displayName} rechazado.`
          : action === 'unir'
            ? `${r.displayName} ya es parte del club, unido a su ficha.`
            : `${r.displayName} ya es parte del club.`
      );
    } catch {
      onToast('No se pudo guardar. Probá de nuevo.');
    } finally {
      setBusy(null);
    }
  };
  const sorted = [...requests].sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
  return (
    <section className="mb-5 rounded-xl border border-line bg-white p-4 sm:p-5" data-testid="pedidos-sumarse">
      <h3 className="font-display text-lg font-bold text-ink">
        Pedidos para sumarse
        {requests.length > 0 && <span className="ml-2 rounded-full bg-due px-2 py-0.5 align-middle text-xs font-bold text-white">{requests.length}</span>}
      </h3>
      <p className="mt-0.5 text-sm text-muted">
        {requests.length ? 'No encontramos su mail en tu lista de clientes. Mientras, ven la app pero no pueden reservar.' : 'No hay pedidos pendientes.'}
      </p>
      {sorted.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {sorted.map((r) => (
            <li key={r.uid} className="flex flex-wrap items-center gap-3 py-3" data-testid={`pedido-${r.uid}`}>
              <PlayerAvatar name={r.displayName} photoUrl={r.photoUrl} size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  {r.displayName} <CategoryBadge category={r.category} size={22} />
                </p>
                <p className="text-[13px] break-all text-muted">
                  {r.email} · {r.phone ? formatPhone(r.phone) : 'sin celular'} · {whenLabel(r)}
                </p>
                {r.similarClientId && <p className="text-[13px] text-brand">Parecido a una ficha: «{r.similarClientName}», mismo celular</p>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === r.uid}
                  onClick={() => void run(r, 'rechazar')}
                  data-testid={`rechazar-${r.uid}`}
                  className="cursor-pointer rounded-full border border-brand bg-white px-3.5 py-1.5 text-sm font-semibold text-brand disabled:opacity-60"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  disabled={busy === r.uid}
                  onClick={() => void run(r, r.similarClientId ? 'unir' : 'aprobar')}
                  data-testid={`aprobar-${r.uid}`}
                  className="cursor-pointer rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {r.similarClientId ? 'Unir a su ficha' : 'Aprobar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > 0 && (
        <p className="mt-2 text-xs text-muted">Al aprobar, se crea su ficha de cliente. Al rechazar, no se le dice el motivo: solo «El club no confirmó tu pedido».</p>
      )}
    </section>
  );
};
