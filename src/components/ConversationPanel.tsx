'use client';

import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import ModeToggle from './ModeToggle';
import CatalinaStatePanel from './CatalinaStatePanel';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'human';
  content: string;
  created_at: number;
}

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  mode: 'AI' | 'HUMAN';
  lead_temperature: 'frio' | 'tibio' | 'caliente';
  kommo_lead_id: number | null;
  kommo_status_id: string | null;
  catalina_nombre: string | null;
  catalina_consentimiento: string;
  last_catalina_json: string | null;
}

interface Props {
  conversation: Conversation;
  onDelete: () => void;
  onModeChange: (mode: 'AI' | 'HUMAN') => void;
}

type MediaType = 'audio' | 'video' | 'image' | 'document';

export default function ConversationPanel({ conversation, onDelete, onModeChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [humanInput, setHumanInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showMedia, setShowMedia] = useState(false);
  const [mediaType, setMediaType] = useState<MediaType>('audio');
  const [mediaUrl, setMediaUrl] = useState('');
  const [filename, setFilename] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  async function fetchMessages() {
    const res = await fetch(`/api/messages/${conversation.id}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
    }
  }

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!humanInput.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/messages/${conversation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: humanInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSendError(data.error ?? 'Error desconocido');
      } else {
        setHumanInput('');
        await fetchMessages();
      }
    } catch {
      setSendError('Error de red');
    } finally {
      setSending(false);
    }
  }

  async function handleSendMedia() {
    if (!mediaUrl.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/messages/${conversation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType, mediaUrl: mediaUrl.trim(), filename: filename.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSendError(data.error ?? 'Error desconocido');
      } else {
        setMediaUrl('');
        setFilename('');
        setShowMedia(false);
        await fetchMessages();
      }
    } catch {
      setSendError('Error de red');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta conversación y todos sus mensajes?')) return;
    await fetch(`/api/conversations/${conversation.id}`, { method: 'DELETE' });
    onDelete();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header del panel */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800 shrink-0">
        <div>
          <p className="font-semibold text-slate-100">{conversation.name || conversation.phone}</p>
          <p className="text-xs text-slate-400">{conversation.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle
            conversationId={conversation.id}
            mode={conversation.mode}
            onModeChange={onModeChange}
          />
          <button
            onClick={handleDelete}
            className="px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded"
          >
            Borrar
          </button>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Panel estado Catalina */}
      <div className="px-4 py-2 border-t border-slate-700 shrink-0">
        <CatalinaStatePanel
          conversationId={conversation.id}
          catalinaJson={conversation.last_catalina_json}
          catalinaNombre={conversation.catalina_nombre}
          catalinaConsentimiento={conversation.catalina_consentimiento}
          leadTemperature={conversation.lead_temperature}
          kommoStatusId={conversation.kommo_status_id}
          kommoLeadId={conversation.kommo_lead_id}
        />
      </div>

      {/* Input HUMAN */}
      {conversation.mode === 'HUMAN' && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800 shrink-0 space-y-2">
          {sendError && <p className="text-red-400 text-xs">{sendError}</p>}

          {/* Texto */}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-700 text-slate-100 placeholder-slate-400 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500"
              placeholder="Escribe como asesor humano…"
              value={humanInput}
              onChange={(e) => setHumanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <button
              onClick={() => setShowMedia(v => !v)}
              title="Adjuntar media"
              className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-slate-200 text-lg rounded"
            >📎</button>
            <button
              onClick={handleSend}
              disabled={sending || !humanInput.trim()}
              className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm rounded"
            >
              {sending ? '…' : 'Enviar'}
            </button>
          </div>

          {/* Panel de media */}
          {showMedia && (
            <div className="bg-slate-700 rounded p-3 space-y-2">
              <div className="flex gap-1">
                {(['audio', 'video', 'image', 'document'] as MediaType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setMediaType(t)}
                    className={`px-2 py-1 text-xs rounded capitalize ${mediaType === t ? 'bg-amber-700 text-white' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'}`}
                  >
                    {t === 'audio' ? '🎙 Audio' : t === 'video' ? '🎥 Video' : t === 'image' ? '🖼 Imagen' : '📄 Documento'}
                  </button>
                ))}
              </div>
              <input
                className="w-full bg-slate-600 text-slate-100 placeholder-slate-400 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="URL pública del archivo…"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
              {mediaType === 'document' && (
                <input
                  className="w-full bg-slate-600 text-slate-100 placeholder-slate-400 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="Nombre del archivo (ej: cotizacion.pdf)"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                />
              )}
              <button
                onClick={handleSendMedia}
                disabled={sending || !mediaUrl.trim()}
                className="w-full px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm rounded"
              >
                {sending ? 'Enviando…' : `Enviar ${mediaType}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
