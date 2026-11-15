import React from 'react';
import { Bell, CalendarDays, LogOut, Shield, Trophy, UserCheck, UserCircle2, Users } from 'lucide-react';
import type { Club, PerspectiveRole, UserProfile } from '../types/padel';
import { formatCategory } from '../lib/padelUtils';
import { PWAInstallButton } from './PWAInstallButton';

export type ActiveTab = 'bookings' | 'matchmaking' | 'friends' | 'tournaments' | 'staff' | 'admin' | 'platform' | 'notifications' | 'profile';

interface TopBarProps {
  clubs: Club[];
  activeClub: Club | null;
  onSelectClub: (clubId: string) => void;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  perspectiveRole: PerspectiveRole;
  onChangePerspective: (role: PerspectiveRole) => void;
  canAccessStaff: boolean;
  canAccessAdmin: boolean;
  canAccessPlatform: boolean;
  unreadNotifications: number;
  userProfile: UserProfile;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  clubs,
  activeClub,
  onSelectClub,
  activeTab,
  onSelectTab,
  perspectiveRole,
  onChangePerspective,
  canAccessStaff,
  canAccessAdmin,
  canAccessPlatform,
  unreadNotifications,
  userProfile,
  onLogout,
}) => {
  const brandTitle =
    perspectiveRole === 'platform_owner'
      ? 'Armá Partido'
      : activeClub?.name || 'Armá Partido';

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'bookings', label: 'Reservas' },
    { id: 'matchmaking', label: 'Armar Partido' },
    { id: 'friends', label: 'Amigos' },
    { id: 'tournaments', label: 'Torneos' },
  ];

  if (canAccessStaff && (perspectiveRole === 'staff' || perspectiveRole === 'admin' || perspectiveRole === 'platform_owner')) {
    navItems.push({ id: 'staff', label: 'Mostrador' });
  }
  if (canAccessAdmin && (perspectiveRole === 'admin' || perspectiveRole === 'platform_owner')) {
    navItems.push({ id: 'admin', label: 'Admin Club' });
  }
  if (canAccessPlatform && perspectiveRole === 'platform_owner') {
    navItems.push({ id: 'platform', label: 'Plataforma' });
  }

  return (
    <>
      {/* Strict 3-zone Desktop / Mobile Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => onSelectTab('bookings')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
            style={{ color: perspectiveRole === 'platform_owner' ? '#0F172A' : activeClub?.primaryColor || '#00696b' }}
          >
            {brandTitle}
          </button>

          {/* Zone 2: 4-5 single-line nav links */}
          <nav className="hidden md:flex items-center gap-6">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`border-b-2 py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onSelectTab('notifications')}
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              aria-label="Avisos"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 font-mono text-[10px] font-semibold text-white">
                  {unreadNotifications}
                </span>
              )}
            </button>
            <div className="hidden sm:block">
              <PWAInstallButton compact />
            </div>
            <button
              type="button"
              onClick={() => onSelectTab('profile')}
              className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{userProfile.displayName.split(' ')[0]}</span>
              <span aria-hidden="true">·</span>
              <span>{formatCategory(userProfile.category)}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Context Strip (Club Selector & Role Perspective) — below header */}
      <div className="border-b border-slate-200 bg-slate-100/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3 overflow-x-auto">
            <label htmlFor="club-selector" className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
              Club activo
            </label>
            <select
              id="club-selector"
              value={activeClub?.id || ''}
              onChange={(e) => onSelectClub(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-600 focus:outline-none"
            >
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.neighborhood || c.city})
                </option>
              ))}
            </select>
            {activeClub && (
              <span className="hidden lg:inline text-xs text-slate-500 whitespace-nowrap">
                {activeClub.address} · {activeClub.courtCount} canchas · Turnos {activeClub.slotDurationMinutes}m
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="hidden sm:inline text-xs text-slate-500 whitespace-nowrap">Vista</span>
            <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5">
              <button
                type="button"
                onClick={() => {
                  onChangePerspective('player');
                  if (activeTab === 'staff' || activeTab === 'admin' || activeTab === 'platform') {
                    onSelectTab('bookings');
                  }
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  perspectiveRole === 'player' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Jugador
              </button>
              {canAccessStaff && (
                <button
                  type="button"
                  onClick={() => {
                    onChangePerspective('staff');
                    onSelectTab('staff');
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    perspectiveRole === 'staff' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Encargado
                </button>
              )}
              {canAccessAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onChangePerspective('admin');
                    onSelectTab('admin');
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    perspectiveRole === 'admin' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admin Club
                </button>
              )}
              {canAccessPlatform && (
                <button
                  type="button"
                  onClick={() => {
                    onChangePerspective('platform_owner');
                    onSelectTab('platform');
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    perspectiveRole === 'platform_owner' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dueño Plataforma
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 hover:text-slate-900 cursor-pointer"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Thumb-Zone Navigation (strict <=15% sticky cap) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden pb-safe">
        <div className="grid h-14 grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => onSelectTab('bookings')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              activeTab === 'bookings' ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            <CalendarDays className="h-5 w-5" />
            <span>Reservar</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('matchmaking')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              activeTab === 'matchmaking' ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            <Users className="h-5 w-5" />
            <span>Partidos</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('friends')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              activeTab === 'friends' ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            <UserCheck className="h-5 w-5" />
            <span>Amigos</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('tournaments')}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              activeTab === 'tournaments' ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            <Trophy className="h-5 w-5" />
            <span>Torneos</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectTab(
                perspectiveRole === 'staff'
                  ? 'staff'
                  : perspectiveRole === 'admin'
                    ? 'admin'
                    : perspectiveRole === 'platform_owner'
                      ? 'platform'
                      : 'profile'
              )
            }
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
              ['staff', 'admin', 'platform', 'profile'].includes(activeTab) ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            {perspectiveRole === 'player' ? <UserCircle2 className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
            <span>{perspectiveRole === 'player' ? 'Perfil' : 'Gestión'}</span>
          </button>
        </div>
      </nav>
    </>
  );
};
