import React, { useEffect, useState } from 'react';
import { FLAG_LABELS } from '../lib/labels';
import { ScoreResponse } from '../types';
import { SAMPLE_POSTINGS } from '../data/samples';
import { Chrome, Shield, ExternalLink, RefreshCw, AlertTriangle, Layers } from 'lucide-react';

async function scoreViaApi(text: string): Promise<ScoreResponse> {
  const resp = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) throw new Error(`Model service returned ${resp.status}`);
  return resp.json();
}

export const ExtensionSimulator: React.FC = () => {
  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number>(0);
  const [inputText, setInputText] = useState<string>(SAMPLE_POSTINGS[0].text);
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanOpen, setIsScanOpen] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>('');

  const scoreAndSet = async (text: string) => {
    setScanError(null);
    try {
      setResult(await scoreViaApi(text));
    } catch {
      setScanError('Cannot reach the Qhaphela model service. Is uvicorn running on port 8000?');
    }
  };

  useEffect(() => {
    scoreAndSet(SAMPLE_POSTINGS[0].text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectSample = (index: number) => {
    setSelectedSampleIndex(index);
    const text = SAMPLE_POSTINGS[index].text;
    setInputText(text);
    scoreAndSet(text);
  };

  const handlePasteScan = () => {
    if (!pasteText.trim()) return;
    setInputText(pasteText);
    scoreAndSet(pasteText);
    setPasteText('');
    setIsScanOpen(false);
  };

  const isHigh = result?.tier === 'HIGH';
  const isMed = result?.tier === 'MEDIUM';

  const badgeColor = isHigh ? 'text-red-400 bg-red-950/80 border-red-800' : isMed ? 'text-amber-400 bg-amber-950/80 border-amber-800' : 'text-emerald-400 bg-emerald-950/80 border-emerald-800';
  const barColor = isHigh ? 'bg-red-500' : isMed ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Overview Header */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Chrome className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-bold font-mono text-slate-100">Chrome Extension Preview</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Simulates the lightweight toolbar popup (`extension/popup.html`) and background content script scanner that overlays fraud verdicts directly onto job boards or WhatsApp web.
          </p>
        </div>

        {/* Sample Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Simulate Page:</span>
          <select
            value={selectedSampleIndex}
            onChange={(e) => handleSelectSample(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 text-xs font-medium text-slate-200 px-3 py-1.5 rounded-lg outline-none cursor-pointer"
          >
            {SAMPLE_POSTINGS.map((sample, idx) => (
              <option key={sample.id} value={idx}>
                {sample.category === 'scam' ? '🚨 ' : '✅ '} {sample.title.slice(0, 30)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Chrome Extension Popup Box Simulation */}
        <div className="lg:col-span-5 flex justify-center">
          
          <div className="w-full max-w-[340px] bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden font-sans">
            
            {/* Extension Header */}
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-sm tracking-wider text-slate-100">QHAPHELA</span>
                <span className="text-[10px] font-mono text-slate-500">v0.1</span>
              </div>
              <div className={`flex items-center gap-1.5 text-[11px] font-mono ${scanError ? 'text-red-400' : 'text-emerald-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${scanError ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                <span>{scanError ? 'disconnected' : 'RandomForest'}</span>
              </div>
            </div>

            <p className="px-4 py-1.5 bg-slate-900/40 text-[10px] text-slate-400 border-b border-slate-800/60 text-center font-mono">
              job-posting fraud reader: reasons, not just a verdict
            </p>

            {/* Popup Body Content */}
            {!result ? (
              <div className="p-6 text-center">
                {scanError ? (
                  <>
                    <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-2" />
                    <p className="text-xs text-red-300 font-mono">{scanError}</p>
                    <button
                      onClick={() => scoreAndSet(inputText)}
                      className="mt-3 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-slate-100"
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 font-mono">Scoring against the live model...</p>
                )}
              </div>
            ) : (
            <div className="p-4 space-y-4">

              {/* Score Readout */}
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold font-mono ${isHigh ? 'text-red-400' : isMed ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {result.score}
                  </span>
                  <span className="text-slate-500 text-xs font-mono">/100</span>
                </div>

                <div className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase border ${badgeColor}`}>
                  {result.tier.toLowerCase()}
                  {result.hard_floor_flags.length > 0 ? ' · rule floor' : ''}
                </div>
              </div>

              {/* Score Meter Fill */}
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div className={`h-full ${barColor}`} style={{ width: `${result.score}%` }} />
              </div>

              {/* Hard Floor Tags */}
              {result.hard_floor_flags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.hard_floor_flags.map((flag, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950 text-red-300 border border-red-800/80 font-semibold">
                      {FLAG_LABELS[flag] || flag}
                    </span>
                  ))}
                </div>
              )}

              {/* Why: itemised fixed-weight risk factors, matching what the
                  real extension shows. Raw SHAP values are deliberately not
                  surfaced here -- they're often generic recruiting words
                  that mean nothing to a non-technical reader. */}
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-mono text-slate-400 uppercase font-semibold">
                  why{result.rule_reasons.length > 0 ? ` - ${result.rule_points_total}/100` : ''}
                </p>
                <div className="space-y-1 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  {result.rule_reasons.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">no specific red flags found</p>
                  ) : (
                    result.rule_reasons.map((r, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-slate-300">{r.reason}</span>
                        <span className="font-semibold font-mono text-red-400 flex-shrink-0">
                          +{r.points}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Advice Text */}
              <p className="text-xs text-slate-400 leading-relaxed bg-slate-900/40 p-2.5 rounded border border-slate-800/60">
                {result.tier === 'HIGH'
                  ? 'Legitimate South African employers never request ID copies or banking details before an interview. Verify the company independently before responding.'
                  : result.tier === 'MEDIUM'
                  ? 'Some signals are unclear. Verify the company\'s registration and never pay to apply before treating this as safe.'
                  : 'No major red flags found. Standard advice still applies: never pay to apply, never send banking details before an interview.'}
              </p>

              {/* Buttons */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <button className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-300 font-medium">
                  learn
                </button>
                <button className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-300 font-medium">
                  academy
                </button>
                <button className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs text-slate-300 font-medium">
                  report
                </button>
              </div>

              {/* Manual Scan Toggle */}
              <div className="border-t border-slate-900 pt-3">
                <button
                  onClick={() => setIsScanOpen(!isScanOpen)}
                  className="w-full text-left text-xs font-mono text-red-400 hover:text-red-300 font-medium"
                >
                  {isScanOpen ? '− scan text' : '+ scan text'}
                </button>

                {isScanOpen && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      rows={3}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="paste job posting or forwarded text..."
                      className="w-full bg-slate-900 border border-slate-800 text-xs p-2 rounded text-slate-200 placeholder-slate-500 outline-none"
                    />
                    <button
                      onClick={handlePasteScan}
                      className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-semibold py-1.5 rounded transition-all"
                    >
                      scan
                    </button>
                  </div>
                )}
              </div>

            </div>
            )}

          </div>

        </div>

        {/* Right: Simulated Web Page View */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
              <span className="text-xs font-mono text-slate-400 ml-2">Job Board / WhatsApp Web View</span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
              Content Script Active
            </span>
          </div>

          <div className="p-4 bg-slate-900 rounded-lg border border-slate-800 space-y-3">
            <h4 className="font-bold text-slate-200 text-base">{SAMPLE_POSTINGS[selectedSampleIndex].title}</h4>
            <div className="p-3 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
              {inputText}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
