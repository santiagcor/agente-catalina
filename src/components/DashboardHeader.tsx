'use client';

import { useState } from 'react';

interface ConnectionInfo {
  status: string;
  chatarchitect?: { phone: string; name: string };
  kommo?: { name: string; subdomain: string };
}

interface Props {
  connectionInfo: ConnectionInfo;
}

export default function DashboardHeader({ connectionInfo }: Props) {
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

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
          C
        </div>
        <div>
          <h1 className="font-semibold text-slate-100 text-sm">Agente Catalina — ENERGREEN</h1>
          <p className="text-xs text-slate-400">
            {waPhone}{kommoName ? ` · Kommo: ${kommoName}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {testResult && (
          <span className={`text-xs ${testResult.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult}
          </span>
        )}
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded"
        >
          {testing ? 'Probando…' : 'Probar conexión'}
        </button>
      </div>
    </header>
  );
}
