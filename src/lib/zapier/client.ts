import { getConversationById, logZapierAction } from '@/lib/db';
import type { CatalinaOutput } from '@/lib/openrouter';
import { callZapierTool, zapierMcpConfigured } from './mcp-client';

// ── Tipos ──────────────────────────────────────────────────────────────────

interface SheetsPayload {
  nombre: string | null;
  ciudad: string | null;
  tipo_persona: string | null;
  consumo: string | null;
  consentimiento: string;
  telefono: string;
  lead_temperature: string;
  kommo_lead_id: number | null;
  timestamp: string;
}

// ── Orquestador principal ──────────────────────────────────────────────────

export async function triggerZapierAction(
  conversationId: number,
  catalinaOutput: CatalinaOutput
): Promise<void> {
  const convo = getConversationById(conversationId);
  if (!convo) return;

  const action = catalinaOutput.zapier_action;
  if (action !== 'write_sheets' && action !== 'read_sheets') {
    console.log(`[zapier] acción ignorada: ${action}`);
    return;
  }

  if (!zapierMcpConfigured()) {
    console.log('[zapier] MCP no configurado, saltando acción');
    return;
  }

  const payload: SheetsPayload = {
    nombre: catalinaOutput.nombre || convo.catalina_nombre,
    ciudad: catalinaOutput.ciudad || convo.catalina_ciudad,
    tipo_persona: catalinaOutput.tipo_persona || convo.catalina_tipo_persona,
    consumo: catalinaOutput.consumo || convo.catalina_consumo,
    consentimiento: catalinaOutput.consentimiento,
    telefono: convo.phone,
    lead_temperature: catalinaOutput.lead_temperature,
    kommo_lead_id: convo.kommo_lead_id,
    timestamp: new Date().toISOString(),
  };

  logZapierAction(conversationId, action, 'pending', JSON.stringify(payload));

  try {
    if (action === 'write_sheets') {
      await writeToSheets(payload);
    } else if (action === 'read_sheets') {
      await readFromSheets(convo.phone);
    }
    logZapierAction(conversationId, action, 'ok', JSON.stringify(payload), 'ok');
    console.log(`[zapier] acción ${action} OK para conversación ${conversationId}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logZapierAction(conversationId, action, 'error', JSON.stringify(payload), message);
    throw err;
  }
}

// ── Write a la hoja "formulario" (fila 2, columnas fijas) ─────────────────
// El sheet calcula la precotización automáticamente al escribir los datos.

async function writeToSheets(payload: SheetsPayload): Promise<void> {
  // IVA: 0% persona natural, 19% persona jurídica
  const iva = payload.tipo_persona === 'PERSONA JURIDICA' ? '19' : '0';

  await callZapierTool('google_sheets_update_spreadsheet_row', {
    instructions: 'Escribe los datos del cliente en la fila del formulario de cotización para generar la precotización automática',
    output_hint: 'confirmación de escritura exitosa',
    COL__DOLLAR__A: payload.nombre ?? '',
    COL__DOLLAR__B: payload.telefono,
    COL__DOLLAR__D: payload.ciudad ?? '',
    COL__DOLLAR__E: payload.tipo_persona ?? '',
    COL__DOLLAR__F: iva,
    COL__DOLLAR__K: payload.consumo ?? '',
  });

  console.log(`[zapier] datos escritos en Sheet para ${payload.telefono}`);
}

// ── Read de la hoja "precotización" (calculada automáticamente) ───────────

async function readFromSheets(phone: string): Promise<unknown> {
  const result = await callZapierTool('google_sheets_get_many_spreadsheet_rows_advanced', {
    instructions: 'Lee los resultados de la precotización calculada para el cliente',
    output_hint: 'datos de la precotización: número de paneles, potencia del sistema, precio total, ahorro mensual estimado, tiempo de retorno',
  });

  console.log(`[zapier] precotización leída para ${phone}:`, JSON.stringify(result).slice(0, 200));
  return result;
}

// ── Nota de voz: ElevenLabs → ChatArchitect ───────────────────────────────

export async function sendVoiceNote(phone: string, text: string): Promise<void> {
  if (!zapierMcpConfigured()) return;

  // Limpiar texto para audio (sin emojis, sin markdown)
  const cleanText = text.replace(/[^\w\s.,;:¿?¡!áéíóúñÁÉÍÓÚÑ-]/g, ' ').replace(/\s+/g, ' ').trim();

  console.log(`[elevenlabs] generando audio para ${phone}...`);
  const audioResult = await callZapierTool('elevenlabs_convert_text_to_speech', {
    instructions: `Convierte este mensaje de Catalina (asistente de Energreen Solutions) a voz para enviarlo por WhatsApp`,
    output_hint: 'URL del archivo de audio generado',
    text: cleanText,
    model_id: 'eleven_multilingual_v2',
    output_format: 'mp3_44100_128',
  }) as Record<string, unknown>;

  const audioUrl = (audioResult?.url ?? audioResult?.audio_url ?? audioResult?.output ?? '') as string;
  if (!audioUrl) {
    console.error('[elevenlabs] no se obtuvo URL de audio:', JSON.stringify(audioResult).slice(0, 200));
    return;
  }

  console.log(`[elevenlabs] audio generado, enviando por WhatsApp...`);
  const phoneNum = parseInt(phone.replace(/\D/g, ''));
  await callZapierTool('chatarchitect_com_send_an_audio', {
    instructions: 'Envía esta nota de voz por WhatsApp al número indicado',
    output_hint: 'confirmación de envío del audio',
    destination: phoneNum,
    url: audioUrl,
  });

  console.log(`[elevenlabs] nota de voz enviada a ${phone}`);
}
