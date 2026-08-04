import React, { useEffect, useState } from 'react';
import { ScoreResponse, SamplePosting } from '../types';
import { SAMPLE_POSTINGS } from '../data/samples';
import { FLAG_LABELS } from '../lib/labels';
import { ShieldAlert, AlertTriangle, CheckCircle2, Sparkles, RefreshCw, Info, ExternalLink, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const FraudScanner: React.FC = () => {
  const [inputText, setInputText] = useState<string>(SAMPLE_POSTINGS[0].text);
  const [activeSampleId, setActiveSampleId] = useState<string>(SAMPLE_POSTINGS[0].id);
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedHighlightIndex, setSelectedHighlightIndex] = useState<number | null>(null);

  const handleScan = async (textToScan: string) => {
    setIsScanning(true);
    setScanError(null);
    setSelectedHighlightIndex(null);
    try {
      const resp = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToScan }),
      });
      if (resp.ok) {
        const data: ScoreResponse = await resp.json();
        setResult(data);
      } else {
        const data = await resp.json().catch(() => ({}));
        setScanError(data.error || `Model service returned ${resp.status}`);
      }
    } catch {
      setScanError('Cannot reach the Qhaphela model service. Is uvicorn running on port 8000?');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    handleScan(SAMPLE_POSTINGS[0].text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSample = (sample: SamplePosting) => {
    setActiveSampleId(sample.id);
    setInputText(sample.text);
    handleScan(sample.text);
  };

  const getTierColorClass = (tier: string) => {
    switch (tier) {
      case 'HIGH':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/40',
          text: 'text-red-400',
          badge: 'bg-red-500/20 text-red-300 border-red-500/40',
          barFill: 'bg-red-500',
          glow: 'shadow-red-500/10',
        };
      case 'MEDIUM':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/40',
          text: 'text-amber-400',
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          barFill: 'bg-amber-500',
          glow: 'shadow-amber-500/10',
        };
      default:
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/40',
          text: 'text-emerald-400',
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          barFill: 'bg-emerald-500',
          glow: 'shadow-emerald-500/10',
        };
    }
  };

  const tierStyle = getTierColorClass(result?.tier ?? 'LOW');

  // Helper to render text with clickable highlighted phrase spans
  const renderAnnotatedText = (result: ScoreResponse) => {
    if (!result.highlights || result.highlights.length === 0) {
      return <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{inputText}</p>;
    }

    let remainingText = inputText;
    const elements: React.ReactNode[] = [];
    let keyIdx = 0;

    // Find all occurrences of highlights in text
    interface FoundSpan {
      start: number;
      end: number;
      phrase: string;
      reason: string;
      hlIndex: number;
    }

    const foundSpans: FoundSpan[] = [];
    result.highlights.forEach((hl, hlIndex) => {
      const idx = inputText.indexOf(hl.phrase);
      if (idx !== -1) {
        foundSpans.push({
          start: idx,
          end: idx + hl.phrase.length,
          phrase: hl.phrase,
          reason: hl.reason,
          hlIndex,
        });
      }
    });

    foundSpans.sort((a, b) => a.start - b.start);

    // Filter overlapping spans
    const nonOverlapping: FoundSpan[] = [];
    foundSpans.forEach((span) => {
      if (!nonOverlapping.some((existing) => span.start < existing.end && span.end > existing.start)) {
        nonOverlapping.push(span);
      }
    });

    let lastEnd = 0;
    nonOverlapping.forEach((span) => {
      if (span.start > lastEnd) {
        elements.push(
          <span key={`text-${keyIdx++}`}>{inputText.slice(lastEnd, span.start)}</span>
        );
      }
      const isSelected = selectedHighlightIndex === span.hlIndex;
      elements.push(
        <mark
          key={`hl-${keyIdx++}`}
          onClick={() => setSelectedHighlightIndex(isSelected ? null : span.hlIndex)}
          className={`relative group inline-block px-1 py-0.5 rounded cursor-pointer transition-all ${
            isSelected
              ? 'bg-red-500 text-white font-medium ring-2 ring-red-400 ring-offset-2 ring-offset-slate-900 shadow-md'
              : 'bg-red-500/20 text-red-200 border-b-2 border-red-500 hover:bg-red-500/40 hover:text-white'
          }`}
        >
          {span.phrase}
          <span className="inline-flex items-center ml-1 opacity-70 group-hover:opacity-100">
            <Info className="w-3 h-3 inline" />
          </span>

          {/* Tooltip on hover/click */}
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center w-64 p-2 bg-slate-950 text-slate-100 text-xs rounded-lg border border-red-500/40 shadow-xl z-20 pointer-events-none">
            <span className="font-semibold text-red-400 mb-0.5">Flagged Reason</span>
            <span>{span.reason}</span>
            <span className="w-2 h-2 bg-slate-950 border-r border-b border-red-500/40 transform rotate-45 -mb-3 mt-1"></span>
          </span>
        </mark>
      );
      lastEnd = span.end;
    });

    if (lastEnd < inputText.length) {
      elements.push(<span key={`text-${keyIdx++}`}>{inputText.slice(lastEnd)}</span>);
    }

    return <div className="text-slate-300 leading-relaxed font-sans text-base whitespace-pre-wrap">{elements}</div>;
  };

  return (
    <div className="space-y-6">
      
      {/* Sample Selector Bar */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider font-mono">Sample South African Job Postings</span>
          </div>
          <span className="text-xs text-slate-400">Click to load and auto-score</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {SAMPLE_POSTINGS.map((sample) => {
            const isScam = sample.category === 'scam';
            const isActive = activeSampleId === sample.id;
            return (
              <button
                key={sample.id}
                onClick={() => selectSample(sample)}
                className={`text-left p-2.5 rounded-lg border transition-all text-xs flex flex-col justify-between ${
                  isActive
                    ? isScam
                      ? 'bg-red-500/10 border-red-500/50 text-slate-100 shadow-sm'
                      : 'bg-emerald-500/10 border-emerald-500/50 text-slate-100 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold truncate max-w-[170px] text-slate-200">{sample.title}</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded font-bold uppercase ${
                      isScam ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {isScam ? 'Scam' : 'Legit'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">{sample.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Scanner Grid */}
      {result ? (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: Text Input & Live Annotations */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="job-posting-input" className="block text-sm font-semibold text-slate-200 font-mono uppercase tracking-wider">
                Paste Job Posting or Message
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setInputText('');
                    setActiveSampleId('');
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-900 border border-slate-800"
                >
                  Clear
                </button>
              </div>
            </div>

            <textarea
              id="job-posting-input"
              rows={7}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                setActiveSampleId('');
              }}
              placeholder="Paste job posting text from Facebook, LinkedIn, Gumtree, or WhatsApp forwards here..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none font-sans leading-relaxed"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-mono text-slate-500">
                {inputText.length} characters • {inputText.split(/\s+/).filter(Boolean).length} words
              </span>
              <button
                onClick={() => handleScan(inputText)}
                disabled={isScanning || !inputText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-all shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Scoring...' : 'Scan Posting'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Highlighted Document View */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-slate-200 font-mono uppercase tracking-wider">
                  In-Page Red Flag Phrase Highlights
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                {result.highlights.length} phrase{result.highlights.length !== 1 ? 's' : ''} flagged
              </span>
            </div>

            <div className="p-4 bg-slate-900/80 rounded-lg border border-slate-800/80 min-h-[140px]">
              {renderAnnotatedText(result)}
            </div>

            {/* Highlights Legend */}
            {result.highlights.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-900">
                <p className="text-xs font-mono text-slate-400 mb-2 uppercase">Flagged Phrase Key & Explanations:</p>
                <div className="flex flex-wrap gap-2">
                  {result.highlights.map((hl, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedHighlightIndex(idx)}
                      className={`text-xs px-2.5 py-1 rounded-md border cursor-pointer transition-all flex items-center gap-1.5 ${
                        selectedHighlightIndex === idx
                          ? 'bg-red-500/20 border-red-500 text-red-200 font-medium'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                      <span className="font-mono text-red-300">"{hl.phrase}"</span>
                      <span className="text-slate-400">({hl.reason})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Scoring Readout, SHAP Reasons & Safety Advice */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Main Risk Gauge Card */}
          <div className={`border rounded-xl p-6 shadow-xl transition-all ${tierStyle.bg} ${tierStyle.border} ${tierStyle.glow}`}>
            
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">Scoring Verdict</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className={`text-5xl font-extrabold font-mono tracking-tight ${tierStyle.text}`}>
                    {result.score}
                  </span>
                  <span className="text-slate-400 font-mono text-lg">/100</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border shadow-sm ${tierStyle.badge}`}>
                  {result.tier} RISK
                </span>
                {result.hard_floor_flags.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950/80 text-red-400 border border-red-800/80 font-bold uppercase">
                    • RULE FLOOR
                  </span>
                )}
              </div>
            </div>

            {/* Meter Fill Bar */}
            <div className="w-full h-3 bg-slate-900/90 rounded-full overflow-hidden border border-slate-800 p-0.5 mb-4">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${result.score}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={`h-full rounded-full ${tierStyle.barFill}`}
              />
            </div>

            {/* Hard Floor Flag Alerts */}
            {result.hard_floor_flags.length > 0 && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>Hard Safety Floor Triggered</span>
                </div>
                {result.hard_floor_flags.map((flag, idx) => (
                  <p key={idx} className="text-red-200 pl-5 font-mono">
                    • {FLAG_LABELS[flag] || flag}
                  </p>
                ))}
              </div>
            )}

            {/* Action Advice Box */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-lg text-xs text-slate-300 leading-relaxed">
              <span className="font-mono text-slate-400 uppercase font-semibold block mb-1">Safety Advice:</span>
              {result.tier === 'HIGH' ? (
                <span>
                  Legitimate South African employers <strong>never request ID copies or banking details before an interview</strong>.
                  Verify the company independently via official registries before providing personal information.
                </span>
              ) : result.tier === 'MEDIUM' ? (
                <span>
                  Some signals are ambiguous. Verify the company's registration on CIPC and <strong>never pay to apply</strong> before treating this opportunity as safe.
                </span>
              ) : (
                <span>
                  No major red flags detected. Standard advice still applies: <strong>never pay to apply</strong> and never send banking details prior to a formal interview.
                </span>
              )}
            </div>
          </div>

          {/* SHAP Feature Contribution Breakdown */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-200 font-mono uppercase tracking-wider">
                  SHAP Model Feature Reasons
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">Explainable AI (XAI)</span>
            </div>

            <p className="text-xs text-slate-400">
              Each factor below carries a fixed, disclosed weight. Shown alongside the model's own
              score so the reasoning is checkable, not just asserted.
            </p>

            <div className="space-y-2 pt-1">
              {result.rule_reasons.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-3 text-center bg-slate-900/50 rounded-lg">
                  No specific red flags found in the text.
                </p>
              ) : (
                result.rule_reasons.map((reason, idx) => {
                  const pct = Math.min(reason.points * 2, 100);
                  return (
                    <div key={idx} className="p-2.5 bg-slate-900/70 border border-slate-800/80 rounded-lg text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-200 font-medium">{reason.reason}</span>
                        <span className="font-bold font-mono text-red-400 flex-shrink-0">+{reason.points}</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Identity-theft warning: separate from the fraud score because the
              harm (identity theft, SIM-swap fraud) is different in kind. */}
          {result.identity_theft_signals.length > 0 && (
            <div className="bg-red-950/40 border border-red-800/60 rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-red-300 font-mono uppercase tracking-wider">
                  Identity Theft Risk
                </h3>
              </div>
              <p className="text-xs text-slate-300">
                This posting asks for information that can be used to steal your identity:
              </p>
              <ul className="space-y-1">
                {result.identity_theft_signals.map((s, idx) => (
                  <li key={idx} className="text-xs text-slate-200">• {s}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-400">
                Never send these before meeting the employer and verifying the company independently.
              </p>
            </div>
          )}

          {/* Contact & domain checks -- observations from the posting text,
              deliberately not labelled "verified". */}
          {(result.contact_checks.positive.length > 0 || result.contact_checks.warning.length > 0) && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-2">
              <h3 className="text-sm font-semibold text-slate-200 font-mono uppercase tracking-wider">
                Contact &amp; Domain Checks
              </h3>
              {result.contact_checks.positive.map((c, idx) => (
                <p key={`p${idx}`} className="text-xs text-slate-200">
                  <span className="text-emerald-400 font-bold">✓</span> {c}
                </p>
              ))}
              {result.contact_checks.warning.map((c, idx) => (
                <p key={`w${idx}`} className="text-xs text-slate-200">
                  <span className="text-amber-400 font-bold">⚠</span> {c}
                </p>
              ))}
              <p className="text-[11px] text-slate-500 italic pt-1">
                Based on the posting text only. Not a company registry check.
              </p>
            </div>
          )}

        </div>

      </div>
      ) : (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center">
          {scanError ? (
            <>
              <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-300 font-mono">{scanError}</p>
              <button
                onClick={() => handleScan(inputText)}
                className="mt-3 px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-slate-100"
              >
                Retry
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-400 font-mono">Scoring against the live model...</p>
          )}
        </div>
      )}

    </div>
  );
};
