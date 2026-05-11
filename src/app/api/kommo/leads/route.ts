import { NextResponse } from 'next/server';
import { getConversationByLeadId } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface KommoLead {
  id: number;
  name: string;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  updated_at: number;
  _embedded?: {
    contacts?: Array<{ id: number; name: string; is_main: boolean }>;
    tags?: Array<{ name: string }>;
  };
}

export async function GET() {
  const base = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
  const headers = { Authorization: `Bearer ${process.env.KOMMO_LONG_LIVED_TOKEN ?? ''}` };

  try {
    const res = await fetch(
      `${base}/leads?with=contacts&limit=50&order[updated_at]=desc`,
      { headers }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Kommo ${res.status}` }, { status: 502 });
    }

    const json = await res.json();
    const leads: KommoLead[] = json?._embedded?.leads ?? [];

    // Enriquecer cada lead con datos locales si existen
    const enriched = leads.map((lead) => {
      const local = getConversationByLeadId(lead.id);
      const mainContact = lead._embedded?.contacts?.find((c) => c.is_main) ?? lead._embedded?.contacts?.[0];
      const tag = lead._embedded?.tags?.find((t) => t.name.startsWith('temperatura:'));
      const temperature = tag?.name.replace('temperatura:', '') ?? local?.lead_temperature ?? 'frio';

      return {
        kommo_lead_id: lead.id,
        kommo_status_id: String(lead.status_id),
        name: local?.catalina_nombre ?? mainContact?.name ?? lead.name ?? 'Sin nombre',
        phone: local?.phone ?? null,
        mode: local?.mode ?? 'AI',
        lead_temperature: temperature,
        last_message_content: local?.last_message_content ?? null,
        last_message_at: local?.last_message_at ?? lead.updated_at,
        updated_at: lead.updated_at,
        // local conversation id si existe
        conversation_id: local?.id ?? null,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[api/kommo/leads]', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
