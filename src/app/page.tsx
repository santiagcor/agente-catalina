'use client';

import { useEffect, useState } from 'react';
import ConnectionGate from '@/components/ConnectionGate';
import DashboardHeader from '@/components/DashboardHeader';
import ConversationList from '@/components/ConversationList';
import ConversationPanel from '@/components/ConversationPanel';

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: 'AI' | 'HUMAN';
  lead_temperature: 'frio' | 'tibio' | 'caliente';
  kommo_lead_id: number | null;
  kommo_contact_id: number | null;
  kommo_status_id: string | null;
  catalina_nombre: string | null;
  catalina_consentimiento: string;
  last_catalina_json: string | null;
  last_message_content: string | null;
  last_message_at: number | null;
}

function Dashboard({ connectionInfo }: { connectionInfo: { status: string; chatarchitect?: { phone: string; name: string }; kommo?: { name: string; subdomain: string } } }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  async function fetchConversations() {
    const res = await fetch('/api/conversations');
    if (res.ok) {
      const data: Conversation[] = await res.json();
      setConversations(data);
      // Auto-seleccionar primera si no hay selección
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    }
  }

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function handleDelete() {
    setSelectedId(null);
    fetchConversations();
  }

  function handleModeChange(mode: 'AI' | 'HUMAN') {
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, mode } : c))
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <DashboardHeader connectionInfo={connectionInfo} />

      <div className="flex flex-1 overflow-hidden">
        {/* Columna izquierda: lista */}
        <aside className="w-72 border-r border-slate-700 bg-slate-800/50 flex flex-col overflow-y-auto shrink-0">
          <div className="px-4 py-2 border-b border-slate-700">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              Conversaciones ({conversations.length})
            </p>
          </div>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </aside>

        {/* Columna derecha: panel */}
        <main className="flex-1 overflow-hidden">
          {selected ? (
            <ConversationPanel
              key={selected.id}
              conversation={selected}
              onDelete={handleDelete}
              onModeChange={handleModeChange}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Selecciona una conversación
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ConnectionGate>
      {(info) => <Dashboard connectionInfo={info} />}
    </ConnectionGate>
  );
}
