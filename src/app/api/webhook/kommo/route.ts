import { NextResponse, type NextRequest } from 'next/server';
import {
  wasMessageProcessed,
  markMessageProcessed,
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getRecentHistory,
  updateConversationCatalinaData,
} from '@/lib/db';
import { callCatalina } from '@/lib/openrouter';
import { sendTextMessage } from '@/lib/chatarchitect/client';
import { syncToKommo } from '@/lib/kommo/client';
import { triggerZapierAction } from '@/lib/zapier/client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await req.json();
  } else {
    const text = await req.text();
    // Kommo puede enviar form-urlencoded
    body = Object.fromEntries(new URLSearchParams(text));
  }

  console.log('[kommo-wh] payload recibido:', JSON.stringify(body).slice(0, 600));

  const incoming = extractIncomingMessage(body);
  if (!incoming) {
    console.log('[kommo-wh] no es mensaje entrante, ignorando');
    return NextResponse.json({ ok: true });
  }

  const { messageId, text, _contactId, _leadId } = incoming;

  if (!text || !_contactId) {
    console.log('[kommo-wh] falta text o contactId, ignorando');
    return NextResponse.json({ ok: true });
  }

  // Dedup
  const dedupKey = `kommo-msg-${messageId}`;
  if (wasMessageProcessed(dedupKey)) {
    console.log(`[kommo-wh] mensaje ${messageId} ya procesado`);
    return NextResponse.json({ ok: true });
  }
  markMessageProcessed(dedupKey);

  // Responder 200 inmediatamente
  void processMessage({ contactId: _contactId, leadId: _leadId, text }).catch((err) =>
    console.error('[kommo-wh] error en procesamiento:', err)
  );

  return NextResponse.json({ ok: true });
}

async function processMessage(params: {
  contactId: number;
  leadId: string | null;
  text: string;
}): Promise<void> {
  const { contactId, leadId, text } = params;

  // Buscar teléfono real del contacto en Kommo
  const contact = await fetchKommoContact(contactId);
  if (!contact?.phone) {
    console.error(`[kommo-wh] no se encontró teléfono para contacto ${contactId}`);
    return;
  }
  const { phone, name } = contact;

  const convo = getOrCreateConversation(phone, name);
  if (leadId && !convo.kommo_lead_id) {
    updateConversationCatalinaData(convo.id, { kommo_lead_id: parseInt(leadId) });
  }
  insertMessage(convo.id, 'user', text);

  console.log(`[kommo-wh] ← ${phone} (${name ?? 'sin nombre'}): "${text.slice(0, 80)}"`);

  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== 'AI') {
    console.log(`[kommo-wh] conversación ${phone} en modo HUMAN, no respondo`);
    return;
  }

  const t0 = Date.now();
  const history = getRecentHistory(convo.id, 20);
  const catalinaOutput = await callCatalina(history, fresh);
  console.log(`[kommo-wh] LLM respondió en ${Date.now() - t0}ms`);

  updateConversationCatalinaData(convo.id, {
    catalina_nombre: catalinaOutput.nombre || fresh.catalina_nombre || undefined,
    catalina_ciudad: catalinaOutput.ciudad || fresh.catalina_ciudad || undefined,
    catalina_tipo_persona: catalinaOutput.tipo_persona || fresh.catalina_tipo_persona || undefined,
    catalina_consumo: catalinaOutput.consumo || fresh.catalina_consumo || undefined,
    catalina_consentimiento: catalinaOutput.consentimiento,
    lead_temperature: catalinaOutput.lead_temperature,
    kommo_status_id: catalinaOutput.new_status_id,
    catalina_cita_estado: catalinaOutput.cita_estado,
    catalina_cita_preferencia: catalinaOutput.cita_preferencia,
    last_catalina_json: JSON.stringify(catalinaOutput),
  });

  insertMessage(convo.id, 'assistant', catalinaOutput.message_to_send);
  const { message_id } = await sendTextMessage(phone, catalinaOutput.message_to_send);
  console.log(`[kommo-wh] → enviado a ${phone} (ca_id: ${message_id})`);

  void syncToKommo(convo.id, phone, name, catalinaOutput).catch((err) =>
    console.error('[kommo] error sync:', err)
  );

  if (catalinaOutput.zapier_action !== 'none') {
    void triggerZapierAction(convo.id, catalinaOutput).catch((err) =>
      console.error('[zapier] error:', err)
    );
  }
}

// ── Parser — soporta formato v1 y v2 de Kommo chat webhooks ──────────────────

interface IncomingMessage {
  messageId: string;
  phone: string;
  name: string | null;
  text: string;
  _contactId: number;
  _leadId: string | null;
}

function extractIncomingMessage(body: Record<string, unknown>): IncomingMessage | null {
  // Formato real de Kommo: form-urlencoded aplanado
  // message[add][0][type] = "incoming" | "outgoing"
  // message[add][0][contact_id] = ID del contacto en Kommo
  // message[add][0][text] = texto del mensaje
  // message[add][0][element_id] = ID del lead
  const flatType = String(body['message[add][0][type]'] ?? '');
  if (flatType === 'incoming') {
    const text = String(body['message[add][0][text]'] ?? '').trim();
    const contactId = Number(body['message[add][0][contact_id]'] ?? 0);
    const messageId = String(body['message[add][0][id]'] ?? Date.now());
    const leadId = body['message[add][0][element_id]'] ? String(body['message[add][0][element_id]']) : null;

    if (text && contactId) {
      // Devolvemos contactId como placeholder — fetchKommoContact lo convierte en phone
      return { messageId, phone: String(contactId), name: null, text, _contactId: contactId, _leadId: leadId };
    }
  }

  return null;
}

function normalizePhone(raw: string): string {
  // Eliminar todo excepto dígitos y el + inicial
  return raw.replace(/[^\d+]/g, '');
}
