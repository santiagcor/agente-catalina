import { NextResponse, type NextRequest } from 'next/server';
import {
  getConversationById,
  getMessages,
  insertMessage,
  updateMessageCaId,
} from '@/lib/db';
import {
  sendTextMessage,
  sendAudioMessage,
  sendVideoMessage,
  sendImageMessage,
  sendDocumentMessage,
} from '@/lib/chatarchitect/client';

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

  const body = (await req.json()) as {
    content?: string;
    mediaType?: 'audio' | 'video' | 'image' | 'document';
    mediaUrl?: string;
    filename?: string;
  };

  // Envío de media
  if (body.mediaType && body.mediaUrl) {
    const label = `[${body.mediaType.toUpperCase()}] ${body.mediaUrl}`;
    const messageId = insertMessage(id, 'human', label);
    try {
      switch (body.mediaType) {
        case 'audio':    await sendAudioMessage(convo.phone, body.mediaUrl); break;
        case 'video':    await sendVideoMessage(convo.phone, body.mediaUrl); break;
        case 'image':    await sendImageMessage(convo.phone, body.mediaUrl); break;
        case 'document': await sendDocumentMessage(convo.phone, body.mediaUrl, body.filename); break;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Error enviando media: ${message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, messageId });
  }

  // Envío de texto
  const content = body.content ?? '';
  if (!content.trim()) {
    return NextResponse.json({ error: 'content o mediaUrl requerido' }, { status: 400 });
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
