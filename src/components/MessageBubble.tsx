'use client';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'human';
  content: string;
  created_at: number;
}

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isOutgoing = message.role === 'assistant' || message.role === 'human';
  const date = new Date(message.created_at * 1000).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const roleLabel: Record<string, string> = {
    user: 'Cliente',
    assistant: 'Catalina',
    human: 'Asesor',
  };

  const bubbleColor: Record<string, string> = {
    user:      'bg-slate-700 text-slate-100',
    assistant: 'bg-emerald-800 text-emerald-50',
    human:     'bg-amber-800 text-amber-50',
  };

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${bubbleColor[message.role]}`}>
        <p className="text-xs opacity-60 mb-1">{roleLabel[message.role]}</p>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className="text-xs opacity-40 text-right mt-1">{date}</p>
      </div>
    </div>
  );
}
