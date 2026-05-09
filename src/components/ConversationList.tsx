'use client';

import TemperatureBadge from './TemperatureBadge';

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: 'AI' | 'HUMAN';
  lead_temperature: 'frio' | 'tibio' | 'caliente';
  last_message_content: string | null;
  last_message_at: number | null;
}

interface Props {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export default function ConversationList({ conversations, selectedId, onSelect }: Props) {
  if (conversations.length === 0) {
    return (
      <div className="p-6 text-slate-500 text-sm text-center">
        Sin conversaciones aún.<br />
        Configura el webhook y envía un mensaje de prueba.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-700/50">
      {conversations.map((c) => {
        const isSelected = c.id === selectedId;
        const time = c.last_message_at
          ? new Date(c.last_message_at * 1000).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';

        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors ${
                isSelected ? 'bg-slate-700' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-slate-200 text-sm truncate">
                  {c.name || c.phone}
                </span>
                <span className="text-xs text-slate-500 shrink-0 ml-2">{time}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    c.mode === 'AI'
                      ? 'bg-emerald-900 text-emerald-300'
                      : 'bg-amber-900 text-amber-300'
                  }`}
                >
                  {c.mode === 'AI' ? 'IA' : 'HUMANO'}
                </span>
                <TemperatureBadge temperature={c.lead_temperature} />
              </div>
              {c.last_message_content && (
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {c.last_message_content}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
