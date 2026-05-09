# Agente Catalina — ENERGREEN SOLUTIONS

Dashboard + backend del agente WhatsApp para calificación de prospectos de energía solar.

## Stack

- **Next.js 15** App Router + TypeScript + React 19
- **Tailwind CSS 4**
- **node:sqlite** (built-in Node 22+) — sin dependencias nativas
- **OpenRouter** (LLM vía API OpenAI compatible)
- **ChatArchitect** — broker de WhatsApp Cloud API
- **Kommo CRM** — API v4 con Long-Lived Token
- **Zapier** — webhooks para Google Sheets

---

## Quickstart

### 1. Requisitos

- Node.js 22+ (el proyecto usa `node:sqlite` built-in)
- Cuenta en ChatArchitect, Kommo, OpenRouter
- ngrok (para desarrollo local con webhook)

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
# editar .env.local con tus credenciales
```

### 3. Instalar y correr

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 4. Exponer el webhook con ngrok (desarrollo)

```bash
# En otra terminal:
ngrok http 3000
# Copiar URL: https://abc123.ngrok-free.app
# Configurar en ChatArchitect → Webhooks:
# URL: https://abc123.ngrok-free.app/api/webhook/chatarchitect
# Secret: el mismo valor que CHATARCHITECT_WEBHOOK_SECRET
```

---

## Configuración paso a paso

### ChatArchitect

1. Ir a tu panel de ChatArchitect → **API** → copiar API Key
2. Agregar como `CHATARCHITECT_API_KEY` en `.env.local`
3. Ir a **Webhooks** → Agregar nuevo webhook
4. URL: `https://TU_DOMINIO/api/webhook/chatarchitect`
5. En el campo "Secret": escribe una cadena aleatoria (ej: `energreen-2024-secret`)
6. Agregar esa misma cadena como `CHATARCHITECT_WEBHOOK_SECRET`

### Kommo CRM

1. Ir a Kommo → **Configuración** → **Integraciones**
2. Crear nueva **integración privada**
3. En **Keys and scopes** → clic en "Generate long-lived token"
4. Seleccionar duración: **5 años**
5. ⚠️ **GUARDAR EL TOKEN INMEDIATAMENTE** — no se puede ver de nuevo
6. Agregar como `KOMMO_LONG_LIVED_TOKEN`
7. Para `KOMMO_SUBDOMAIN`: es el prefijo de `tuempresa.kommo.com`
8. Para `KOMMO_PIPELINE_ID`: hacer `GET https://tuempresa.kommo.com/api/v4/leads/pipelines` con el token
9. Docs: https://developers.kommo.com/docs/long-lived-token

### Zapier → Google Sheets

1. Crear un nuevo Zap
2. Trigger: **Webhooks by Zapier** → **Catch Hook**
3. Copiar la URL generada → `ZAPIER_WEBHOOK_URL_SHEETS`
4. Action: **Google Sheets** → **Create/Update Row**
5. Mapear los campos: nombre, ciudad, tipo_persona, consumo, consentimiento, telefono, lead_temperature
6. Activar el Zap

### OpenRouter

1. Ir a https://openrouter.ai/keys
2. Crear nueva API key
3. Agregar como `OPENROUTER_API_KEY`
4. Modelo por defecto: `openai/gpt-4o-mini` (cambiar con `OPENROUTER_MODEL`)

---

## Deploy en producción (EasyPanel)

1. Subir el código a un repositorio Git
2. En EasyPanel: crear nueva app → conectar repo
3. El archivo `nixpacks.toml` configura el build automáticamente
4. Agregar las variables de entorno en el panel de EasyPanel
5. Crear un **volumen persistente** en `/app/data` (aquí vive la base SQLite)
6. HTTPS es obligatorio — ChatArchitect requiere webhook seguro

---

## Arquitectura del flujo

```
Cliente WhatsApp
    ↓ mensaje
ChatArchitect
    ↓ POST /api/webhook/chatarchitect
Agente Catalina (Next.js)
    ├── Dedup (SQLite)
    ├── OpenRouter LLM → CatalinaOutput JSON
    ├── ChatArchitect API → respuesta al cliente
    ├── Kommo API → crear/actualizar lead
    └── Zapier webhook → Google Sheets
```

---

## Mejoras pendientes

- Envío de audio TTS (ElevenLabs → ChatArchitect)
- Envío de video desde Google Drive
- Generación de PDF de precotización
- Agente de agendamiento (delegación desde Catalina)
- Gestión de plantillas HSM (mensajes fuera de ventana 24h)
- Webhook de Kommo → eventos del CRM al agente
- Autenticación del dashboard (Basic Auth / Cloudflare Access)
- Cola persistente de mensajes salientes para mayor robustez
