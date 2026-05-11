'use client';

import { useEffect, useState } from 'react';
import ConnectionGate from '@/components/ConnectionGate';
import DashboardHeader from '@/components/DashboardHeader';
import LeadList from '@/components/LeadList';
import ConversationPanel from '@/components/ConversationPanel';

export interface LeadItem {
  kommo_lead_id: number;
  kommo_status_id: string;
  name: string;
  phone: string | null;
  mode: 'AI' | 'HUMAN';
  lead_temperature: string;
  last_message_content: string | null;
  last_message_at: number | null;
  updated_at: number;
  conversation_id: number | null;
}

function Dashboard({ connectionInfo }: { connectionInfo: { status: string; chatarchitect?: { phone: string; name: string }; kommo?: { name: string; subdomain: string } } }) {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchLeads() {
    const res = await fetch('/api/kommo/leads');
    if (res.ok) {
      const data: LeadItem[] = await res.json();
      setLeads(data);
      if (!selectedLeadId && data.length > 0) {
        setSelectedLeadId(data[0].kommo_lead_id);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchLeads();
    const interval = setInterval(fetchLeads, 8000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = leads.find((l) => l.kommo_lead_id === selectedLeadId) ?? null;

  function handleModeChange(mode: 'AI' | 'HUMAN') {
    setLeads((prev) =>
      prev.map((l) => (l.kommo_lead_id === selectedLeadId ? { ...l, mode } : l))
    );
  }

  // ConversationPanel espera el objeto de conversación local
  const asConversation = selected?.conversation_id != null ? {
    id: selected.conversation_id,
    phone: selected.phone ?? '',
    name: selected.name,
    mode: selected.mode,
    lead_temperature: selected.lead_temperature as 'frio' | 'tibio' | 'caliente',
    kommo_lead_id: selected.kommo_lead_id,
    kommo_contact_id: null,
    kommo_status_id: selected.kommo_status_id,
    catalina_nombre: selected.name,
    catalina_consentimiento: 'pendiente',
    last_catalina_json: null,
    last_message_content: selected.last_message_content,
    last_message_at: selected.last_message_at,
  } : null;

  return (
    <div className="flex flex-col h-screen">
      <DashboardHeader connectionInfo={connectionInfo} />

      <div className="flex flex-1 overflow-hidden">
        {/* Columna izquierda: leads de Kommo */}
        <aside className="w-72 border-r border-slate-700 bg-slate-800/50 flex flex-col overflow-y-auto shrink-0">
          <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              Leads Kommo ({leads.length})
            </p>
            {loading && <span className="text-xs text-slate-600">cargando...</span>}
          </div>
          <LeadList
            leads={leads}
            selectedLeadId={selectedLeadId}
            onSelect={setSelectedLeadId}
          />
        </aside>

        {/* Columna derecha: panel */}
        <main className="flex-1 overflow-hidden">
          {selected ? (
            asConversation ? (
              <ConversationPanel
                key={asConversation.id}
                conversation={asConversation}
                onDelete={() => { setSelectedLeadId(null); fetchLeads(); }}
                onModeChange={handleModeChange}
              />
            ) : (
              <KommoOnlyPanel lead={selected} />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Selecciona un lead
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function KommoOnlyPanel({ lead }: { lead: LeadItem }) {
  const { getStageName } = require('@/lib/kommo/pipeline');
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
      <p className="text-lg font-semibold text-slate-200">{lead.name}</p>
      <p className="text-sm">Lead #{lead.kommo_lead_id}</p>
      <p className="text-sm">Etapa: {getStageName(lead.kommo_status_id)}</p>
      <p className="text-xs text-slate-600 mt-4">
        Este lead aún no ha escrito por WhatsApp.<br />
        Cuando lo haga, aparecerá el historial aquí.
      </p>
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
