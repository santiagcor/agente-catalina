'use client';

interface Props {
  missing: string[];
}

const ENV_DOCS: Record<string, { label: string; description: string; steps: string[] }> = {
  CHATARCHITECT_APP_ID: {
    label: 'ChatArchitect App ID',
    description: 'El identificador de tu aplicación en ChatArchitect (APP_ID para Basic Auth).',
    steps: [
      'Ingresa a tu panel de ChatArchitect → Developer o Settings',
      'Busca el campo "App ID" o "Application ID"',
      'Agrégalo como CHATARCHITECT_APP_ID en .env.local',
    ],
  },
  CHATARCHITECT_APP_SECRET: {
    label: 'ChatArchitect App Secret',
    description: 'La clave secreta de tu app en ChatArchitect (APP_SECRET para Basic Auth).',
    steps: [
      'En el mismo panel donde encontraste el App ID',
      'Copia el "App Secret" o "Application Secret"',
      'Agrégalo como CHATARCHITECT_APP_SECRET en .env.local',
    ],
  },
  CHATARCHITECT_WEBHOOK_SECRET: {
    label: 'ChatArchitect Webhook Secret',
    description: 'Token que eliges tú y configuras en el panel de ChatArchitect para verificar webhooks.',
    steps: [
      'Elige una cadena secreta (ej: mi-secreto-2024)',
      'En ChatArchitect: Configuración → Webhooks → Agregar webhook',
      `URL del webhook: https://TU_DOMINIO/api/webhook/chatarchitect`,
      'Pega el secreto en el campo "Secret" del panel',
      'Agrega el mismo valor como CHATARCHITECT_WEBHOOK_SECRET en .env.local',
    ],
  },
  KOMMO_SUBDOMAIN: {
    label: 'Kommo Subdomain',
    description: 'El subdominio de tu cuenta Kommo (tuempresa.kommo.com → tuempresa).',
    steps: [
      'Ingresa a tu cuenta de Kommo',
      'Mira la URL: tuempresa.kommo.com',
      'Copia solo "tuempresa" y pégalo como KOMMO_SUBDOMAIN',
    ],
  },
  KOMMO_LONG_LIVED_TOKEN: {
    label: 'Kommo Long-Lived Token',
    description: 'Token de acceso de larga duración para la integración privada de Kommo.',
    steps: [
      'En Kommo: Configuración → Integraciones',
      'Crear nueva integración privada',
      'En "Keys and scopes" → clic en "Generate long-lived token"',
      'Selecciona duración: 5 años',
      'IMPORTANTE: copia y guarda el token — no se puede recuperar después',
      'Agréga como KOMMO_LONG_LIVED_TOKEN en .env.local',
      'Docs: https://developers.kommo.com/docs/long-lived-token',
    ],
  },
  OPENROUTER_API_KEY: {
    label: 'OpenRouter API Key',
    description: 'Clave para acceder a los modelos de lenguaje vía OpenRouter.',
    steps: [
      'Ve a https://openrouter.ai/keys',
      'Crea una nueva API key',
      'Agrégala como OPENROUTER_API_KEY en .env.local',
    ],
  },
};

export default function ConfigScreen({ missing }: Props) {
  const allKeys = Object.keys(ENV_DOCS);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
            C
          </div>
          <div>
            <h1 className="text-xl font-bold">Agente Catalina — ENERGREEN</h1>
            <p className="text-slate-400 text-sm">Configuración inicial requerida</p>
          </div>
        </div>

        <div className="bg-amber-900/30 border border-amber-700 rounded-lg px-4 py-3 mb-6 text-sm">
          <p className="font-medium text-amber-300">Faltan {missing.length} variable(s) de entorno</p>
          <p className="text-amber-200/70 mt-1">
            Crea o edita el archivo <code className="bg-slate-800 px-1 rounded">.env.local</code> en la raíz del proyecto y reinicia el servidor.
          </p>
        </div>

        <div className="space-y-4">
          {allKeys.map((key) => {
            const doc = ENV_DOCS[key];
            const isMissing = missing.includes(key);
            return (
              <div
                key={key}
                className={`border rounded-lg overflow-hidden ${
                  isMissing ? 'border-red-700' : 'border-emerald-800'
                }`}
              >
                <div
                  className={`flex items-center gap-3 px-4 py-3 ${
                    isMissing ? 'bg-red-900/30' : 'bg-emerald-900/20'
                  }`}
                >
                  <span className="text-lg">{isMissing ? '✗' : '✓'}</span>
                  <div>
                    <p className="font-mono text-sm font-bold">{key}</p>
                    <p className="text-xs text-slate-400">{doc.label}</p>
                  </div>
                </div>
                {isMissing && (
                  <div className="px-4 py-3 bg-slate-800/50">
                    <p className="text-sm text-slate-300 mb-2">{doc.description}</p>
                    <ol className="list-decimal list-inside space-y-1">
                      {doc.steps.map((step, i) => (
                        <li key={i} className="text-xs text-slate-400">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Opcionales */}
        <div className="mt-6 border border-slate-700 rounded-lg p-4">
          <p className="text-sm font-medium text-slate-300 mb-2">Opcionales (Zapier → Google Sheets)</p>
          <div className="space-y-2 text-xs text-slate-400">
            <p><code className="bg-slate-800 px-1 rounded">ZAPIER_WEBHOOK_URL_SHEETS</code> — Crea un Zap con trigger "Webhooks by Zapier (Catch Hook)" y action "Google Sheets". Copia la URL del hook.</p>
            <p><code className="bg-slate-800 px-1 rounded">KOMMO_PIPELINE_ID</code> — ID del pipeline en Kommo. Obtenlo con: <code className="bg-slate-800 px-1 rounded">GET /api/v4/leads/pipelines</code></p>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          Después de editar .env.local, reinicia el servidor con <code className="bg-slate-800 px-1 rounded">npm run dev</code>
        </div>
      </div>
    </div>
  );
}
