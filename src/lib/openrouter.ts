import Anthropic from '@anthropic-ai/sdk';
import type { Conversation } from './db';

export interface CatalinaOutput {
  message_to_send: string;
  new_status_id: string;
  nombre: string;
  ciudad: string;
  tipo_persona: 'PERSONA NATURAL' | 'PERSONA JURIDICA' | '';
  consumo: string;
  consentimiento: 'si' | 'no' | 'pendiente';
  lead_temperature: 'frio' | 'tibio' | 'caliente';
  zapier_action: string;
  zapier_notes: string;
  pdf_url: string | null;
  audio_url: string | null;
  video_url: string | null;
  pdf_filename: string | null;
  cita_preferencia: string;
  cita_estado: 'pendiente' | 'propuesta' | 'confirmada' | '';
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

function getZapierMcpServer() {
  const embedId = process.env.ZAPIER_MCP_EMBED_ID;
  const secret  = process.env.ZAPIER_MCP_SECRET;
  if (!embedId || !secret) return null;
  // El secret va como Authorization: Bearer — el embedId en el URL
  return {
    type: 'url' as const,
    url: `https://mcp.zapier.com/api/mcp/s/${embedId}/mcp`,
    name: 'zapier',
    authorization_token: secret,
  };
}

export async function callCatalina(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  convo: Conversation
): Promise<CatalinaOutput> {
  const { SYSTEM_PROMPT } = await import('./system-prompt');

  const contextBlock = [
    'DATOS ACTUALES DEL LEAD EN DB:',
    `nombre: ${convo.catalina_nombre || '(vacío)'}`,
    `ciudad: ${convo.catalina_ciudad || '(vacío)'}`,
    `tipo_persona: ${convo.catalina_tipo_persona || '(vacío)'}`,
    `consumo: ${convo.catalina_consumo || '(vacío)'}`,
    `consentimiento: ${convo.catalina_consentimiento || 'pendiente'}`,
    `estado_actual: ${convo.kommo_status_id || '99597483'}`,
    `lead_temperature: ${convo.lead_temperature || 'frio'}`,
    `telefono_cliente: ${convo.phone}`,
  ].join('\n');

  const zapierServer = getZapierMcpServer();

  const params = {
    model: process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
    messages: history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    betas: ['mcp-client-2025-04-04'] as string[],
    ...(zapierServer ? { mcp_servers: [zapierServer] } : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.beta.messages as any).create(params);

  const texts: string[] = (response.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text);

  const raw = texts[texts.length - 1] ?? '{}';
  console.log('[claude] respuesta final (primeros 200):', raw.slice(0, 200));

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as CatalinaOutput;
  } catch {
    console.error('[claude] respuesta no-JSON:', raw.slice(0, 300));
    return buildFallback(raw, convo);
  }
}

function buildFallback(raw: string, convo: Conversation): CatalinaOutput {
  return {
    message_to_send: raw,
    new_status_id: convo.kommo_status_id ?? '99597483',
    nombre: convo.catalina_nombre ?? '',
    ciudad: convo.catalina_ciudad ?? '',
    tipo_persona: (convo.catalina_tipo_persona as CatalinaOutput['tipo_persona']) ?? '',
    consumo: convo.catalina_consumo ?? '',
    consentimiento: (convo.catalina_consentimiento as CatalinaOutput['consentimiento']) ?? 'pendiente',
    lead_temperature: (convo.lead_temperature as CatalinaOutput['lead_temperature']) ?? 'frio',
    zapier_action: 'none',
    zapier_notes: '',
    pdf_url: null,
    audio_url: null,
    video_url: null,
    pdf_filename: null,
    cita_preferencia: convo.catalina_cita_preferencia ?? '',
    cita_estado: (convo.catalina_cita_estado as CatalinaOutput['cita_estado']) ?? '',
  };
}
