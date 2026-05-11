'use client';

import { getStageName } from '@/lib/kommo/pipeline';
import type { LeadItem } from '@/app/page';

interface Props {
  leads: LeadItem[];
  selectedLeadId: number | null;
  onSelect: (leadId: number) => void;
}

const TEMP_COLORS: Record<string, string> = {
  caliente: 'bg-red-900/60 text-red-300',
  tibio:    'bg-amber-900/60 text-amber-300',
  frio:     'bg-blue-900/60 text-blue-300',
};

export default function LeadList({ leads, selectedLeadId, onSelect }: Props) {
  if (leads.length === 0) {
    return (
      <div className="p-6 text-slate-500 text-sm text-center">
        No hay leads en Kommo aún.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-700/50">
      {leads.map((lead) => {
        const isSelected = lead.kommo_lead_id === selectedLeadId;
        const time = lead.last_message_at ?? lead.updated_at;
        const timeStr = time
          ? new Date(time * 1000).toLocaleString('es-CO', {
              day: '2-digit', month: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })
          : '';

        const hasConvo = lead.conversation_id !== null;
        const tempColor = TEMP_COLORS[lead.lead_temperature] ?? TEMP_COLORS.frio;

        return (
          <li key={lead.kommo_lead_id}>
            <button
              onClick={() => onSelect(lead.kommo_lead_id)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors ${
                isSelected ? 'bg-slate-700' : ''
              }`}
            >
              {/* Fila 1: nombre + hora */}
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-200 text-sm truncate">
                  {lead.name}
                </span>
                <span className="text-xs text-slate-500 shrink-0 ml-2">{timeStr}</span>
              </div>

              {/* Fila 2: lead ID + etapa */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-slate-500">#{lead.kommo_lead_id}</span>
                <span className="text-xs text-slate-400 truncate">
                  {getStageName(lead.kommo_status_id)}
                </span>
              </div>

              {/* Fila 3: badges */}
              <div className="flex items-center gap-1.5">
                {hasConvo && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    lead.mode === 'AI'
                      ? 'bg-emerald-900/60 text-emerald-300'
                      : 'bg-amber-900/60 text-amber-300'
                  }`}>
                    {lead.mode === 'AI' ? 'IA' : 'HUMANO'}
                  </span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${tempColor}`}>
                  {lead.lead_temperature}
                </span>
                {!hasConvo && (
                  <span className="text-xs text-slate-600 italic">sin chat aún</span>
                )}
              </div>

              {/* Último mensaje */}
              {lead.last_message_content && (
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {lead.last_message_content}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
