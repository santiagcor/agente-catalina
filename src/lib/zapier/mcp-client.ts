// Llamadas directas al MCP de Zapier via JSON-RPC sobre HTTP
// No usamos el SDK de MCP porque el embed de Zapier usa un protocolo
// de sesión que el StreamableHTTPClientTransport no maneja correctamente.

function getBaseUrl(): string {
  const embedId = process.env.ZAPIER_MCP_EMBED_ID;
  if (!embedId) throw new Error('ZAPIER_MCP_EMBED_ID no configurado');
  return `https://mcp.zapier.com/api/mcp/s/${embedId}/mcp`;
}

function headers(): Record<string, string> {
  const secret = process.env.ZAPIER_MCP_SECRET;
  if (!secret) throw new Error('ZAPIER_MCP_SECRET no configurado');
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${secret}`,
  };
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

export async function listZapierTools(): Promise<string[]> {
  const url = getBaseUrl();
  const sessionId = await initialize();
  const reqHeaders: Record<string, string> = { ...headers() };
  if (sessionId) reqHeaders['mcp-session-id'] = sessionId;

  const res = await fetch(url, {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  const text = await res.text();
  const line = text.split('\n').find(l => l.startsWith('data:'))?.replace('data:', '').trim() ?? text.trim();
  const json = JSON.parse(line) as Record<string, unknown>;
  const tools = (json.result as Record<string, unknown>)?.tools as Array<{ name: string }> | undefined;
  return tools?.map(t => t.name) ?? [];
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
