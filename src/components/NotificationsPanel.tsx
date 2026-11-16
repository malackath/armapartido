import React, { useState } from 'react';
import { Bell, BellRing, Check, Mail, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import type { Club, NotificationItem, UserFcmToken, UserProfile } from '../types/padel';
import { obtainFcmDeviceToken } from '../lib/fcm';
import {
  deleteUserFcmToken,
  dispatchNotification,
  markNotificationRead,
  saveUserFcmToken,
} from '../services/firestoreService';

interface NotificationsPanelProps {
  club: Club;
  notifications: NotificationItem[];
  fcmTokens: UserFcmToken[];
  currentFcmTokenId: string | null;
  onCurrentFcmTokenIdChange: (tokenId: string | null) => void;
  userProfile: UserProfile;
  onToast: (msg: string) => void;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  club,
  notifications,
  fcmTokens,
  currentFcmTokenId,
  onCurrentFcmTokenIdChange,
  userProfile,
  onToast,
}) => {
  const [pushState, setPushState] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [registeringFcm, setRegisteringFcm] = useState(false);

  const currentDeviceLinked = Boolean(
    currentFcmTokenId && fcmTokens.some((t) => t.id === currentFcmTokenId && t.enabled)
  );

  const handleEnableOrSyncPush = async () => {
    setRegisteringFcm(true);
    try {
      const res = await obtainFcmDeviceToken(true);
      setPushState(res.permission);

      if (res.permission !== 'granted') {
        onToast('Permiso de notificaciones denegado por el navegador.');
        return;
      }

      if (res.token && res.tokenId) {
        await saveUserFcmToken({
          uid: userProfile.uid,
          token: res.token,
          tokenId: res.tokenId,
          deviceLabel: res.deviceLabel,
          platform: res.platform,
        });
        onCurrentFcmTokenIdChange(res.tokenId);
        onToast(`Dispositivo vinculado (${res.deviceLabel}) para notificaciones push FCM.`);
      } else {
        onToast('Notificaciones habilitadas en el navegador para avisos en sesión activa.');
      }
    } finally {
      setRegisteringFcm(false);
    }
  };

  const handleRemoveDevice = async (tokenId: string) => {
    await deleteUserFcmToken(userProfile.uid, tokenId);
    if (tokenId === currentFcmTokenId) {
      onCurrentFcmTokenIdChange(null);
    }
    onToast('Dispositivo desvinculado de las notificaciones push.');
  };

  const handleTestMatchConfirmed = async () => {
    await dispatchNotification({
      clubId: club.id,
      recipientUid: userProfile.uid,
      eventType: 'match_confirmed',
      title: `Partido confirmado · ${club.name}`,
      body: 'Los 4 jugadores aceptaron. Cancha 1 reservada para hoy 20:00 hs.',
      currentUserUid: userProfile.uid,
      tab: 'matchmaking',
    });
    onToast('Push de partido confirmado enviado.');
  };

  const handleTestPairInvite = async () => {
    await dispatchNotification({
      clubId: club.id,
      recipientUid: userProfile.uid,
      eventType: 'pair_invite',
      title: `Invitación de pareja fija · ${club.name}`,
      body: 'Te invitaron a formar dupla para buscar partido hoy de 19:00 a 22:00 hs.',
      currentUserUid: userProfile.uid,
      tab: 'matchmaking',
    });
    onToast('Push de nueva invitación enviado.');
  };

  const handleTestReminder = async () => {
    await dispatchNotification({
      clubId: club.id,
      recipientUid: userProfile.uid,
      eventType: 'reminder_2h',
      title: `Recordatorio 2 horas antes · ${club.name}`,
      body: 'Tu turno en Cancha 1 · Central comienza en 2 horas. ¡No olvides tus paletas!',
      currentUserUid: userProfile.uid,
      tab: 'bookings',
    });
    onToast('Recordatorio push enviado (solo Push, sin Mail según regla del producto).');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            Firebase Cloud Messaging · Matriz Push + Mail
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Centro de notificaciones
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={registeringFcm}
            onClick={handleEnableOrSyncPush}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer ${
              pushState === 'granted' && currentDeviceLinked
                ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {pushState === 'granted' && currentDeviceLinked ? (
              <RefreshCw className="h-4 w-4 text-emerald-600" />
            ) : (
              <BellRing className="h-4 w-4" />
            )}
            {registeringFcm
              ? 'Vinculando...'
              : pushState === 'granted' && currentDeviceLinked
                ? 'Actualizar token FCM'
                : 'Activar Push FCM en este dispositivo'}
          </button>

          <button
            type="button"
            onClick={handleTestMatchConfirmed}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <Bell className="h-4 w-4 text-emerald-600" />
            Probar partido confirmado
          </button>

          <button
            type="button"
            onClick={handleTestPairInvite}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <Bell className="h-4 w-4 text-emerald-600" />
            Probar invitación
          </button>

          <button
            type="button"
            onClick={handleTestReminder}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer"
          >
            <Bell className="h-4 w-4 text-slate-500" />
            Recordatorio 2h
          </button>
        </div>
      </div>

      {/* FCM Registered Devices Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Dispositivos vinculados (Push FCM)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Recibí alertas instantáneas al confirmarse un partido (4/4) o cuando un jugador te envía una invitación de pareja.
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-700">
            Estado del navegador:{' '}
            <span
              className={
                pushState === 'granted'
                  ? 'text-emerald-700'
                  : pushState === 'denied'
                    ? 'text-red-700'
                    : 'text-wait'
              }
            >
              {pushState === 'granted'
                ? 'Permiso concedido'
                : pushState === 'denied'
                  ? 'Bloqueado en navegador'
                  : 'Sin activar'}
            </span>
          </div>
        </div>

        {pushState === 'denied' && (
          <p className="mt-3 text-xs text-red-700">
            El navegador tiene bloqueadas las notificaciones para este sitio. Habilitalas desde el ícono de configuración junto a la dirección web y volvé a sincronizar.
          </p>
        )}

        {fcmTokens.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">
            Todavía no hay dispositivos registrados con token FCM en tu cuenta. Pulsá &ldquo;Activar Push FCM en este dispositivo&rdquo; para vincular este navegador.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {fcmTokens.map((dev) => {
              const isCurrent = dev.id === currentFcmTokenId;
              return (
                <div
                  key={dev.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {dev.deviceLabel}
                        {isCurrent && (
                          <span className="ml-2 text-xs font-semibold text-emerald-700">
                            (Este dispositivo)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        Plataforma: <span className="uppercase">{dev.platform}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        Token:{' '}
                        <span className="font-mono tabular-nums">
                          ••••{dev.token.slice(-8)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveDevice(dev.id)}
                    className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desvincular
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Notifications List */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Todavía no recibiste notificaciones en {club.name}. Reservá una cancha o buscá un partido para ver los avisos Push y Mail.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ${
                  n.read ? 'bg-white' : 'bg-emerald-50/40'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">{n.title}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="h-3 w-3" />
                      {n.pushSent ? 'Push: Sí' : 'Push: No'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {n.emailSent ? 'Mail: Sí' : 'Mail: No'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{n.body}</p>
                </div>

                {!n.read && (
                  <button
                    type="button"
                    onClick={() => markNotificationRead(club.id, n.id)}
                    className="inline-flex items-center gap-1 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Marcar leída
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Rules Matrix Reference */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-bold text-slate-900">
          Reglas de envío configuradas en la plataforma
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-semibold">Evento</th>
                <th className="py-2 pr-4 font-semibold">Destinatario</th>
                <th className="py-2 pr-4 font-semibold">Push</th>
                <th className="py-2 font-semibold">Mail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr><td className="py-2 pr-4">Reserva confirmada o cancelada</td><td className="py-2 pr-4">Jugador</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 font-semibold text-emerald-700">Sí</td></tr>
              <tr><td className="py-2 pr-4">Cancha liberada (lista de espera)</td><td className="py-2 pr-4">Jugadores en espera</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 text-slate-400">No</td></tr>
              <tr><td className="py-2 pr-4">Recordatorio 2 horas antes</td><td className="py-2 pr-4">Jugadores del turno</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 text-slate-400">No</td></tr>
              <tr><td className="py-2 pr-4">Partido propuesto</td><td className="py-2 pr-4">Los 4 jugadores</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 text-slate-400">No</td></tr>
              <tr><td className="py-2 pr-4">Partido confirmado</td><td className="py-2 pr-4">Los 4 jugadores</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 font-semibold text-emerald-700">Sí</td></tr>
              <tr><td className="py-2 pr-4">Torneo nuevo de su categoría</td><td className="py-2 pr-4">Jugadores habilitados</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 font-semibold text-emerald-700">Sí</td></tr>
              <tr><td className="py-2 pr-4">Invitación a formar pareja</td><td className="py-2 pr-4">Compañero</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 font-semibold text-emerald-700">Sí</td></tr>
              <tr><td className="py-2 pr-4">Próximo partido del torneo</td><td className="py-2 pr-4">Pareja</td><td className="py-2 pr-4 font-semibold text-emerald-700">Sí</td><td className="py-2 font-semibold text-emerald-700">Sí</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

