import { NextResponse, type NextRequest } from 'next/server';
import { processWebhookPayload } from '@/lib/chatarchitect/handler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Validar secret
  const secret =
    req.headers.get('x-secret') ??
    new URL(req.url).searchParams.get('secret');

  if (secret !== process.env.CHATARCHITECT_WEBHOOK_SECRET) {
    console.warn('[webhook] secret inválido');
    return new NextResponse('forbidden', { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  // Responder 200 inmediatamente, procesar en background
  void processWebhookPayload(payload).catch((err) =>
    console.error('[webhook:chatarchitect] error en procesamiento:', err)
  );

  return NextResponse.json({ ok: true });
}
