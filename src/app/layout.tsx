import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agente Catalina — ENERGREEN',
  description: 'Dashboard de supervisión del agente WhatsApp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
