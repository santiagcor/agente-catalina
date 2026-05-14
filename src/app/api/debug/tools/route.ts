import { NextResponse } from 'next/server';
import { listZapierTools } from '@/lib/zapier/mcp-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tools = await listZapierTools();
    return NextResponse.json({ ok: true, count: tools.length, tools });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
