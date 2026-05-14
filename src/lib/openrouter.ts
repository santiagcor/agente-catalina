import OpenAI from 'openai';
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
  image_url: string | null;
  pdf_filename: string | null;
  cita_preferencia: string;
  cita_estado: 'pendiente' | 'propuesta' | 'confirmada' | '';
}

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://energreensolutions.co',
    'X-Title': 'Agente Catalina',
  },
});

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

  const systemPrompt = `${SYSTEM_PROMPT}\n\n${contextBlock}`;

  const completion = await client.chat.completions.create({
    model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  console.log('[openrouter] respuesta (primeros 200):', raw.slice(0, 200));

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as CatalinaOutput;
  } catch {
    console.error('[openrouter] respuesta no-JSON de Catalina:', raw.slice(0, 300));
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
    image_url: null,
    pdf_filename: null,
    cita_preferencia: convo.catalina_cita_preferencia ?? '',
    cita_estado: (convo.catalina_cita_estado as CatalinaOutput['cita_estado']) ?? '',
  };
}
