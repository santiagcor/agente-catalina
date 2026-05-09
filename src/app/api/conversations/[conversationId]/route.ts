import { NextResponse, type NextRequest } from 'next/server';
import { deleteConversation, getConversationById } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const id = parseInt(conversationId);
  if (!getConversationById(id)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
