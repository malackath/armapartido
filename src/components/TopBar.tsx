import React, { useEffect, useRef, useState } from 'react';
import { LayoutGrid, LogOut, RotateCcw, Shield, Store, UserCircle2, Users } from 'lucide-react';
import type { Club, PerspectiveRole, UserProfile } from '../types/padel';
import { formatCategory } from '../lib/padelUtils';
import { PWAInstallButton } from './PWAInstallButton';
import { BrandIcon, type BrandIconName } from './BrandIcon';

export type ActiveTab =
  | 'home'
  | 'bookings'
  | 'matchmaking'
  | 'friends'
  | 'tournaments'
  | 'staff'
  | 'admin'
  | 'platform'
  | 'notifications'
  | 'profile';

interface TopBarProps {
  clubs: Club[];
  activeClub: Club | null;
  onSelectClub: (clubId: string) => void;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  perspectiveRole: PerspectiveRole;
  canAccessStaff: boolean;
  canAccessAdmin: boolean;
  canAccessPlatform: boolean;
  unreadNotifications: number;
  userProfile: UserProfile;
  onLogout: () => void;
  onResetDemo?: () => void;
}

/** Los 5 botones del jugador. Amigos vive dentro de Perfil. */
const PLAYER_NAV: { id: ActiveTab; label: string; icon: BrandIconName; also?: ActiveTab[] }[] = [
  { id: 'home', label: 'Inicio', icon: 'inicio' },
  { id: 'bookings', label: 'Reservar', icon: 'reservar' },
  { id: 'matchmaking', label: 'Armar partido', icon: 'armar-partido' },
  { id: 'tournaments', label: 'Torneos', icon: 'torneos' },
  { id: 'profile', label: 'Perfil', icon: 'perfil', also: ['friends'] },
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export const TopBar: React.FC<TopBarProps> = ({
  clubs,
  activeClub,
  onSelectClub,
  activeTab,
  onSelectTab,
  perspectiveRole,
  canAccessStaff,
  canAccessAdmin,
  canAccessPlatform,
  unreadNotifications,
  userProfile,
  onLogout,
  onResetDemo,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isManaging = perspectiveRole !== 'player';

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const go = (tab: ActiveTab) => {
    setMenuOpen(false);
    onSelectTab(tab);
  };

  const isActive = (item: (typeof PLAYER_NAV)[number]) => activeTab === item.id || !!item.also?.includes(activeTab);

  const managementItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [];
  if (canAccessStaff) managementItems.push({ id: 'staff', label: 'Mostrador', icon: <Store className="h-4 w-4" /> });
  if (canAccessAdmin) managementItems.push({ id: 'admin', label: 'Admin del club', icon: <Shield className="h-4 w-4" /> });
  if (canAccessPlatform) managementItems.push({ id: 'platform', label: 'Plataforma', icon: <LayoutGrid className="h-4 w-4" /> });

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-6 px-4 sm:px-6">
          <button type="button" onClick={() => go('home')} className="min-w-0 cursor-pointer text-left" aria-label="Ir al inicio">
            <img src="/brand/logo-horizontal-color.svg" alt="Armá Partido" className="h-7 w-auto" />
            {activeClub && (
              <span className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-muted">
                {activeClub.name}
                <BrandIcon name="ubicacion" size={13} />
              </span>
            )}
          </button>

          <nav className="hidden md:flex items-center gap-1" aria-label="Principal">
            {PLAYER_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={isActive(item) ? 'page' : undefined}
                className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap ${
                  isActive(item) ? 'bg-mist text-brand' : 'text-muted hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => go('notifications')}
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-brand hover:bg-mist"
              aria-label={unreadNotifications > 0 ? `Avisos, ${unreadNotifications} sin leer` : 'Avisos'}
            >
              <BrandIcon name="notificaciones" />
              {unreadNotifications > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-white bg-[#e2492f] px-1 text-[10px] font-semibold text-white">
                  {unreadNotifications}
                </span>
              )}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Tu cuenta"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-brand text-sm font-semibold text-white"
              >
                {initials(userProfile.displayName) || <UserCircle2 className="h-5 w-5" />}
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-white py-2 text-sm shadow-[0_12px_32px_rgba(23,33,35,.16)]"
                >
                  <div className="px-4 pb-2 pt-1">
                    <p className="font-semibold text-ink">{userProfile.displayName}</p>
                    <p className="text-[13px] text-muted">{formatCategory(userProfile.category)} categoría</p>
                  </div>
                  <MenuItem icon={<UserCircle2 className="h-4 w-4" />} label="Mi perfil" onClick={() => go('profile')} />
                  <MenuItem icon={<Users className="h-4 w-4" />} label="Amigos" onClick={() => go('friends')} />
                  {clubs.length > 1 && (
                    <div className="px-4 py-2">
                      <label htmlFor="club-selector" className="mb-1 block text-xs font-medium text-muted">
                        Club
                      </label>
                      <select
                        id="club-selector"
                        value={activeClub?.id || ''}
                        onChange={(e) => {
                          onSelectClub(e.target.value);
                          setMenuOpen(false);
                        }}
                        className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:border-emerald-600 focus:outline-none"
                      >
                        {clubs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {managementItems.length > 0 && (
                    <>
                      <div className="my-1 border-t border-line" />
                      <p className="px-4 pb-1 pt-1.5 text-xs font-medium text-muted">Gestión del club</p>
                      {managementItems.map((m) => (
                        <MenuItem key={m.id} icon={m.icon} label={m.label} active={activeTab === m.id} onClick={() => go(m.id)} />
                      ))}
                    </>
                  )}
                  {onResetDemo && (
                    <>
                      <div className="my-1 border-t border-line" />
                      <MenuItem
                        icon={<RotateCcw className="h-4 w-4" />}
                        label="Reiniciar demo"
                        onClick={() => {
                          setMenuOpen(false);
                          onResetDemo();
                        }}
                      />
                    </>
                  )}
                  <div className="my-1 border-t border-line" />
                  <div className="px-4 py-1.5">
                    <PWAInstallButton compact />
                  </div>
                  <MenuItem
                    icon={<LogOut className="h-4 w-4" />}
                    label="Cerrar sesión"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        {isManaging && (
          <div className="border-t border-line bg-ink text-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-1.5 text-xs sm:px-6">
              <span>Estás en la gestión del club</span>
              <button type="button" onClick={() => go('home')} className="cursor-pointer font-semibold text-action">
                Volver a la app
              </button>
            </div>
          </div>
        )}
      </header>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-white/95 backdrop-blur-md md:hidden pb-safe"
        aria-label="Principal"
      >
        <div className="grid grid-cols-5 pt-2 pb-1.5">
          {PLAYER_NAV.map((item) => {
            const active = isActive(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[48px] cursor-pointer flex-col items-center justify-center gap-0.5 text-[11.5px] ${
                  active ? 'font-semibold text-brand' : 'font-medium text-muted'
                }`}
              >
                <span className={`flex h-7 items-center justify-center rounded-full ${active ? 'w-14 bg-mist' : 'w-7'}`}>
                  <BrandIcon name={item.icon} size={22} />
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }> = ({
  icon,
  label,
  onClick,
  active,
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-surface ${
      active ? 'font-semibold text-brand' : 'text-ink'
    }`}
  >
    <span className="text-brand">{icon}</span>
    {label}
  </button>
);
