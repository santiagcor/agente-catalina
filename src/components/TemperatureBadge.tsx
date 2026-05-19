'use client';

import { motion } from 'framer-motion';

interface Props {
  temperature: 'frio' | 'tibio' | 'caliente' | null | undefined;
}

const config = {
  frio:     { label: 'Frío',     bg: 'bg-blue-500/15',  text: 'text-blue-300',  border: 'border-blue-500/30',  dot: 'bg-blue-400' },
  tibio:    { label: 'Tibio',   bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', dot: 'bg-amber-400' },
  caliente: { label: 'Caliente', bg: 'bg-red-500/15',   text: 'text-red-300',   border: 'border-red-500/30',   dot: 'bg-red-400' },
};

export default function TemperatureBadge({ temperature }: Props) {
  const t = (temperature ?? 'frio') as keyof typeof config;
  const { label, bg, text, border, dot } = config[t] ?? config.frio;
  const isHot = t === 'caliente';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${bg} ${text} ${border}`}>
      <span className="relative flex h-1.5 w-1.5">
        {isHot && (
          <motion.span
            className={`absolute inline-flex h-full w-full rounded-full ${dot} opacity-75`}
            animate={{ scale: [1, 2, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dot}`} />
      </span>
      {label}
    </span>
  );
}
