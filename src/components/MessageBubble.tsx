'use client';

import { motion } from 'framer-motion';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'human';
  content: string;
  created_at: number;
}

const ROLE_CONFIG = {
  user: {
    label: 'Cliente',
    align: 'justify-start',
    bubble: 'bg-slate-700/80 text-slate-100 rounded-tl-sm',
    label_color: 'text-slate-400',
  },
  assistant: {
    label: 'Catalina',
    align: 'justify-end',
    bubble: 'bg-emerald-700/70 text-emerald-50 rounded-tr-sm',
    label_color: 'text-emerald-400',
  },
  human: {
    label: 'Asesor',
    align: 'justify-end',
    bubble: 'bg-amber-700/70 text-amber-50 rounded-tr-sm',
    label_color: 'text-amber-400',
  },
};

export default function MessageBubble({ message }: { message: Message }) {
  const cfg = ROLE_CONFIG[message.role];
  const isOutgoing = message.role !== 'user';
  const date = new Date(message.created_at * 1000).toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`flex ${cfg.align} mb-2 px-1`}
    >
      <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm shadow-sm ${cfg.bubble}`}>
        <p className={`text-xs font-medium mb-1 ${cfg.label_color}`}>
          {cfg.label}
        </p>
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
        <p className={`text-xs opacity-40 mt-1.5 ${isOutgoing ? 'text-right' : ''}`}>
          {date}
        </p>
      </div>
    </motion.div>
  );
}
