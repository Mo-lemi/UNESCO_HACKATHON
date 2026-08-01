import React, { useState } from 'react';
import { Code, Play, CheckCircle2, Copy } from 'lucide-react';

export const ApiDocs: React.FC = () => {
  const [jsonInput, setJsonInput] = useState<string>(
    JSON.stringify(
      { text: "Driver needed, Durban area, R27166/month. Refundable registration deposit required before starter pack. WhatsApp 0834176986." },
      null,
      2
    )
  );
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const handleRunApi = async () => {
    setLoading(true);
    try {
      const parsed = JSON.parse(jsonInput);
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setApiResponse(JSON.stringify({ error: err.message || 'Failed to parse JSON' }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const copyCurl = () => {
    const curlCmd = `curl -X POST http://localhost:3000/api/score \\\n  -H "Content-Type: application/json" \\\n  -d '${jsonInput.replace(/\n/g, '')}'`;
    navigator.clipboard.writeText(curlCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* API Header */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <Code className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-bold font-mono text-slate-100">Isazi Scoring API Specification</h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          The FastAPI & Express endpoint called by background service workers or mobile clients. POST a job posting's text to obtain a 0–100 risk score, tier classification, top SHAP feature contributions, rule safety flags, and phrase highlights.
        </p>
      </div>

      {/* Endpoints Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold font-mono text-slate-200 uppercase tracking-wider">Endpoints</h3>

        <div className="space-y-3 font-mono text-xs">
          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">GET</span>
              <span className="text-slate-200 font-semibold">/api/health</span>
            </div>
            <span className="text-slate-400 text-[11px]">Returns model status & loaded version</span>
          </div>

          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold">POST</span>
              <span className="text-slate-200 font-semibold">/api/score</span>
            </div>
            <span className="text-slate-400 text-[11px]">Evaluates job posting text for fraud signals</span>
          </div>
        </div>
      </div>

      {/* Interactive API Sandbox */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Request Panel */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-200 uppercase">Request JSON Body</span>
            <button
              onClick={copyCurl}
              className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900 px-2 py-1 rounded border border-slate-800"
            >
              {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'cURL Copied' : 'Copy cURL'}</span>
            </button>
          </div>

          <textarea
            rows={8}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-indigo-300 outline-none leading-relaxed"
          />

          <button
            onClick={handleRunApi}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-all shadow-md shadow-indigo-600/20"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{loading ? 'Executing API Request...' : 'Send API Request'}</span>
          </button>
        </div>

        {/* Response Panel */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
          <span className="text-xs font-mono font-semibold text-slate-200 uppercase">Response JSON</span>
          <pre className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-400 overflow-x-auto min-h-[220px] leading-relaxed">
            {apiResponse || '// Click "Send API Request" to see server JSON response'}
          </pre>
        </div>

      </div>

    </div>
  );
};
