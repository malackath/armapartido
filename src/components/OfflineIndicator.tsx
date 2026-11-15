import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../lib/pwa';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg md:bottom-4">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Sin conexión — Mostrando datos en caché</span>
    </div>
  );
};
