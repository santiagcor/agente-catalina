'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

type MediaType = 'audio' | 'video' | 'image' | 'document';

const MEDIA_OPTIONS: { type: MediaType; icon: string; label: string }[] = [
  { type: 'audio',    icon: '🎙', label: 'Audio'     },
  { type: 'video',    icon: '🎥', label: 'Video'     },
  { type: 'image',    icon: '🖼', label: 'Imagen'    },
  { type: 'document', icon: '📄', label: 'Documento' },
];

export default function ConversationPanel({
  conversation,
  onDelete,
  onModeChange,
}: {
  conversation: Conversation;
  onDelete: () => void;
  onModeChange: (mode: 'AI' | 'HUMAN') => void;
}) {
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
    if (res.ok) setMessages(await res.json());
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
      if (!res.ok) setSendError((await res.json()).error ?? 'Error');
      else { setHumanInput(''); await fetchMessages(); }
    } catch { setSendError('Error de red'); }
    finally { setSending(false); }
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
      if (!res.ok) setSendError((await res.json()).error ?? 'Error');
      else { setMediaUrl(''); setFilename(''); setShowMedia(false); await fetchMessages(); }
    } catch { setSendError('Error de red'); }
    finally { setSending(false); }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta conversación y todos sus mensajes?')) return;
    await fetch(`/api/conversations/${conversation.id}`, { method: 'DELETE' });
    onDelete();
  }

  const initials = (conversation.name || conversation.phone)
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60 bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-semibold text-sm shrink-0">
            {initials.slice(0, 2)}
          </div>
          <div>
            <p className="font-semibold text-slate-100 text-sm">{conversation.name || conversation.phone}</p>
            <p className="text-xs text-slate-500">{conversation.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle
            conversationId={conversation.id}
            mode={conversation.mode}
            onModeChange={onModeChange}
          />
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={handleDelete}
            className="px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700 rounded-lg transition-colors"
          >
            Borrar
          </motion.button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <AnimatePresence initial={false}>
          {messages.map(m => <MessageBubble key={m.id} message={m} />)}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Estado Catalina */}
      <div className="px-4 py-2.5 border-t border-slate-700/60 shrink-0">
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
      <AnimatePresence>
        {conversation.mode === 'HUMAN' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            className="px-4 py-3 border-t border-slate-700/60 bg-slate-900 shrink-0 space-y-2"
          >
            <AnimatePresence>
              {sendError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-400 text-xs"
                >
                  {sendError}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Text input row */}
            <div className="flex gap-2">
              <input
                className="flex-1 bg-slate-800 text-slate-100 placeholder-slate-500 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-amber-500/60 border border-slate-700/60 transition-shadow"
                placeholder="Escribe como asesor…"
                value={humanInput}
                onChange={e => setHumanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowMedia(v => !v)}
                title="Adjuntar media"
                className={`px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                  showMedia
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-slate-800 border-slate-700/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                📎
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={handleSend}
                disabled={sending || !humanInput.trim()}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm rounded-xl font-medium transition-colors"
              >
                {sending ? '…' : 'Enviar'}
              </motion.button>
            </div>

            {/* Media panel */}
            <AnimatePresence>
              {showMedia && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="bg-slate-800/60 rounded-xl p-3 space-y-2.5 border border-slate-700/50">
                    {/* Type selector */}
                    <div className="flex gap-1.5">
                      {MEDIA_OPTIONS.map(opt => (
                        <button
                          key={opt.type}
                          onClick={() => setMediaType(opt.type)}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${
                            mediaType === opt.type
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <input
                      className="w-full bg-slate-700/80 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500/50"
                      placeholder="URL pública del archivo…"
                      value={mediaUrl}
                      onChange={e => setMediaUrl(e.target.value)}
                    />
                    {mediaType === 'document' && (
                      <input
                        className="w-full bg-slate-700/80 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500/50"
                        placeholder="Nombre del archivo (ej: cotizacion.pdf)"
                        value={filename}
                        onChange={e => setFilename(e.target.value)}
                      />
                    )}
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleSendMedia}
                      disabled={sending || !mediaUrl.trim()}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      {sending ? 'Enviando…' : `Enviar ${mediaType}`}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
