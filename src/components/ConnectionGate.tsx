'use client';

import { useEffect, useState } from 'react';
import ConfigScreen from './ConfigScreen';

interface ConnectionStatus {
  status: 'loading' | 'missing_config' | 'error' | 'connected';
  missing?: string[];
  message?: string;
  chatarchitect?: { phone: string; name: string };
  kommo?: { name: string; subdomain: string };
  zapier?: { sheets_webhook: boolean; read_webhook: boolean };
}

interface Props {
  children: (info: ConnectionStatus) => React.ReactNode;
}

export default function ConnectionGate({ children }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>({ status: 'loading' });

  useEffect(() => {
    fetch('/api/connection/status')
      .then((r) => r.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus({ status: 'error', message: 'No se pudo conectar al servidor' }));
  }, []);

  if (status.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Verificando configuración…</p>
        </div>
      </div>
    );
  }

  if (status.status === 'missing_config') {
    return <ConfigScreen missing={status.missing ?? []} />;
  }

  if (status.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <div className="text-center max-w-sm">
          <p className="text-red-400 font-medium mb-2">Error de conexión</p>
          <p className="text-sm">{status.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-200"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return <>{children(status)}</>;
}
