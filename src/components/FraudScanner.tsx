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
      // A real <button>, not a clickable <mark>. The flagged phrase and its
      // reason are the whole point of this view, and as a bare <mark onClick>
      // they were unreachable without a mouse: no tab stop, no key handler,
      // and a tooltip that only appeared on hover. The reason is carried in
      // aria-label so it is announced rather than shown only on hover, and
      // the tooltip now also opens on keyboard focus.
      elements.push(
        <button
          key={`hl-${keyIdx++}`}
          type="button"
          onClick={() => setSelectedHighlightIndex(isSelected ? null : span.hlIndex)}
          aria-pressed={isSelected}
          aria-label={`Flagged phrase: ${span.phrase}. Reason: ${span.reason}`}
          className={`relative group inline-block px-1 py-0.5 rounded cursor-pointer transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
            isSelected
              ? 'bg-red-500 text-white font-medium ring-2 ring-red-400 ring-offset-2 ring-offset-slate-900 shadow-md'
              : 'bg-red-500/20 text-red-200 border-b-2 border-red-500 hover:bg-red-500/40 hover:text-white'
          }`}
        >
          <mark className="bg-transparent text-inherit">{span.phrase}</mark>
          <span className="inline-flex items-center ml-1 opacity-70 group-hover:opacity-100" aria-hidden="true">
            <Info className="w-3 h-3 inline" />
          </span>

          {/* Visual tooltip. aria-hidden because the same text is already in
              the button's accessible name -- announcing it twice is noise. */}
          <span
            aria-hidden="true"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex group-focus-visible:flex flex-col items-center w-64 p-2 bg-slate-950 text-slate-100 text-xs rounded-lg border border-red-500/40 shadow-xl z-20 pointer-events-none"
          >
            <span className="font-semibold text-red-400 mb-0.5">Flagged Reason</span>
            <span>{span.reason}</span>
            <span className="w-2 h-2 bg-slate-950 border-r border-b border-red-500/40 transform rotate-45 -mb-3 mt-1"></span>
          </span>
        </button>
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
                aria-busy={isScanning}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-all shadow-lg shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <RefreshCw aria-hidden="true" className={`w-4 h-4 ${isScanning ? 'animate-spin motion-reduce:animate-none' : ''}`} />
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
          
          {/* NEW 2-CARD DASHBOARD LAYOUT */}
          <div className="flex flex-col gap-4">
            
            {/* Risk Overview Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 block">Risk Overview</span>
              
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Circular SVG Progress Ring */}
                <div className="relative flex items-center justify-center flex-shrink-0">
                  <svg className="w-28 h-28 transform -rotate-90">
                    <circle cx="56" cy="56" r="48" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
                    <circle 
                      cx="56" 
                      cy="56" 
                      r="48" 
                      stroke="currentColor" 
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray={2 * Math.PI * 48} 
                      strokeDashoffset={(2 * Math.PI * 48) - ((result.score / 100) * (2 * Math.PI * 48))} 
                      className={`${tierStyle.text} transition-all duration-1000 ease-out`} 
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className={`text-3xl font-extrabold font-mono ${tierStyle.text}`}>{result.score}</span>
                    <span className="text-[10px] text-slate-500 font-mono">/100</span>
                  </div>
                </div>

                {/* Status Checklist */}
                <div className="space-y-3 flex-1">
                   <div className="flex items-center gap-2 mb-1">
                      {result.tier === 'LOW' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                      {result.tier === 'MEDIUM' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                      {result.tier === 'HIGH' && <ShieldAlert className="w-5 h-5 text-red-500" />}
                      <span className={`font-bold text-lg uppercase tracking-wide ${tierStyle.text}`}>{result.tier} RISK</span>
                   </div>
                   
                   <p className="text-xs text-slate-400 mb-2">
                      {result.tier === 'LOW' ? 'This posting appears legitimate based on our analysis.' : result.tier === 'MEDIUM' ? 'Proceed with caution. Some signals are unclear.' : 'High risk of fraud detected.'}
                   </p>
                   
                   <ul className="space-y-2">
                     {result.positive_signals.slice(0, 4).map((sig, i) => (
                       <li key={`pos-${i}`} className="flex items-start gap-2 text-xs text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <span className="leading-tight">{sig.reason}</span>
                       </li>
                     ))}
                     {result.rule_reasons.slice(0, 4).map((sig, i) => (
                       <li key={`neg-${i}`} className="flex items-start gap-2 text-xs text-slate-300">
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="leading-tight">{sig.reason}</span>
                       </li>
                     ))}
                   </ul>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-slate-800">
                 <div className="inline-block bg-slate-800/50 border border-slate-700/50 rounded px-3 py-1.5 mb-2">
                   <span className="text-xs font-mono font-semibold text-emerald-400">AI confidence: {result.ai_confidence}%</span>
                 </div>
                 <p className="text-[10px] text-slate-500 italic">
                   Confidence reflects how much interpretable evidence supports this verdict, blended with the model's own certainty.
                 </p>
              </div>
            </div>

            {/* Overall Verdict Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md flex flex-col">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 block">Overall Verdict</span>
              <div className="flex items-center gap-2 mb-3">
                  {result.tier === 'LOW' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {result.tier === 'MEDIUM' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                  {result.tier === 'HIGH' && <ShieldAlert className="w-5 h-5 text-red-500" />}
                  <span className={`font-bold text-lg uppercase tracking-wide ${tierStyle.text}`}>
                     {result.tier === 'LOW' ? 'SAFE' : result.tier === 'MEDIUM' ? 'PROCEED WITH CAUTION' : 'DANGEROUS'}
                  </span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                 {result.tier === 'HIGH' ? 'Legitimate South African employers never request ID copies or banking details before an interview. Verify the company independently before responding.' : result.tier === 'MEDIUM' ? 'Some signals are ambiguous. Verify the company\'s registration on CIPC and never pay to apply before treating this opportunity as safe.' : 'Proceed with normal caution. Verify the company and recruiter before sharing personal information.'}
              </p>
              <p className="text-xs text-slate-500 italic mt-auto">
                 Qhaphela gives you an informed recommendation. It is not a final judgement - always verify independently.
              </p>
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
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center" role="status" aria-live="polite">
          {scanError ? (
            <>
              <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" aria-hidden="true" />
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
