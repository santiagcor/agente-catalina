import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ── Config ─────────────────────────────────────────────────────────────────

// Zapier MCP embed: el "server ID" en el path debe ser base64("{embedId}:{secret}")
function getMcpUrl(): URL {
  const embedId = process.env.ZAPIER_MCP_EMBED_ID;
  const secret  = process.env.ZAPIER_MCP_SECRET;
  if (!embedId || !secret) throw new Error('ZAPIER_MCP_EMBED_ID o ZAPIER_MCP_SECRET no configurados');
  const serverId = Buffer.from(`${embedId}:${secret}`).toString('base64');
  console.log(`[mcp] serverId (base64): ${serverId.slice(0, 20)}...`);
  return new URL(`https://mcp.zapier.com/api/mcp/s/${serverId}/mcp`);
}

// ── Cliente reutilizable por llamada ───────────────────────────────────────

export async function callZapierTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const url = getMcpUrl();
  console.log(`[mcp] llamando ${toolName}`);

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
  return !!(process.env.ZAPIER_MCP_EMBED_ID && process.env.ZAPIER_MCP_SECRET);
}
