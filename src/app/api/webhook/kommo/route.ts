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
    body = Object.fromEntries(new URLSearchParams(text));
  }

  console.log('[kommo-wh] payload recibido:', JSON.stringify(body).slice(0, 500));

  const incoming = extractIncomingMessage(body);
  if (!incoming) {
    console.log('[kommo-wh] no es mensaje entrante, ignorando');
    return NextResponse.json({ ok: true });
  }

  const { messageId, contactId, leadId, text } = incoming;

  // Dedup
  const dedupKey = `kommo-msg-${messageId}`;
  if (wasMessageProcessed(dedupKey)) {
    console.log(`[kommo-wh] mensaje ${messageId} ya procesado`);
    return NextResponse.json({ ok: true });
  }
  markMessageProcessed(dedupKey);

  // Procesar en background
  void processMessage({ contactId, leadId, text }).catch((err) =>
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

  // Buscar teléfono y nombre en Kommo
  const contact = await fetchKommoContact(contactId);
  if (!contact) {
    console.error(`[kommo-wh] no se encontró contacto ${contactId}`);
    return;
  }

  const { phone, name } = contact;
  if (!phone) {
    console.error(`[kommo-wh] contacto ${contactId} sin teléfono`);
    return;
  }

  const convo = getOrCreateConversation(phone, name);
  insertMessage(convo.id, 'user', text);

  if (leadId && !convo.kommo_lead_id) {
    updateConversationCatalinaData(convo.id, { kommo_lead_id: parseInt(leadId) });
  }

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

// ── Fetch contacto desde Kommo API ────────────────────────────────────────────

async function fetchKommoContact(contactId: number): Promise<{ phone: string | null; name: string | null } | null> {
  const base = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
  const headers = {
    'Authorization': `Bearer ${process.env.KOMMO_LONG_LIVED_TOKEN ?? ''}`,
  };

  const res = await fetch(`${base}/contacts/${contactId}`, { headers });
  if (!res.ok) {
    console.error(`[kommo] error al buscar contacto ${contactId}: ${res.status}`);
    return null;
  }

  const json = await res.json() as Record<string, unknown>;
  const name = (json.name as string) ?? null;

  const customFields = json.custom_fields_values as Array<Record<string, unknown>> | undefined;
  let phone: string | null = null;

  if (Array.isArray(customFields)) {
    for (const field of customFields) {
      if (field.field_code === 'PHONE') {
        const values = field.values as Array<{ value: string }> | undefined;
        phone = values?.[0]?.value ?? null;
        break;
      }
    }
  }

  return { phone, name };
}

// ── Parser del payload de Kommo (mensaje entrante) ────────────────────────────

interface IncomingMessage {
  messageId: string;
  contactId: number;
  leadId: string | null;
  text: string;
}

function extractIncomingMessage(body: Record<string, unknown>): IncomingMessage | null {
  // Formato JSON: { message: { add: [{ id, contact_id, text, author_id, ... }] } }
  const messageObj = body.message as Record<string, unknown> | undefined;
  if (messageObj) {
    const adds = messageObj.add as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(adds)) {
      for (const msg of adds) {
        // author_id = 0 significa entrante (del cliente)
        if (msg.author_id !== 0 && msg.author_id !== '0') continue;

        const text = String(msg.text ?? '').trim();
        if (!text) continue;

        return {
          messageId: String(msg.id ?? ''),
          contactId: Number(msg.contact_id ?? 0),
          leadId: msg.lead_id ? String(msg.lead_id) : null,
          text,
        };
      }
    }
  }

  // Formato form-urlencoded aplanado
  const msgType = body['message[add][0][author_id]'];
  if (msgType === '0' || msgType === 0) {
    const text = String(body['message[add][0][text]'] ?? '').trim();
    if (text) {
      return {
        messageId: String(body['message[add][0][id]'] ?? ''),
        contactId: Number(body['message[add][0][contact_id]'] ?? 0),
        leadId: body['message[add][0][lead_id]'] ? String(body['message[add][0][lead_id]']) : null,
        text,
      };
    }
  }

  return null;
}
