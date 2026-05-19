'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectionInfo {
  status: string;
  chatarchitect?: { phone: string; name: string };
  kommo?: { name: string; subdomain: string };
}

export default function DashboardHeader({ connectionInfo }: { connectionInfo: ConnectionInfo }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  async function handleTest() {
    setTesting(true);
    setTestResult('');
    try {
      const res = await fetch('/api/connection/status');
      const json = await res.json();
      setTestResult(json.status === 'connected' ? '✓ Conexión OK' : `✗ ${json.message ?? json.status}`);
    } catch {
      setTestResult('✗ Error de red');
    } finally {
      setTesting(false);
    }
  }

  const waPhone = connectionInfo.chatarchitect?.phone ?? 'WhatsApp';
  const kommoName = connectionInfo.kommo?.name ?? '';
  const isOk = testResult.startsWith('✓');

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700/60 shrink-0">
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/40">
            <span className="text-white font-bold text-sm">EG</span>
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900" />
        </div>
        <div>
          <h1 className="font-semibold text-slate-100 text-sm tracking-tight">
            Agente Catalina
            <span className="text-emerald-400 ml-1">— ENERGREEN</span>
          </h1>
          <p className="text-xs text-slate-500">
            {waPhone}{kommoName ? ` · ${kommoName}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <AnimatePresence mode="wait">
          {testResult && (
            <motion.span
              key={testResult}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className={`text-xs font-medium ${isOk ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {testResult}
            </motion.span>
          )}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-700 transition-colors"
        >
          {testing ? (
            <span className="flex items-center gap-1.5">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="inline-block"
              >⟳</motion.span>
              Probando
            </span>
          ) : 'Probar conexión'}
        </motion.button>
      </div>
    </header>
  );
}
