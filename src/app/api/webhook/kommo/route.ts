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

  const { messageId, phone, name, text } = incoming;

  if (!phone || !text) {
    console.log('[kommo-wh] falta phone o text, ignorando');
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
  void processMessage({ phone, name, text }).catch((err) =>
    console.error('[kommo-wh] error en procesamiento:', err)
  );

  return NextResponse.json({ ok: true });
}

async function processMessage(params: {
  phone: string;
  name: string | null;
  text: string;
}): Promise<void> {
  const { phone, name, text } = params;

  const convo = getOrCreateConversation(phone, name);
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
}

function extractIncomingMessage(body: Record<string, unknown>): IncomingMessage | null {
  // ── Formato v2 (JSON estructurado) ──────────────────────────────────────
  // { account_id, time, message: { id, sender: { profile: { phone }, name }, message: { type, text } } }
  const msgWrapper = body.message as Record<string, unknown> | undefined;
  if (msgWrapper && typeof msgWrapper === 'object' && !Array.isArray(msgWrapper)) {
    const sender = msgWrapper.sender as Record<string, unknown> | undefined;
    const innerMsg = msgWrapper.message as Record<string, unknown> | undefined;

    if (innerMsg?.type === 'text' || innerMsg?.text) {
      const text = String(innerMsg?.text ?? '').trim();
      const profile = sender?.profile as Record<string, unknown> | undefined;
      const phone = normalizePhone(
        String(profile?.phone ?? sender?.id ?? '')
      );
      const name = (sender?.name as string) ?? null;
      const messageId = String(msgWrapper.id ?? msgWrapper.timestamp ?? Date.now());

      if (phone && text) {
        return { messageId, phone, name, text };
      }
    }
  }

  // ── Formato v1 (plano) ──────────────────────────────────────────────────
  // { receiver, conversation_id, type, text }
  if (body.type === 'text' && body.text) {
    const text = String(body.text).trim();
    // En v1 el teléfono viene en "receiver" o "conversation_id"
    const phone = normalizePhone(
      String(body.receiver ?? body.conversation_id ?? '')
    );
    const messageId = String(body.conversation_id ?? Date.now());
    const name = null;

    if (phone && text) {
      return { messageId, phone, name, text };
    }
  }

  return null;
}

function normalizePhone(raw: string): string {
  // Eliminar todo excepto dígitos y el + inicial
  return raw.replace(/[^\d+]/g, '');
}
