// Mapeo de IDs de estado del pipeline Catalina en Kommo

export const PIPELINE_STAGES: Record<string, string> = {
  '99597483':  'Consultiva inicial',
  '100482511': 'Esperando tipo de persona',
  '99597863':  'Esperando consumo',
  '99597867':  'Esperando ciudad',
  '99597871':  'Esperando consentimiento',
  '99597879':  'Precotización enviada',
  '142':       'Interesado — agendar',
  '143':       'No interesado',
};

export function getStageName(statusId: string): string {
  return PIPELINE_STAGES[statusId] ?? `Estado ${statusId}`;
}
