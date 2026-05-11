import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ── Config ─────────────────────────────────────────────────────────────────

// Zapier MCP espera el secreto embebido en la URL, no como Bearer header.
// Formato: https://mcp.zapier.com/api/mcp/s/{embedId}:{secret}/mcp
function getMcpUrl(): URL {
  const embedId = process.env.ZAPIER_MCP_EMBED_ID;
  const secret  = process.env.ZAPIER_MCP_SECRET;
  if (!embedId) throw new Error('ZAPIER_MCP_EMBED_ID no configurado');
  const serverId = secret ? `${embedId}:${secret}` : embedId;
  return new URL(`https://mcp.zapier.com/api/mcp/s/${serverId}/mcp`);
}

// ── Cliente reutilizable por llamada ───────────────────────────────────────

export async function callZapierTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const url = getMcpUrl();

  const transport = new StreamableHTTPClientTransport(url);

  const client = new Client(
    { name: 'agente-catalina', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    return result;
  } finally {
    await client.close();
  }
}

export function zapierMcpConfigured(): boolean {
  return !!process.env.ZAPIER_MCP_EMBED_ID;
}
