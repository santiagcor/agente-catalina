'use client';

interface Props {
  temperature: 'frio' | 'tibio' | 'caliente' | null | undefined;
}

const config = {
  frio:     { label: 'Frío',     classes: 'bg-blue-900 text-blue-200',   icon: '❄' },
  tibio:    { label: 'Tibio',    classes: 'bg-amber-900 text-amber-200', icon: '🔥' },
  caliente: { label: 'Caliente', classes: 'bg-red-900 text-red-200',     icon: '🔴' },
};

export default function TemperatureBadge({ temperature }: Props) {
  const t = temperature ?? 'frio';
  const { label, classes, icon } = config[t] ?? config.frio;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
      {icon} {label}
    </span>
  );
}
