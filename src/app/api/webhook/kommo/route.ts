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
import {
  sendTextMessage,
  sendAudioMessage,
  sendVideoMessage,
  sendImageMessage,
  sendDocumentMessage,
} from '@/lib/chatarchitect/client';
import { syncToKommo } from '@/lib/kommo/client';
import { callZapierTool, zapierMcpConfigured } from '@/lib/zapier/mcp-client';
import { callSchedulingAgent, shouldTriggerScheduling } from '@/lib/scheduling';

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

  console.log('[kommo-wh] payload recibido:', JSON.stringify(body).slice(0, 600));

  const incoming = extractIncomingMessage(body);
  if (!incoming) {
    console.log('[kommo-wh] no es mensaje entrante, ignorando');
    return NextResponse.json({ ok: true });
  }

  const { messageId, text, attachmentUrl, attachmentType, _contactId, _leadId, _talkId } = incoming;

  if (!text && !attachmentUrl) {
    console.log('[kommo-wh] sin texto ni adjunto, ignorando');
    return NextResponse.json({ ok: true });
  }
  if (!_contactId) return NextResponse.json({ ok: true });

  // Dedup
  const dedupKey = `kommo-msg-${messageId}`;
  if (wasMessageProcessed(dedupKey)) {
    console.log(`[kommo-wh] mensaje ${messageId} ya procesado`);
    return NextResponse.json({ ok: true });
  }
  markMessageProcessed(dedupKey);

  void processMessage({
    contactId: _contactId,
    leadId: _leadId,
    talkId: _talkId,
    text,
    attachmentUrl,
    attachmentType,
  }).catch((err) => console.error('[kommo-wh] error en procesamiento:', err));

  return NextResponse.json({ ok: true });
}

async function processMessage(params: {
  contactId: number;
  leadId: string | null;
  talkId: string | null;
  text: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
}): Promise<void> {
  const { contactId, leadId, text, attachmentUrl, attachmentType } = params;

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

  // Extraer contenido de adjuntos via MCP
  let resolvedText = text;
  if (attachmentUrl && zapierMcpConfigured()) {
    const extracted = await extractAttachmentContent(attachmentUrl, attachmentType ?? '');
    if (extracted) {
      resolvedText = extracted;
      console.log(`[kommo-wh] adjunto procesado (${attachmentType}): "${extracted.slice(0, 100)}"`);
    } else if (!text) {
      // No se pudo extraer y no hay texto
      const reply = 'Recibí tu archivo pero no pude procesarlo. ¿Puedes describirme lo que necesitas en texto?';
      insertMessage(convo.id, 'assistant', reply);
      await sendTextMessage(phone, reply);
      return;
    }
  }

  if (!resolvedText) return;

  insertMessage(convo.id, 'user', resolvedText);
  console.log(`[kommo-wh] ← ${phone} (${name ?? 'sin nombre'}): "${resolvedText.slice(0, 80)}"`);

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

  // Si el lead debe ir a agendamiento, delegamos al agente especializado
  if (shouldTriggerScheduling(catalinaOutput.cita_estado ?? '', catalinaOutput.new_status_id)) {
    void handleScheduling(convo.id, phone, resolvedText, fresh, catalinaOutput).catch((err) =>
      console.error('[scheduling] error:', err)
    );
  }

  insertMessage(convo.id, 'assistant', catalinaOutput.message_to_send);
  const { message_id } = await sendTextMessage(phone, catalinaOutput.message_to_send);
  console.log(`[kommo-wh] → enviado a ${phone} (ca_id: ${message_id})`);

  // Enviar medios si Claude los indicó en el JSON
  void sendMediaIfNeeded(phone, catalinaOutput).catch((err) =>
    console.error('[chatarchitect] error enviando media:', err)
  );

  void syncToKommo(convo.id, phone, name, catalinaOutput).catch((err) =>
    console.error('[kommo] error sync:', err)
  );
}

// ── Agente de agendamiento ────────────────────────────────────────────────

async function handleScheduling(
  conversationId: number,
  phone: string,
  userMessage: string,
  convo: import('@/lib/db').Conversation,
  catalinaOutput: import('@/lib/openrouter').CatalinaOutput
): Promise<void> {
  const result = await callSchedulingAgent(userMessage, {
    ...convo,
    catalina_cita_preferencia: catalinaOutput.cita_preferencia || convo.catalina_cita_preferencia,
    catalina_cita_estado: catalinaOutput.cita_estado || convo.catalina_cita_estado,
    lead_temperature: catalinaOutput.lead_temperature || convo.lead_temperature,
  });

  if (!result) return;

  console.log(`[scheduling] → ${result.cita_estado}, meet: ${result.meet_link}`);

  // Guardar en DB y enviar al cliente
  const { insertMessage: ins, updateConversationCatalinaData: upd } = await import('@/lib/db');
  ins(conversationId, 'assistant', result.message_to_send);
  await sendTextMessage(phone, result.message_to_send);

  upd(conversationId, {
    catalina_cita_estado: result.cita_estado,
    catalina_cita_preferencia: result.cita_preferencia,
  });
}

// ── Envío de media via ChatArchitect ─────────────────────────────────────

async function sendMediaIfNeeded(
  phone: string,
  output: import('@/lib/openrouter').CatalinaOutput
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (output.audio_url && output.audio_url !== 'generate') {
    tasks.push(sendAudioMessage(phone, output.audio_url));
  }
  if (output.video_url) {
    tasks.push(sendVideoMessage(phone, output.video_url));
  }
  if ((output as unknown as Record<string, string>).image_url) {
    tasks.push(sendImageMessage(phone, (output as unknown as Record<string, string>).image_url));
  }
  if (output.pdf_url) {
    tasks.push(sendDocumentMessage(phone, output.pdf_url, output.pdf_filename ?? undefined));
  }

  if (tasks.length > 0) await Promise.allSettled(tasks);
}

// ── Extracción de contenido de adjuntos via Zapier MCP ────────────────────

async function extractAttachmentContent(url: string, type: string): Promise<string | null> {
  const label = type === 'voice' || type === 'audio' ? 'audio' : type === 'file' || type === 'document' ? 'documento' : 'archivo';
  console.log(`[kommo-wh] extrayendo ${label} con AI by Zapier...`);
  try {
    const result = await callZapierTool('ai_by_zapier_extract_content_from_url', {
      instructions: `Extrae o transcribe el contenido de este ${label} enviado por un cliente a un asistente de ventas de energía solar en Colombia. Si es audio, transcribe exactamente lo que dice.`,
      output_hint: 'transcripción o texto extraído en español',
      url,
    }) as Record<string, unknown>;
    return extractText(result);
  } catch (err) {
    console.error(`[kommo-wh] error extrayendo adjunto (${type}):`, err);
    return null;
  }
}

function extractText(result: Record<string, unknown>): string | null {
  const text = (
    result?.output ??
    result?.text ??
    result?.content ??
    result?.transcript ??
    result?.response ??
    result?.result
  ) as string | undefined;
  return text?.trim() || null;
}

// ── Parser ────────────────────────────────────────────────────────────────

interface IncomingMessage {
  messageId: string;
  text: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  _contactId: number;
  _leadId: string | null;
  _talkId: string | null;
  phone: string;
  name: string | null;
}

function extractIncomingMessage(body: Record<string, unknown>): IncomingMessage | null {
  const flatType = String(body['message[add][0][type]'] ?? '');
  if (flatType !== 'incoming') return null;

  const contactId = Number(body['message[add][0][contact_id]'] ?? 0);
  if (!contactId) return null;

  const messageId = String(body['message[add][0][id]'] ?? Date.now());
  const leadId = body['message[add][0][element_id]'] ? String(body['message[add][0][element_id]']) : null;
  const talkId = body['message[add][0][talk_id]'] ? String(body['message[add][0][talk_id]']) : null;

  const text = String(body['message[add][0][text]'] ?? '').trim();
  const attachmentType = String(body['message[add][0][attachment][type]'] ?? '') || null;
  const attachmentUrl = String(body['message[add][0][attachment][link]'] ?? '') || null;

  if (!text && !attachmentUrl) return null;

  return {
    messageId,
    text,
    attachmentUrl,
    attachmentType,
    _contactId: contactId,
    _leadId: leadId,
    _talkId: talkId,
    phone: String(contactId),
    name: null,
  };
}

async function fetchKommoContact(contactId: number): Promise<{ phone: string | null; name: string | null } | null> {
  const base = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api/v4`;
  const res = await fetch(`${base}/contacts/${contactId}`, {
    headers: { 'Authorization': `Bearer ${process.env.KOMMO_LONG_LIVED_TOKEN ?? ''}` },
  });
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
