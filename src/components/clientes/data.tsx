/** Datos de fichas, cuponeras y ventas del club (para Mostrador y Admin) y piezas compartidas. */
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ClientPack, ClubClient, PackType, Sale } from '../../types/clientes';
import { subscribeClientes } from '../../services/clientesService';
import { formatPhone } from '../../lib/clientes';
import { CategoryBadge, PlayerAvatar } from '../ui/People';

export interface ClientesData {
  ready: boolean;
  clients: ClubClient[];
  packTypes: PackType[];
  packs: ClientPack[];
  sales: Sale[];
}

const EMPTY: ClientesData = { ready: false, clients: [], packTypes: [], packs: [], sales: [] };

export function useClientesData(clubId: string | undefined): ClientesData {
  const [data, setData] = useState<ClientesData>(EMPTY);
  useEffect(() => {
    if (!clubId) return;
    setData(EMPTY);
    const set = <K extends keyof ClientesData>(k: K) => (v: ClientesData[K]) => setData((prev) => ({ ...prev, [k]: v, ready: true }));
    const subs = subscribeClientes(clubId, {
      onClients: (v) => set('clients')([...v].sort((a, b) => a.name.localeCompare(b.name))),
      onPackTypes: (v) => set('packTypes')([...v].sort((a, b) => a.order - b.order)),
      onPacks: set('packs'),
      onSales: set('sales'),
    });
    return () => subs.forEach((u) => u());
  }, [clubId]);
  return data;
}

export const ClientesContext = createContext<ClientesData>(EMPTY);
export const useClientes = () => useContext(ClientesContext);

/** Fila de un cliente: avatar, nombre, insignia de categoría, celular y si tiene la app. */
export const ClientLine: React.FC<{
  name: string;
  phone?: string;
  category?: number | null;
  hasApp: boolean;
  extra?: React.ReactNode;
  photoUrl?: string;
  size?: number;
}> = ({ name, phone, category, hasApp, extra, photoUrl, size = 36 }) => (
  <span className="flex min-w-0 items-center gap-2.5">
    <PlayerAvatar name={name} photoUrl={photoUrl} size={size} />
    <span className="min-w-0">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-ink">{name}</span>
        {category ? <CategoryBadge category={category} size={18} showSuffix={false} /> : null}
      </span>
      <span className="block truncate text-[12px] text-muted">
        {[phone ? formatPhone(phone) : '', hasApp ? 'con app' : 'sin app'].filter(Boolean).join(' · ')}
        {extra}
      </span>
    </span>
  </span>
);

export const Tabs = <T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, React.ReactNode][] }) => (
  <div className="flex gap-1 overflow-x-auto rounded-xl bg-mist p-1">
    {items.map(([id, label]) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-semibold cursor-pointer ${value === id ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'}`}
      >
        {label}
      </button>
    ))}
  </div>
);

export const Chip: React.FC<{ on?: boolean; onClick?: () => void; children: React.ReactNode; className?: string; disabled?: boolean }> = ({ on, onClick, children, className = '', disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold cursor-pointer disabled:cursor-default disabled:opacity-40 ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:bg-mist'} ${className}`}
  >
    {children}
  </button>
);
