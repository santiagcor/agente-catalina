// Llamadas directas al MCP de Zapier via JSON-RPC sobre HTTP
// No usamos el SDK de MCP porque el embed de Zapier usa un protocolo
// de sesión que el StreamableHTTPClientTransport no maneja correctamente.

let _sessionId: string | null = null;

function getBaseUrl(): string {
  const embedId = process.env.ZAPIER_MCP_EMBED_ID;
  const secret  = process.env.ZAPIER_MCP_SECRET;
  if (!embedId || !secret) throw new Error('ZAPIER_MCP_EMBED_ID o ZAPIER_MCP_SECRET no configurados');
  const serverId = Buffer.from(`${embedId}:${secret}`)
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `https://mcp.zapier.com/api/mcp/s/${serverId}/mcp`;
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
}

async function initialize(): Promise<string> {
  const url = getBaseUrl();
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'agente-catalina', version: '1.0.0' },
      },
    }),
  });

  const sessionId = res.headers.get('mcp-session-id') ?? res.headers.get('x-session-id') ?? '';
  const body = await res.text();
  console.log(`[mcp] initialize status=${res.status} session=${sessionId} body=${body.slice(0, 100)}`);

  if (!res.ok) throw new Error(`MCP init failed ${res.status}: ${body.slice(0, 200)}`);

  // send initialized notification
  if (sessionId) {
    await fetch(url, {
      method: 'POST',
      headers: { ...headers(), 'mcp-session-id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
    });
  }

  return sessionId;
}

export async function callZapierTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  console.log(`[mcp] llamando ${toolName}`);
  const url = getBaseUrl();

  // Inicializar sesión
  const sessionId = await initialize();

  const reqHeaders: Record<string, string> = { ...headers() };
  if (sessionId) reqHeaders['mcp-session-id'] = sessionId;

  const res = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  const text = await res.text();
  console.log(`[mcp] tools/call status=${res.status} body=${text.slice(0, 200)}`);

  if (!res.ok) throw new Error(`MCP tools/call ${res.status}: ${text.slice(0, 200)}`);

  // Puede ser SSE o JSON
  const line = text.split('\n').find(l => l.startsWith('data:'))?.replace('data:', '').trim() ?? text.trim();
  try {
    const json = JSON.parse(line) as Record<string, unknown>;
    if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
    const content = (json.result as Record<string, unknown>)?.content;
    if (Array.isArray(content)) {
      return (content[0] as Record<string, unknown>)?.text ?? content[0];
    }
    return json.result ?? json;
  } catch {
    return text;
  }
}

export function zapierMcpConfigured(): boolean {
  return !!(process.env.ZAPIER_MCP_EMBED_ID && process.env.ZAPIER_MCP_SECRET);
}
