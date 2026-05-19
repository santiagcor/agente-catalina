'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  ciudad: 'Ciudad',
  tipo_persona: 'Tipo',
  consumo: 'Consumo (kWh)',
  consentimiento: 'Consentimiento',
  cita_estado: 'Cita estado',
  cita_preferencia: 'Cita preferencia',
};

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
      setSyncMsg(res.ok ? '✓ Sincronizado' : `✗ ${json.error}`);
    } catch {
      setSyncMsg('✗ Error de red');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden bg-slate-800/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">Catalina</span>
          {catalinaNombre && <span className="text-slate-200 font-semibold">· {catalinaNombre}</span>}
        </div>
        <div className="flex items-center gap-2">
          <TemperatureBadge temperature={leadTemperature} />
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-slate-500 text-xs"
          >
            ▼
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 border-t border-slate-700/50 space-y-3">
              {/* Datos del lead */}
              {parsed && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {Object.entries(FIELD_LABELS).map(([key, label]) => {
                    const val = String(parsed![key] || '—');
                    const isEmpty = val === '—';
                    return (
                      <div key={key}>
                        <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                        <p className={`text-sm truncate ${isEmpty ? 'text-slate-600 italic' : 'text-slate-200'}`}>
                          {val}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pipeline */}
              <div className="pt-1 border-t border-slate-700/40">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Pipeline</p>
                <p className="text-sm text-slate-200">
                  {kommoStatusId ? `${getStageName(kommoStatusId)}` : '—'}
                  {kommoLeadId && <span className="text-slate-500 ml-2 text-xs">Lead #{kommoLeadId}</span>}
                </p>
              </div>

              {/* JSON raw */}
              <details className="text-xs">
                <summary className="text-slate-500 cursor-pointer hover:text-slate-300 select-none">
                  Ver JSON completo
                </summary>
                <pre className="mt-2 p-3 bg-slate-900 rounded-lg overflow-x-auto text-slate-400 text-xs leading-relaxed">
                  {catalinaJson ? JSON.stringify(parsed, null, 2) : '(sin datos)'}
                </pre>
              </details>

              {/* Sync Kommo */}
              <div className="flex items-center gap-3 pt-1">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSync}
                  disabled={syncing}
                  className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
                >
                  {syncing ? 'Sincronizando…' : 'Sync Kommo'}
                </motion.button>
                <AnimatePresence>
                  {syncMsg && (
                    <motion.span
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={`text-xs ${syncMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {syncMsg}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
