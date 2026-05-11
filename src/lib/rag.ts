import { callZapierTool, zapierMcpConfigured } from './zapier/mcp-client';

// ── Google Drive document IDs ─────────────────────────────────────────────

const DOCS = {
  faqs:      '1CpC0co5rDVV-fjQKwnVDJkNCA_0XioIC',
  objeciones:'1cjGMpLIfFW4Ynu4955Q2t_b_3atfrpd6',
  reglas:    '1kh80ZSnSdJLh2m3KutO6wGwey7RlMTrc',
  interna:   '1BiFExKA2wAogA3ZVUnRxDi_1tCjzEs6B',
} as const;

// ── In-memory cache (30 min TTL) ──────────────────────────────────────────

interface CacheEntry { content: string; ts: number }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < TTL_MS) return entry.content;
  return null;
}

// ── Fetch a single Google Doc as plain text via Zapier MCP ────────────────

async function fetchDoc(key: keyof typeof DOCS): Promise<string> {
  const cached = getCached(key);
  if (cached !== null) return cached;

  try {
    const result = await callZapierTool('google_drive_export_file', {
      file_id: DOCS[key],
      mime_type: 'text/plain',
    }) as Record<string, unknown>;

    const content = (result?.content as string) ?? (result?.output as string) ?? JSON.stringify(result);
    cache.set(key, { content: content.slice(0, 8000), ts: Date.now() });
    return content.slice(0, 8000);
  } catch (err) {
    console.error(`[rag] error exportando doc ${key}:`, err);
    return '';
  }
}

// ── Check municipios coverage via Zapier MCP Sheets lookup ───────────────
// Uses "BASE DATOS MUNICIPIOS ENERGREEN" spreadsheet, lookup by "Ciudad"

export async function checkCityCoverage(ciudad: string): Promise<boolean> {
  if (!zapierMcpConfigured()) return true;

  try {
    const result = await callZapierTool('google_sheets_lookup_spreadsheet_row', {
      instructions: `Busca si la ciudad "${ciudad}" tiene cobertura en Energreen Solutions`,
      output_hint: 'nombre de la ciudad encontrada en la base de datos de municipios',
      lookup_value: ciudad,
    }) as Record<string, unknown>;

    // If lookup found a row, the city has coverage
    const found = result && typeof result === 'object' && Object.keys(result).length > 0;
    console.log(`[rag] cobertura ${ciudad}: ${found ? 'SÍ' : 'NO'}`);
    return !!found;
  } catch (err) {
    console.error('[rag] error lookup municipio:', err);
    return true; // no bloquear si falla la consulta
  }
}

// ── Fetch all RAG docs in parallel and return combined context ─────────────

export async function fetchRagContext(): Promise<string> {
  if (!zapierMcpConfigured()) return '';

  const [faqs, objeciones, reglas, interna] = await Promise.all([
    fetchDoc('faqs'),
    fetchDoc('objeciones'),
    fetchDoc('reglas'),
    fetchDoc('interna'),
  ]);

  const sections: string[] = [];
  if (faqs)      sections.push(`## PREGUNTAS FRECUENTES (FAQs)\n${faqs}`);
  if (objeciones) sections.push(`## MANEJO DE OBJECIONES\n${objeciones}`);
  if (reglas)    sections.push(`## REGLAS DE NEGOCIO\n${reglas}`);
  if (interna)   sections.push(`## INFORMACIÓN INTERNA\n${interna}`);

  return sections.join('\n\n---\n\n');
}
