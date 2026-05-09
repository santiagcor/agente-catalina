import { NextResponse } from 'next/server';
import { getAccountInfo as getCaInfo } from '@/lib/chatarchitect/client';
import { getAccountInfo as getKommoInfo } from '@/lib/kommo/client';

export const dynamic = 'force-dynamic';

const REQUIRED_ENV = [
  'CHATARCHITECT_APP_ID',
  'CHATARCHITECT_APP_SECRET',
  'CHATARCHITECT_WEBHOOK_SECRET',
  'KOMMO_SUBDOMAIN',
  'KOMMO_LONG_LIVED_TOKEN',
  'OPENROUTER_API_KEY',
];

export async function GET() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    return NextResponse.json({ status: 'missing_config', missing });
  }

  try {
    const [caInfo, kommoInfo] = await Promise.all([getCaInfo(), getKommoInfo()]);

    return NextResponse.json({
      status: 'connected',
      chatarchitect: caInfo,
      kommo: kommoInfo,
      zapier: {
        mcp_configured: !!(process.env.ZAPIER_MCP_EMBED_ID && process.env.ZAPIER_MCP_SECRET),
        sheets_id: !!process.env.ZAPIER_SHEETS_SPREADSHEET_ID,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: 'error', message });
  }
}
