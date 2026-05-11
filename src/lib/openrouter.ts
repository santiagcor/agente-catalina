import OpenAI from 'openai';
import type { Conversation } from './db';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface CatalinaOutput {
  message_to_send: string;
  new_status_id: string;
  nombre: string;
  ciudad: string;
  tipo_persona: 'PERSONA NATURAL' | 'PERSONA JURIDICA' | '';
  consumo: string;
  consentimiento: 'si' | 'no' | 'pendiente';
  lead_temperature: 'frio' | 'tibio' | 'caliente';
  zapier_action: 'none' | 'write_sheets' | 'read_sheets' | 'create_kommo_lead' | 'send_whatsapp';
  zapier_notes: string;
  pdf_url: string | null;
  audio_url: string | null;
  video_url: string | null;
  pdf_filename: string | null;
  cita_preferencia: string;
  cita_estado: 'pendiente' | 'propuesta' | 'confirmada' | '';
}

// ── Cliente OpenRouter ─────────────────────────────────────────────────────

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': 'https://energreensolutions.co',
    'X-Title': 'Agente Catalina - ENERGREEN',
  },
});

// ── Llamada principal ──────────────────────────────────────────────────────

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
  ].join('\n');

  const completion = await openrouter.chat.completions.create({
    model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
      ...history,
    ],
    max_tokens: 1000,
    temperature: 0.3,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as CatalinaOutput;
  } catch {
    console.error('[openrouter] respuesta no-JSON de Catalina:', raw);
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
