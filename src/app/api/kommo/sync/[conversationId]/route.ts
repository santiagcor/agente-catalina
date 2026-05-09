import { NextResponse, type NextRequest } from 'next/server';
import { getConversationById } from '@/lib/db';
import { syncToKommo } from '@/lib/kommo/client';
import type { CatalinaOutput } from '@/lib/openrouter';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const id = parseInt(conversationId);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let catalinaData: Partial<CatalinaOutput> = {};
  if (convo.last_catalina_json) {
    try {
      catalinaData = JSON.parse(convo.last_catalina_json) as Partial<CatalinaOutput>;
    } catch {
      // usar defaults
    }
  }

  // Construir un CatalinaOutput completo desde los datos de la conversación
  const output: CatalinaOutput = {
    message_to_send: '',
    new_status_id: catalinaData.new_status_id ?? convo.kommo_status_id ?? '99597483',
    nombre: catalinaData.nombre ?? convo.catalina_nombre ?? '',
    ciudad: catalinaData.ciudad ?? convo.catalina_ciudad ?? '',
    tipo_persona: (catalinaData.tipo_persona ?? convo.catalina_tipo_persona ?? '') as CatalinaOutput['tipo_persona'],
    consumo: catalinaData.consumo ?? convo.catalina_consumo ?? '',
    consentimiento: (catalinaData.consentimiento ?? convo.catalina_consentimiento ?? 'pendiente') as CatalinaOutput['consentimiento'],
    lead_temperature: (catalinaData.lead_temperature ?? convo.lead_temperature ?? 'frio') as CatalinaOutput['lead_temperature'],
    zapier_action: 'none',
    zapier_notes: '',
    pdf_url: null,
    audio_url: null,
    video_url: null,
    pdf_filename: null,
    cita_preferencia: catalinaData.cita_preferencia ?? convo.catalina_cita_preferencia ?? '',
    cita_estado: (catalinaData.cita_estado ?? convo.catalina_cita_estado ?? '') as CatalinaOutput['cita_estado'],
  };

  try {
    await syncToKommo(id, convo.phone, convo.name, output);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
