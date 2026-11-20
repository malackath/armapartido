/**
 * Perfil del jugador (rediseño aprobado por Ber el 16/11/2026): la ficha arriba (a la izquierda en la compu)
 * y tres pestañas: Mi juego, Mi cuenta y Ajustes. Sin ranking ni gráficos.
 * Vista previa: Paddle.URU/Pantallas/perfil-y-registro.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import type {
  Booking,
  Club,
  ClubMembership,
  CourtSide,
  Gender,
  Hand,
  Modality,
  PlayerMatchResult,
  ProposedMatch,
  Tournament,
  UserPrivateInfo,
  UserProfile,
} from '../types/padel';
import { formatCategory, formatDateFriendly, getTodayISO, type PlayerLevelSummary } from '../lib/padelUtils';
import { formatPhone, normalizePhone } from '../lib/clientes';
import { describeWindows, gridFromWindows, windowsFromGrid, type GridKey } from '../lib/registro';
import { getUserPrivateInfo, saveUserFcmToken } from '../services/firestoreService';
import { savePrivatePhone, saveProfileChanges } from '../services/registroService';
import { uploadProfilePhoto } from '../services/photoService';
import { obtainFcmDeviceToken } from '../lib/fcm';
import { MyAccount } from './caja/MyAccount';
import { AlertPrefsSection } from './FaltaUno';
import { PrefieroNo } from './PrefieroNo';
import { ParejaFija } from './ParejaFija';
import { MisPartidos } from './Resultados';
import { InstallGuideModal, PWAInstallButton } from './PWAInstallButton';
import { AvailabilityGrid, CategoryLadder, MiniLadder, OptionGroup, PlayerFicha } from './registro/parts';

interface ProfileViewProps {
  userProfile: UserProfile;
  clubs: Club[];
  activeClub: Club | null;
  membership?: ClubMembership;
  memberships: ClubMembership[];
  bookings: Booking[];
  proposedMatches: ProposedMatch[];
  tournaments: Tournament[];
  playerMatchResults: PlayerMatchResult[];
  clubMatchResults: PlayerMatchResult[];
  playerLevel?: PlayerLevelSummary;
  onProfileUpdated: (next: UserProfile) => void;
  onLogout: () => void;
  onToast: (msg: string) => void;
  onOpenTab?: (tab: 'friends') => void;
}

type Tab = 'juego' | 'cuenta' | 'ajustes';

const card = 'rounded-xl border border-line bg-white p-4';
const linkBtn = 'cursor-pointer text-sm font-semibold text-brand hover:underline';
const btnDark = 'h-10 cursor-pointer rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60';
const btnGhost = 'h-10 cursor-pointer rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-mist';

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  clubs,
  activeClub,
  membership,
  memberships,
  bookings,
  proposedMatches,
  tournaments,
  playerMatchResults,
  onProfileUpdated,
  onLogout,
  onToast,
  onOpenTab,
}) => {
  // ?cuponera=<id> (desde el pase de la billetera o el QR de la compu) abre "Mi cuenta" con esa cuponera.
  const [tab, setTab] = useState<Tab>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cuponera') ? 'cuenta' : 'juego'));
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);

  useEffect(() => {
    getUserPrivateInfo(userProfile.uid).then(setPrivateInfo).catch(() => undefined);
  }, [userProfile.uid]);

  const myClubIds = useMemo(() => {
    const ids = new Set(userProfile.activeClubIds ?? []);
    if (activeClub && membership) ids.add(activeClub.id);
    return [...ids].filter((id) => clubs.some((c) => c.id === id));
  }, [userProfile.activeClubIds, activeClub, membership, clubs]);

  const save = async (changes: Parameters<typeof saveProfileChanges>[1], msg: string) => {
    setBusy(true);
    try {
      const next = await saveProfileChanges(userProfile, changes, myClubIds);
      onProfileUpdated(next);
      onToast(msg);
      return true;
    } catch {
      onToast('No se pudo guardar. Revisá la conexión y probá de nuevo.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const clubCategory = membership && membership.category !== userProfile.category ? membership.category : null;

  const changePhoto = async (f: File | undefined) => {
    if (!f) return;
    setPhotoBusy(true);
    try {
      const url = await uploadProfilePhoto(userProfile.uid, myClubIds, f);
      onProfileUpdated({ ...userProfile, photoUrl: url });
      onToast('Listo, tu foto quedó en tu ficha.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'No se pudo subir la foto.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const [editing, setEditing] = useState(false);

  const ficha = (layout: 'row' | 'column') => (
    <PlayerFicha
      profile={clubCategory ? { ...userProfile, category: clubCategory } : userProfile}
      clubName={activeClub?.name}
      layout={layout}
      action={
        layout === 'row' ? (
          <button type="button" onClick={() => setEditing(true)} className="cursor-pointer rounded-[10px] bg-mist px-2.5 py-1.5 text-[13px] font-semibold text-brand">
            Editar
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={`${btnGhost} w-full`}>
            Editar perfil
          </button>
        )
      }
    />
  );

  return (
    <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-6" data-testid="perfil">
      <div className="lg:sticky lg:top-28">
        <div className="lg:hidden">{ficha('row')}</div>
        <div className="hidden lg:block">{ficha('column')}</div>
      </div>

      <div className="min-w-0">
        <div role="tablist" aria-label="Secciones del perfil" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-line p-1 lg:mt-0 lg:max-w-md">
          {(
            [
              ['juego', 'Mi juego'],
              ['cuenta', 'Mi cuenta'],
              ['ajustes', 'Ajustes'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`h-[38px] cursor-pointer rounded-[9px] text-sm font-semibold ${tab === id ? 'bg-white text-ink shadow-[0_1px_2px_rgba(23,33,35,.12)]' : 'text-[#3a4a4a]'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'juego' && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <CategoryCard
              value={userProfile.category}
              clubCategory={clubCategory}
              clubName={activeClub?.name}
              busy={busy}
              onSave={(c) => save({ category: c }, `Listo, ahora figurás en ${formatCategory(c)}. El club la va a revisar.`)}
            />
            <AvailabilityCard
              profile={userProfile}
              busy={busy}
              onSave={(w) => save({ weeklyAvailability: w }, 'Listo, guardamos tus horarios.')}
            />
            <ParejaFija clubId={membership ? activeClub?.id : undefined} userProfile={userProfile} memberships={memberships} onToast={onToast} />
            <div className={`${card} lg:col-span-2`}>
              <MisPartidos club={activeClub} userProfile={userProfile} bookings={bookings} tournaments={tournaments} />
            </div>
            {onOpenTab && (
              <button type="button" onClick={() => onOpenTab('friends')} className={`${card} flex cursor-pointer items-center justify-between text-left hover:bg-mist lg:col-span-2`}>
                <span>
                  <b className="block font-semibold text-ink">Amigos</b>
                  <small className="text-[13px] text-muted">Para invitarlos a jugar o anotarte con ellos en torneos</small>
                </span>
                <ChevronRight className="h-5 w-5 text-muted" />
              </button>
            )}
            <button type="button" onClick={() => setTab('ajustes')} className={`${card} flex cursor-pointer items-center justify-between text-left hover:bg-mist lg:col-span-2`} data-testid="ir-prefiero-no">
              <span>
                <b className="block font-semibold text-ink">Prefiero no jugar con</b>
                <small className="text-[13px] text-muted">
                  {(userProfile.avoidUids?.length ?? 0) > 0
                    ? `${userProfile.avoidUids!.length} ${userProfile.avoidUids!.length === 1 ? 'jugador' : 'jugadores'} · privado, nadie se entera`
                    : 'Privado: la app nunca te pone en el mismo partido'}
                </small>
              </span>
              <ChevronRight className="h-5 w-5 text-muted" />
            </button>
          </div>
        )}

        {tab === 'cuenta' && (
          <div className="mt-3">
            {activeClub ? (
              <MyAccount club={activeClub} userProfile={userProfile} bookings={bookings} proposedMatches={proposedMatches} />
            ) : (
              <p className={`${card} text-sm text-muted`}>Cuando te sumes a un club, acá vas a ver lo que debés, tus cuponeras y tu saldo.</p>
            )}
          </div>
        )}

        {tab === 'ajustes' && (
          <div className="mt-3 grid gap-3">
            <PushCard userProfile={userProfile} onToast={onToast} />
            <AlertPrefsSection userProfile={userProfile} onProfileUpdated={onProfileUpdated} onToast={onToast} />
            <PrefieroNo userProfile={userProfile} memberships={memberships} onProfileUpdated={onProfileUpdated} onToast={onToast} onOpenFriends={onOpenTab ? () => onOpenTab('friends') : undefined} />
            <MyDataCard
              userProfile={userProfile}
              info={privateInfo}
              onSaved={setPrivateInfo}
              onToast={onToast}
            />
            <div className={card}>
              <h3 className="font-display text-base font-bold text-ink">Mis clubes</h3>
              {myClubIds.length === 0 ? (
                <p className="mt-1 text-sm text-muted">Todavía no estás en ningún club.</p>
              ) : (
                myClubIds.map((id) => (
                  <p key={id} className="mt-2 border-t border-line pt-2 text-[14.5px] font-semibold text-ink first-of-type:border-0 first-of-type:pt-0">
                    {clubs.find((c) => c.id === id)?.name}
                  </p>
                ))
              )}
            </div>
            <div className={`${card} grid gap-3`}>
              <PWAInstallButton onShowGuide={() => setInstallGuideOpen(true)} />
              <InstallGuideModal open={installGuideOpen} onClose={() => setInstallGuideOpen(false)} />
              <button type="button" onClick={onLogout} className={`${btnGhost} w-fit`}>
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <EditSheet
          profile={userProfile}
          busy={busy || photoBusy}
          photoBusy={photoBusy}
          onPhoto={changePhoto}
          onClose={() => setEditing(false)}
          onSave={async (changes) => {
            if (await save(changes, 'Listo, guardamos tu perfil.')) setEditing(false);
          }}
        />
      )}
    </div>
  );
};

// ---------- Mi juego ----------

const CategoryCard: React.FC<{
  value: number;
  clubCategory: number | null;
  clubName?: string;
  busy: boolean;
  onSave: (c: number) => Promise<boolean>;
}> = ({ value, clubCategory, clubName, busy, onSave }) => {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(value);
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">Categoría</h3>
        {!open && (
          <button type="button" className={linkBtn} onClick={() => (setPick(value), setOpen(true))}>
            Cambiar
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-3">
          <CategoryLadder value={pick} onChange={setPick} compact />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} className={btnDark} onClick={async () => (await onSave(pick)) && setOpen(false)}>
              Guardar
            </button>
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <MiniLadder value={clubCategory ?? value} />
          </div>
          <p className="mt-2.5 text-[13px] text-muted">
            {clubCategory
              ? `Elegiste ${formatCategory(value)}. En ${clubName ?? 'el club'} jugás en ${formatCategory(clubCategory)}: lo ajustó el club.`
              : 'La elegiste vos. El club la puede corregir.'}
          </p>
        </>
      )}
    </div>
  );
};

const AvailabilityCard: React.FC<{ profile: UserProfile; busy: boolean; onSave: (w: UserProfile['weeklyAvailability']) => Promise<boolean> }> = ({
  profile,
  busy,
  onSave,
}) => {
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState<Set<GridKey>>(new Set());
  const rows = describeWindows(profile.weeklyAvailability ?? []);
  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">Cuándo puedo jugar</h3>
        {!open && (
          <button type="button" className={linkBtn} onClick={() => (setGrid(gridFromWindows(profile.weeklyAvailability ?? [])), setOpen(true))}>
            Cambiar
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-3">
          <AvailabilityGrid value={grid} onChange={setGrid} />
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} className={btnDark} onClick={async () => (await onSave(windowsFromGrid(grid))) && setOpen(false)}>
              Guardar
            </button>
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : rows.length ? (
        <div className="mt-1">
          {rows.map((r) => (
            <div key={r.days + r.hours} className="flex items-center justify-between gap-3 border-t border-line py-2.5 text-[14.5px] first:border-0">
              <b className="font-semibold text-ink">{r.days}</b>
              <span className="text-ink tabular-nums">{r.hours}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Sin horarios: la app no te puede armar partidos sola. Tocá “Cambiar” y marcá cuándo podés.</p>
      )}
    </div>
  );
};

// ---------- Ajustes ----------

const PushCard: React.FC<{ userProfile: UserProfile; onToast: (m: string) => void }> = ({ userProfile, onToast }) => {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(supported ? Notification.permission : 'unsupported');
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true);
    try {
      const res = await obtainFcmDeviceToken(true);
      setPerm(res.permission);
      if (res.permission !== 'granted') {
        onToast('El navegador no dio permiso para los avisos.');
        return;
      }
      if (res.token && res.tokenId) {
        await saveUserFcmToken({ uid: userProfile.uid, token: res.token, tokenId: res.tokenId, deviceLabel: res.deviceLabel, platform: res.platform });
      }
      onToast('Listo, los avisos llegan a este aparato.');
    } catch {
      onToast('No se pudieron activar los avisos.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`${card} flex items-center justify-between gap-3`}>
      <span>
        <b className="block font-display text-base font-bold text-ink">Avisos en este aparato</b>
        <small className="text-[13px] text-muted">Partido armado, cambios de tu reserva y torneos. También los ves en la campanita.</small>
      </span>
      {perm === 'granted' ? (
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ok">
          <Check className="h-4 w-4" /> Activados
        </span>
      ) : perm === 'unsupported' ? (
        <span className="max-w-[40%] text-right text-[13px] text-muted">Este navegador no los permite.</span>
      ) : perm === 'denied' ? (
        <span className="max-w-[40%] text-right text-[13px] text-muted">Bloqueados en el navegador.</span>
      ) : (
        <button type="button" disabled={busy} onClick={enable} className={btnDark}>
          Activar
        </button>
      )}
    </div>
  );
};

const MyDataCard: React.FC<{
  userProfile: UserProfile;
  info: UserPrivateInfo | null;
  onSaved: (i: UserPrivateInfo) => void;
  onToast: (m: string) => void;
}> = ({ userProfile, info, onSaved, onToast }) => {
  const [editPhone, setEditPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const p = normalizePhone(phone);
    if (!p) {
      onToast('Revisá el celular: son 9 números y empieza con 09.');
      return;
    }
    setBusy(true);
    try {
      await savePrivatePhone(userProfile.uid, info?.email ?? '', p);
      onSaved({ uid: userProfile.uid, email: info?.email ?? '', phone: p });
      setEditPhone(false);
      onToast('Listo, guardamos tu celular.');
    } catch {
      onToast('No se pudo guardar el celular.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={card}>
      <h3 className="font-display text-base font-bold text-ink">Mis datos</h3>
      <div className="mt-1 flex items-center justify-between gap-3 border-b border-line py-2.5 text-[14.5px]">
        <span className="min-w-0">
          <b className="block font-semibold">Mail</b>
          <small className="break-all text-[13px] text-muted">{info?.email ?? '…'}</small>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 py-2.5 text-[14.5px]">
        {editPhone ? (
          <span className="flex w-full flex-wrap items-center gap-2">
            <input
              autoFocus
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="099 123 456"
              className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3 text-[15px]"
            />
            <button type="button" disabled={busy} onClick={save} className={btnDark}>
              Guardar
            </button>
            <button type="button" onClick={() => setEditPhone(false)} className={btnGhost}>
              Cancelar
            </button>
          </span>
        ) : (
          <>
            <span>
              <b className="block font-semibold">Celular</b>
              <small className="text-[13px] text-muted">{info?.phone ? formatPhone(info.phone) : 'Sin cargar'}</small>
            </span>
            <button type="button" className={linkBtn} onClick={() => (setPhone(info?.phone ? formatPhone(info.phone) : ''), setEditPhone(true))}>
              Cambiar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------- Editar perfil ----------

const EditSheet: React.FC<{
  profile: UserProfile;
  busy: boolean;
  photoBusy: boolean;
  onPhoto: (f: File | undefined) => void;
  onClose: () => void;
  onSave: (changes: { displayName: string; gender: Gender; preferredModality: Modality; courtSide?: CourtSide; hand?: Hand }) => void;
}> = ({ profile, busy, photoBusy, onPhoto, onClose, onSave }) => {
  const [name, setName] = useState(profile.displayName);
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [modality, setModality] = useState<Modality>(profile.preferredModality);
  const [side, setSide] = useState<CourtSide | undefined>(profile.courtSide);
  const [hand, setHand] = useState<Hand | undefined>(profile.hand);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-ink/50 sm:items-center sm:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editar-perfil"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[20px] bg-surface px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="editar-perfil" className="font-display text-xl font-bold text-ink">
            Editar perfil
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted hover:bg-mist">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-white p-2.5">
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt="" className="h-14 w-14 rounded-[10px] object-cover" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-[10px] bg-avatar font-bold text-brand">{profile.displayName.slice(0, 1)}</span>
          )}
          <span className="text-[15px] font-semibold text-brand">{photoBusy ? 'Subiendo…' : profile.photoUrl ? 'Cambiar foto' : 'Poner foto'}</span>
          <input type="file" accept="image/*" className="sr-only" disabled={photoBusy} onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        <label className="mt-4 grid gap-1.5 text-sm font-semibold">
          Nombre y apellido
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl border border-line bg-white px-3.5 text-base font-normal" />
        </label>
        <p className="mt-4 mb-2 text-sm font-bold">Jugás en</p>
        <OptionGroup label="Jugás en" value={gender} onChange={setGender} options={[{ v: 'masculino', label: 'Masculino' }, { v: 'femenino', label: 'Femenino' }]} />
        <p className="mt-4 mb-2 text-sm font-bold">Querés que te armen partidos</p>
        <OptionGroup
          label="Partidos"
          value={modality}
          onChange={setModality}
          options={[
            { v: 'masculino', label: 'Masculinos' },
            { v: 'femenino', label: 'Femeninos' },
            { v: 'mixto', label: 'Mixtos' },
          ]}
        />
        <p className="mt-4 mb-2 text-sm font-bold">Lado de la cancha</p>
        <OptionGroup
          label="Lado"
          value={side}
          onChange={setSide}
          options={[
            { v: 'drive', label: 'Drive' },
            { v: 'reves', label: 'Revés' },
            { v: 'indistinto', label: 'Me da igual' },
          ]}
        />
        <p className="mt-4 mb-2 text-sm font-bold">Mano</p>
        <OptionGroup label="Mano" value={hand} onChange={setHand} options={[{ v: 'derecha', label: 'Derecha' }, { v: 'izquierda', label: 'Izquierda' }]} />
        <button
          type="button"
          disabled={busy || name.trim().length < 2}
          onClick={() =>
            onSave({ displayName: name.trim(), gender, preferredModality: modality, ...(side ? { courtSide: side } : {}), ...(hand ? { hand } : {}) })
          }
          className="mt-5 h-12 w-full cursor-pointer rounded-xl bg-action text-base font-semibold text-on-action disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
};
