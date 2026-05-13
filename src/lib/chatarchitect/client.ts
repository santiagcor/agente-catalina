// Auth: Basic Auth con base64(APP_ID:APP_SECRET)
// Docs: https://www.chatarchitect.com/developer-page

const CA_BASE = 'https://api.chatarchitect.com';

function basicAuth(): string {
  const appId = process.env.CHATARCHITECT_APP_ID ?? '';
  const appSecret = process.env.CHATARCHITECT_APP_SECRET ?? '';
  return Buffer.from(`${appId}:${appSecret}`).toString('base64');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${basicAuth()}`,
  };
}

function hasCredentials(): boolean {
  return !!(process.env.CHATARCHITECT_APP_ID && process.env.CHATARCHITECT_APP_SECRET);
}

export async function sendTextMessage(
  phone: string,
  body: string
): Promise<{ message_id: string }> {
  if (!hasCredentials()) {
    throw new Error('CHATARCHITECT_APP_ID o CHATARCHITECT_APP_SECRET no configurados');
  }

  const res = await fetch(`${CA_BASE}/whatsappmessage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      channel: 'whatsapp',
      destination: phone,
      payload: { type: 'text', message: body },
    }),
  });

  if (!res.ok) {
    throw new Error(`ChatArchitect API ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return { message_id: json?.id ?? json?.message_id ?? 'unknown' };
}

export async function sendAudioMessage(
  phone: string,
  audioUrl: string
): Promise<void> {
  if (!hasCredentials()) return;
  const res = await fetch(`${CA_BASE}/whatsappmessage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      channel: 'whatsapp',
      destination: phone,
      payload: { type: 'audio', url: audioUrl },
    }),
  });
  if (!res.ok) console.error(`[chatarchitect] audio error ${res.status}: ${await res.text()}`);
}

export async function sendVideoMessage(
  phone: string,
  videoUrl: string,
  caption?: string
): Promise<void> {
  if (!hasCredentials()) return;
  const res = await fetch(`${CA_BASE}/whatsappmessage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      channel: 'whatsapp',
      destination: phone,
      payload: { type: 'video', url: videoUrl, ...(caption ? { caption } : {}) },
    }),
  });
  if (!res.ok) console.error(`[chatarchitect] video error ${res.status}: ${await res.text()}`);
}

export async function sendImageMessage(
  phone: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  if (!hasCredentials()) return;
  const res = await fetch(`${CA_BASE}/whatsappmessage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      channel: 'whatsapp',
      destination: phone,
      payload: { type: 'image', url: imageUrl, ...(caption ? { caption } : {}) },
    }),
  });
  if (!res.ok) console.error(`[chatarchitect] imagen error ${res.status}: ${await res.text()}`);
}

export async function sendDocumentMessage(
  phone: string,
  documentUrl: string,
  filename?: string
): Promise<void> {
  if (!hasCredentials()) return;
  const res = await fetch(`${CA_BASE}/whatsappmessage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      channel: 'whatsapp',
      destination: phone,
      payload: { type: 'document', url: documentUrl, ...(filename ? { filename } : {}) },
    }),
  });
  if (!res.ok) console.error(`[chatarchitect] documento error ${res.status}: ${await res.text()}`);
}

/** Verifica credenciales usando el endpoint de templates */
export async function getAccountInfo(): Promise<{ phone: string; name: string }> {
  if (!hasCredentials()) {
    throw new Error('CHATARCHITECT_APP_ID o CHATARCHITECT_APP_SECRET no configurados');
  }

  const res = await fetch(`${CA_BASE}/getHSM`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`ChatArchitect ${res.status}: ${await res.text()}`);
  }

  return { phone: 'WhatsApp configurado', name: 'ChatArchitect' };
}
