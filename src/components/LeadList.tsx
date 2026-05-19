'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { getStageName } from '@/lib/kommo/pipeline';
import TemperatureBadge from './TemperatureBadge';
import type { LeadItem } from '@/app/page';

interface Props {
  leads: LeadItem[];
  selectedLeadId: number | null;
  onSelect: (leadId: number) => void;
}

export default function LeadList({ leads, selectedLeadId, onSelect }: Props) {
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm gap-2">
        <span className="text-2xl opacity-40">📭</span>
        <p>No hay leads aún</p>
      </div>
    );
  }

  return (
    <ul className="py-1">
      <AnimatePresence initial={false}>
        {leads.map((lead, i) => {
          const isSelected = lead.kommo_lead_id === selectedLeadId;
          const time = lead.last_message_at ?? lead.updated_at;
          const timeStr = time
            ? new Date(time * 1000).toLocaleString('es-CO', {
                day: '2-digit', month: '2-digit',
                hour: '2-digit', minute: '2-digit',
              })
            : '';
          const hasConvo = lead.conversation_id !== null;

          return (
            <motion.li
              key={lead.kommo_lead_id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
            >
              <button
                onClick={() => onSelect(lead.kommo_lead_id)}
                className={`relative w-full text-left px-4 py-3 transition-colors group ${
                  isSelected ? 'bg-slate-700/80' : 'hover:bg-slate-800/60'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="lead-selected"
                    className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-400 rounded-r"
                  />
                )}

                {/* Nombre + hora */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium text-sm truncate pr-2 ${isSelected ? 'text-slate-100' : 'text-slate-300 group-hover:text-slate-100'}`}>
                    {lead.name}
                  </span>
                  <span className="text-xs text-slate-600 shrink-0">{timeStr}</span>
                </div>

                {/* Etapa */}
                <p className="text-xs text-slate-500 mb-1.5 truncate">
                  {getStageName(lead.kommo_status_id)}
                </p>

                {/* Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {hasConvo && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${
                      lead.mode === 'AI'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                    }`}>
                      {lead.mode === 'AI' ? '🤖 IA' : '👤 Humano'}
                    </span>
                  )}
                  <TemperatureBadge temperature={lead.lead_temperature as 'frio' | 'tibio' | 'caliente'} />
                  {!hasConvo && (
                    <span className="text-xs text-slate-700 italic">sin chat</span>
                  )}
                </div>

                {/* Último mensaje */}
                {lead.last_message_content && (
                  <p className="text-xs text-slate-600 mt-1.5 truncate">
                    {lead.last_message_content}
                  </p>
                )}
              </button>
              <div className="h-px bg-slate-800 mx-4" />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
