import { NextResponse, type NextRequest } from 'next/server';
import {
  getConversationById,
  getMessages,
  insertMessage,
  updateMessageCaId,
} from '@/lib/db';
import { sendTextMessage } from '@/lib/chatarchitect/client';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  const id = parseInt(conversationId);
  const messages = getMessages(id, 100);
  return NextResponse.json(messages);
}

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
  if (convo.mode !== 'HUMAN') {
    return NextResponse.json({ error: 'la conversación no está en modo HUMAN' }, { status: 400 });
  }

  const { content } = (await req.json()) as { content: string };
  if (!content?.trim()) {
    return NextResponse.json({ error: 'content requerido' }, { status: 400 });
  }

  const messageId = insertMessage(id, 'human', content);

  try {
    const { message_id } = await sendTextMessage(convo.phone, content);
    updateMessageCaId(messageId, message_id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error enviando: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messageId });
}
