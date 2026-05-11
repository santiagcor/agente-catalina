import { getConversationById, logZapierAction, insertMessage } from '@/lib/db';
import type { CatalinaOutput } from '@/lib/openrouter';
import { callZapierTool, zapierMcpConfigured } from './mcp-client';
import { sendTextMessage } from '@/lib/chatarchitect/client';

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
      // Escribir datos → esperar cálculo → leer resultado → enviar al cliente
      await writeToSheets(payload);

      // Esperar que el Sheet calcule (fórmulas son casi instantáneas en Sheets)
      await new Promise(r => setTimeout(r, 4000));

      const precotizacion = await readAndFormatPrecotizacion(payload);

      if (precotizacion) {
        insertMessage(conversationId, 'assistant', precotizacion);
        await sendTextMessage(convo.phone, precotizacion);
        console.log(`[zapier] precotización enviada a ${convo.phone}`);
      }
    } else if (action === 'read_sheets') {
      // Lectura directa (cuando Catalina lo pide explícitamente en un 2do turno)
      await readAndFormatPrecotizacion(payload);
    }

    logZapierAction(conversationId, action, 'ok', JSON.stringify(payload), 'ok');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logZapierAction(conversationId, action, 'error', JSON.stringify(payload), message);
    throw err;
  }
}

// ── Write a la hoja "formulario" (fila 2, columnas fijas) ─────────────────

async function writeToSheets(payload: SheetsPayload): Promise<void> {
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

// ── Read de hoja "precotización" y formatear para WhatsApp ───────────────

async function readAndFormatPrecotizacion(payload: SheetsPayload): Promise<string | null> {
  let result: unknown;
  try {
    result = await callZapierTool('google_sheets_get_many_spreadsheet_rows_advanced', {
      instructions: 'Lee los resultados de la precotización calculada para el cliente: número de paneles, potencia del sistema en kWp, precio total del sistema, ahorro mensual estimado, tiempo de retorno de inversión',
      output_hint: 'paneles, potencia kWp, precio total COP, ahorro mensual COP, tiempo retorno años',
    });
  } catch (err) {
    console.error('[zapier] error leyendo precotización:', err);
    return null;
  }

  console.log('[zapier] precotización raw:', JSON.stringify(result).slice(0, 400));

  // Intentar extraer datos del resultado
  const data = extractPrecotizacionData(result);
  if (!data) return null;

  return formatPrecotizacionMessage(data, payload);
}

interface PrecotizacionData {
  paneles?: string;
  potencia?: string;
  precio?: string;
  ahorro?: string;
  retorno?: string;
  [key: string]: string | undefined;
}

function extractPrecotizacionData(result: unknown): PrecotizacionData | null {
  if (!result || typeof result !== 'object') return null;

  // Zapier puede devolver el resultado en varias formas
  const r = result as Record<string, unknown>;
  const rows = (r.rows ?? r.output ?? r.data ?? r) as unknown;

  // Si es array, tomar primera fila con datos
  if (Array.isArray(rows) && rows.length > 0) {
    const row = rows[0] as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), String(v ?? '')])
    ) as PrecotizacionData;
  }

  // Si ya es un objeto plano
  if (typeof rows === 'object' && rows !== null) {
    return Object.fromEntries(
      Object.entries(rows as Record<string, unknown>).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), String(v ?? '')])
    ) as PrecotizacionData;
  }

  return null;
}

function formatPrecotizacionMessage(data: PrecotizacionData, payload: SheetsPayload): string {
  // Buscar valores por posibles nombres de columna
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = data[k] ?? data[k.replace(/_/g, ' ')] ?? data[k.replace(/_/g, '')];
      if (val && val !== '0' && val !== '') return val;
    }
    return null;
  };

  const paneles  = get('paneles', 'num_paneles', 'cantidad_paneles', 'col_a', 'a');
  const potencia = get('potencia', 'potencia_kwp', 'kwp', 'col_b', 'b');
  const precio   = get('precio', 'precio_total', 'valor_total', 'col_c', 'c');
  const ahorro   = get('ahorro', 'ahorro_mensual', 'col_d', 'd');
  const retorno  = get('retorno', 'tiempo_retorno', 'payback', 'col_e', 'e');

  const nombre = payload.nombre ?? 'cliente';

  let msg = `Tu precotización está lista, ${nombre}.\n\n`;

  if (paneles)  msg += `Paneles: ${paneles}\n`;
  if (potencia) msg += `Potencia: ${potencia} kWp\n`;
  if (precio)   msg += `Inversión estimada: $${precio} COP\n`;
  if (ahorro)   msg += `Ahorro mensual aprox: $${ahorro} COP\n`;
  if (retorno)  msg += `Retorno de inversión: ${retorno} años\n`;

  if (!paneles && !precio) {
    // Si no se reconocen las columnas, enviar datos crudos
    const vals = Object.values(data).filter(v => v && v !== '0');
    if (vals.length > 0) {
      msg += vals.slice(0, 6).join(' | ');
    } else {
      return '';
    }
  }

  msg += '\n¿Te gustaría hablar con un asesor para revisar esta propuesta en detalle?';
  return msg.trim();
}

// ── Nota de voz: ElevenLabs → ChatArchitect ───────────────────────────────

export async function sendVoiceNote(phone: string, text: string): Promise<void> {
  if (!zapierMcpConfigured()) return;

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

  const phoneNum = parseInt(phone.replace(/\D/g, ''));
  await callZapierTool('chatarchitect_com_send_an_audio', {
    instructions: 'Envía esta nota de voz por WhatsApp al número indicado',
    output_hint: 'confirmación de envío del audio',
    destination: phoneNum,
    url: audioUrl,
  });

  console.log(`[elevenlabs] nota de voz enviada a ${phone}`);
}
