import { getConversationById, logZapierAction } from '@/lib/db';
import type { CatalinaOutput } from '@/lib/openrouter';
import { callZapierTool, zapierMcpConfigured } from './mcp-client';

// ── Tipos de acciones ──────────────────────────────────────────────────────

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

  // Solo procesamos write_sheets y read_sheets por ahora
  if (action !== 'write_sheets' && action !== 'read_sheets') {
    console.log(`[zapier] acción ignorada: ${action}`);
    return;
  }

  // Verificar que MCP está configurado
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

// ── Acciones específicas ───────────────────────────────────────────────────

async function writeToSheets(payload: SheetsPayload): Promise<void> {
  const spreadsheetId = process.env.ZAPIER_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.ZAPIER_SHEETS_SHEET_NAME ?? 'Leads';

  if (!spreadsheetId) {
    // Sin spreadsheet configurado, intentar con herramienta genérica de Zapier
    await callZapierTool('google_sheets_create_spreadsheet_row', {
      spreadsheet: sheetName,
      worksheet: sheetName,
      ...flattenPayload(payload),
    });
    return;
  }

  await callZapierTool('google_sheets_update_spreadsheet_row', {
    spreadsheet_id: spreadsheetId,
    worksheet: sheetName,
    ...flattenPayload(payload),
  });
}

async function readFromSheets(phone: string): Promise<unknown> {
  const spreadsheetId = process.env.ZAPIER_SHEETS_SPREADSHEET_ID;
  const sheetName = process.env.ZAPIER_SHEETS_SHEET_NAME ?? 'Leads';

  return callZapierTool('google_sheets_lookup_spreadsheet_row', {
    spreadsheet_id: spreadsheetId,
    worksheet: sheetName,
    lookup_column: 'telefono',
    lookup_value: phone,
  });
}

function flattenPayload(payload: SheetsPayload): Record<string, string> {
  return {
    nombre: payload.nombre ?? '',
    ciudad: payload.ciudad ?? '',
    tipo_persona: payload.tipo_persona ?? '',
    consumo: payload.consumo ?? '',
    consentimiento: payload.consentimiento,
    telefono: payload.telefono,
    lead_temperature: payload.lead_temperature,
    kommo_lead_id: String(payload.kommo_lead_id ?? ''),
    timestamp: payload.timestamp,
  };
}
