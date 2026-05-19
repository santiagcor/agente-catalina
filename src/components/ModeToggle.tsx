'use client';

import { motion } from 'framer-motion';

interface Props {
  conversationId: number;
  mode: 'AI' | 'HUMAN';
  onModeChange: (mode: 'AI' | 'HUMAN') => void;
}

export default function ModeToggle({ conversationId, mode, onModeChange }: Props) {
  async function toggle() {
    const next = mode === 'AI' ? 'HUMAN' : 'AI';
    await fetch(`/api/mode/${conversationId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    });
    onModeChange(next);
  }

  const isAI = mode === 'AI';

  return (
    <motion.button
      onClick={toggle}
      whileTap={{ scale: 0.93 }}
      className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
        isAI
          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
          : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
      }`}
    >
      <motion.span
        key={mode}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {isAI ? '🤖' : '👤'}
      </motion.span>
      {isAI ? 'IA activa' : 'Modo humano'}
    </motion.button>
  );
}
