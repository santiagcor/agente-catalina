import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// ── Config ─────────────────────────────────────────────────────────────────

function getMcpUrl(): URL {
  const embedId = process.env.ZAPIER_MCP_EMBED_ID;
  if (!embedId) throw new Error('ZAPIER_MCP_EMBED_ID no configurado');
  return new URL(`https://mcp.zapier.com/api/mcp/s/${embedId}/mcp`);
}

function getSecret(): string {
  return process.env.ZAPIER_MCP_SECRET ?? '';
}

// ── Cliente reutilizable por llamada ───────────────────────────────────────

export async function callZapierTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const url = getMcpUrl();
  const secret = getSecret();
  console.log(`[mcp] llamando ${toolName} → ${url.href.slice(0, 60)}... secret=${secret ? secret.slice(0,6)+'...' : 'VACÍO'}`);

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: {
      headers: {
        'Authorization': `Bearer ${secret}`,
      },
    },
  });

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
