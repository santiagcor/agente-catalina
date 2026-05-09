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
import { sendTextMessage } from './client';
import { syncToKommo } from '@/lib/kommo/client';
import { triggerZapierAction } from '@/lib/zapier/client';

// ── Procesador principal del webhook ───────────────────────────────────────

export async function processWebhookPayload(payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown>;

  if (p?.type !== 'message') {
    console.log(`[wh] evento ignorado: type=${p?.type}`);
    return;
  }

  const msg = p?.payload as Record<string, unknown> | undefined;
  if (!msg) return;

  if (msg.type !== 'text') {
    console.log(`[wh] mensaje no-texto ignorado: ${msg.type}`);
    return;
  }

  await handleIncomingMessage(msg);
}

// ── Manejo de mensaje individual ───────────────────────────────────────────

async function handleIncomingMessage(msg: Record<string, unknown>): Promise<void> {
  const caMessageId = msg.id as string;
  const phone = msg.from as string;
  const pushName = (msg.from_name as string) ?? null;
  const text = (msg.text as string) ?? '';

  if (!phone || !text) return;

  // 1. Dedup
  if (wasMessageProcessed(caMessageId)) {
    console.log(`[wh] mensaje ${caMessageId} ya procesado, ignorando`);
    return;
  }
  markMessageProcessed(caMessageId);

  // 2. Conversación en DB
  const convo = getOrCreateConversation(phone, pushName);
  insertMessage(convo.id, 'user', text, caMessageId);

  console.log(`[wh] ← ${phone} (${pushName ?? 'sin nombre'}): "${text.slice(0, 80)}"`);

  // 3. Verificar modo
  const fresh = getConversationById(convo.id);
  if (!fresh || fresh.mode !== 'AI') {
    console.log(`[wh] conversación ${phone} en modo HUMAN, no respondo`);
    return;
  }

  // 4. Llamar a Catalina (LLM)
  const t0 = Date.now();
  const history = getRecentHistory(convo.id, 20);
  const catalinaOutput = await callCatalina(history, fresh);
  console.log(`[wh] LLM respondió en ${Date.now() - t0}ms`);

  // 5. Actualizar datos de Catalina en DB
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

  // 6. Guardar respuesta y enviar al usuario
  insertMessage(convo.id, 'assistant', catalinaOutput.message_to_send);
  const { message_id } = await sendTextMessage(phone, catalinaOutput.message_to_send);
  console.log(`[wh] → enviado a ${phone} (ca_id: ${message_id})`);

  // 7. Sync Kommo (async)
  void syncToKommo(convo.id, phone, pushName, catalinaOutput).catch((err) =>
    console.error('[kommo] error sync:', err)
  );

  // 8. Acciones Zapier (async)
  if (catalinaOutput.zapier_action !== 'none') {
    void triggerZapierAction(convo.id, catalinaOutput).catch((err) =>
      console.error('[zapier] error:', err)
    );
  }
}
