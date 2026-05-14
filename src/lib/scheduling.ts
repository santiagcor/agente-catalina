import OpenAI from 'openai';
import type { Conversation } from './db';
import { SCHEDULING_PROMPT } from './scheduling-prompt';

export interface SchedulingOutput {
  message_to_send: string;
  cita_estado: 'pendiente' | 'propuesta' | 'confirmada';
  cita_preferencia: string;
  meet_link: string | null;
}

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://energreensolutions.co',
    'X-Title': 'Agente Catalina - Agendamiento',
  },
});

export async function callSchedulingAgent(
  userMessage: string,
  convo: Conversation
): Promise<SchedulingOutput | null> {
  const embedId = process.env.ZAPIER_MCP_EMBED_ID;
  const secret  = process.env.ZAPIER_MCP_SECRET;

  if (!embedId || !secret) {
    console.log('[scheduling] MCP no configurado, saltando agendamiento');
    return null;
  }

  const contextBlock = [
    'DATOS DEL LEAD:',
    `nombre: ${convo.catalina_nombre || '(vacío)'}`,
    `ciudad: ${convo.catalina_ciudad || '(vacío)'}`,
    `telefono: ${convo.phone}`,
    `tipo_persona: ${convo.catalina_tipo_persona || '(vacío)'}`,
    `consumo: ${convo.catalina_consumo || '(vacío)'}`,
    `cita_preferencia: ${convo.catalina_cita_preferencia || '(sin preferencia aún)'}`,
    `cita_estado: ${convo.catalina_cita_estado || 'pendiente'}`,
    `lead_temperature: ${convo.lead_temperature || 'frio'}`,
  ].join('\n');

  const mcpUrl = `https://mcp.zapier.com/api/mcp/s/${embedId}/mcp`;

  console.log('[scheduling] llamando agente de agendamiento via OpenRouter + MCP');

  try {
    // OpenRouter soporta tool_choice y tools — usamos el plugin de Zapier via MCP
    // Por ahora llamamos sin tools (el LLM gestiona el flujo con el contexto)
    // TODO: integrar MCP tools cuando OpenRouter soporte MCP servers
    const completion = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.2,
      messages: [
        { role: 'system', content: `${SCHEDULING_PROMPT}\n\nMCP Server disponible: ${mcpUrl}\n\n${contextBlock}` },
        { role: 'user', content: userMessage },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    console.log('[scheduling] respuesta:', raw.slice(0, 200));

    const parsed = JSON.parse(raw) as SchedulingOutput;
    return parsed;
  } catch (err) {
    console.error('[scheduling] error:', err);
    return null;
  }
}

export function shouldTriggerScheduling(
  cita_estado: string,
  new_status_id: string
): boolean {
  return (
    new_status_id === '142' ||
    cita_estado === 'pendiente' ||
    cita_estado === 'propuesta'
  );
}
