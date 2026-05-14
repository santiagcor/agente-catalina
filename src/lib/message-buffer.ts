// Debounce por teléfono: acumula mensajes X ms y los procesa como uno solo

const DEBOUNCE_MS = 4000;

export interface BufferedMessage {
  text: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
}

interface PendingBuffer {
  messages: BufferedMessage[];
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingBuffer>();

/**
 * Agrega un mensaje al buffer del teléfono.
 * - Si es el PRIMER mensaje, inicia el timer y llama onReady cuando expire.
 * - Si ya hay un buffer activo, resetea el timer y retorna false (ignorar).
 * Retorna true solo para el primer mensaje — ese hilo es el que procesa al final.
 */
export function bufferMessage(
  phone: string,
  message: BufferedMessage,
  onReady: (messages: BufferedMessage[]) => void
): boolean {
  const existing = pending.get(phone);

  if (existing) {
    // Resetear timer y acumular
    clearTimeout(existing.timer);
    existing.messages.push(message);
    existing.timer = setTimeout(() => {
      const buf = pending.get(phone);
      if (buf) {
        pending.delete(phone);
        onReady(buf.messages);
      }
    }, DEBOUNCE_MS);
    return false; // este hilo no procesa
  }

  // Primer mensaje: crear buffer y arrancar timer
  const entry: PendingBuffer = {
    messages: [message],
    timer: setTimeout(() => {
      const buf = pending.get(phone);
      if (buf) {
        pending.delete(phone);
        onReady(buf.messages);
      }
    }, DEBOUNCE_MS),
  };
  pending.set(phone, entry);
  return true; // este hilo esperará la resolución via onReady
}
