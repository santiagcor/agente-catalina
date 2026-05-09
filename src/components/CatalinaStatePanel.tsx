'use client';

import { useState } from 'react';
import TemperatureBadge from './TemperatureBadge';
import { getStageName } from '@/lib/kommo/pipeline';

interface Props {
  conversationId: number;
  catalinaJson: string | null;
  catalinaNombre: string | null;
  catalinaConsentimiento: string;
  leadTemperature: 'frio' | 'tibio' | 'caliente';
  kommoStatusId: string | null;
  kommoLeadId: number | null;
}

export default function CatalinaStatePanel({
  conversationId,
  catalinaJson,
  catalinaNombre,
  catalinaConsentimiento,
  leadTemperature,
  kommoStatusId,
  kommoLeadId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  let parsed: Record<string, unknown> | null = null;
  if (catalinaJson) {
    try { parsed = JSON.parse(catalinaJson); } catch { /* noop */ }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch(`/api/kommo/sync/${conversationId}`, { method: 'POST' });
      const json = await res.json();
      setSyncMsg(res.ok ? 'Sincronizado OK' : `Error: ${json.error}`);
    } catch {
      setSyncMsg('Error de red');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 bg-slate-800 hover:bg-slate-750 text-sm font-medium text-slate-300"
      >
        <span>Estado Catalina — {catalinaNombre || 'sin nombre'}</span>
        <span className="flex items-center gap-2">
          <TemperatureBadge temperature={leadTemperature} />
          <span>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="px-4 py-3 bg-slate-900 space-y-3 text-sm">
          {/* Resumen de datos */}
          <div className="grid grid-cols-2 gap-2 text-slate-300">
            {parsed && Object.entries({
              nombre: parsed.nombre,
              ciudad: parsed.ciudad,
              tipo_persona: parsed.tipo_persona,
              consumo: parsed.consumo,
              consentimiento: parsed.consentimiento,
              cita_estado: parsed.cita_estado,
              cita_preferencia: parsed.cita_preferencia,
            }).map(([k, v]) => (
              <div key={k}>
                <span className="text-slate-500 text-xs uppercase">{k}</span>
                <p className="text-slate-200 truncate">{String(v || '—')}</p>
              </div>
            ))}
          </div>

          {/* Estado pipeline */}
          <div>
            <span className="text-slate-500 text-xs uppercase">Estado pipeline</span>
            <p className="text-slate-200">
              {kommoStatusId ? `${getStageName(kommoStatusId)} (${kommoStatusId})` : '—'}
            </p>
          </div>

          {/* Kommo lead */}
          {kommoLeadId && (
            <div>
              <span className="text-slate-500 text-xs uppercase">Kommo lead ID</span>
              <p className="text-slate-200">{kommoLeadId}</p>
            </div>
          )}

          {/* JSON crudo colapsable */}
          <details className="text-xs">
            <summary className="text-slate-500 cursor-pointer hover:text-slate-300">
              Ver JSON completo
            </summary>
            <pre className="mt-2 p-2 bg-slate-800 rounded overflow-x-auto text-slate-300 text-xs">
              {catalinaJson ? JSON.stringify(parsed, null, 2) : '(sin datos)'}
            </pre>
          </details>

          {/* Botón sync Kommo */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs rounded"
            >
              {syncing ? 'Sincronizando…' : 'Sincronizar con Kommo'}
            </button>
            {syncMsg && (
              <span className={`text-xs ${syncMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                {syncMsg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
