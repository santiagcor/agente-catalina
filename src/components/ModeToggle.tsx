'use client';

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

  return (
    <button
      onClick={toggle}
      className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
        mode === 'AI'
          ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
          : 'bg-amber-700 hover:bg-amber-600 text-white'
      }`}
    >
      {mode === 'AI' ? '🤖 IA' : '👤 HUMANO'}
    </button>
  );
}
