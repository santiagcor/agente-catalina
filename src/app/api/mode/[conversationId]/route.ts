import { NextResponse, type NextRequest } from 'next/server';
import { getConversationById, setMode } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const id = parseInt(conversationId);

  const convo = getConversationById(id);
  if (!convo) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { mode } = (await req.json()) as { mode: string };
  if (mode !== 'AI' && mode !== 'HUMAN') {
    return NextResponse.json({ error: 'mode debe ser AI o HUMAN' }, { status: 400 });
  }

  setMode(id, mode);
  return NextResponse.json({ ok: true, mode });
}
