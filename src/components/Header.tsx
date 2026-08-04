import React from 'react';
import { ShieldAlert, BookOpen, Chrome, Code, Activity } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scanner' | 'academy' | 'simulator' | 'api';
  setActiveTab: (tab: 'scanner' | 'academy' | 'simulator' | 'api') => void;
  apiStatus: 'online' | 'offline' | 'checking';
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, apiStatus }) => {
  return (
    <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Title. A real <button>: this navigates back to the scanner,
              so it must be reachable by keyboard, not a bare div with onClick. */}
          <button
            type="button"
            className="flex items-center gap-3 cursor-pointer text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            onClick={() => setActiveTab('scanner')}
            aria-label="Qhaphela home — go to the fraud scanner"
          >
            {/* Was "I", left over from the project's former name, Isazi. */}
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center font-mono font-black text-slate-950 text-xl shadow-lg shadow-red-500/20"
            >
              Q
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold tracking-wider text-xl text-slate-100">QHAPHELA</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">v0.1.0</span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Protecting Opportunities. Empowering Futures.</p>
            </div>
          </button>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'scanner'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Fraud Scanner</span>
            </button>

            <button
              onClick={() => setActiveTab('academy')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'academy'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Red Flag Academy</span>
            </button>

            <button
              onClick={() => setActiveTab('simulator')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'simulator'
                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Chrome className="w-4 h-4" />
              <span className="hidden md:inline">Extension View</span>
            </button>

            <button
              onClick={() => setActiveTab('api')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'api'
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Code className="w-4 h-4" />
              <span className="hidden md:inline">API</span>
            </button>
          </nav>

          {/* API Status Badge */}
          <div
            className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-3 py-1 text-xs"
            role="status"
            aria-live="polite"
            aria-label={`Model service: ${apiStatus}`}
          >
            {/* Decorative: the state is already in the text beside it. The
                animation is suppressed for anyone who asked for reduced
                motion -- a constantly pulsing dot is a real problem for some
                vestibular and attention conditions. */}
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${
                apiStatus === 'online'
                  ? 'bg-emerald-500 animate-pulse motion-reduce:animate-none'
                  : apiStatus === 'offline'
                  ? 'bg-red-500'
                  : 'bg-amber-500 animate-ping motion-reduce:animate-none'
              }`}
            />
            <span className="font-mono text-slate-300">
              {apiStatus === 'online' ? 'RandomForest' : apiStatus === 'offline' ? 'API offline' : 'checking'}
            </span>
          </div>

        </div>
      </div>
    </header>
  );
};
