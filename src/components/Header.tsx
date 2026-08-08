import React from 'react';
import { Globe, Settings } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scanner' | 'academy' | 'simulator' | 'api';
  setActiveTab: (tab: 'scanner' | 'academy' | 'simulator' | 'api') => void;
  apiStatus: 'online' | 'offline' | 'checking';
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, apiStatus }) => {
  return (
    <header className="bg-[#0f172a]/95 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      {/* Top Row: Brand & Settings */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Official Shield Logo */}
          <img src="/icons/logo-mark.png" alt="Qhaphela" className="w-8 h-8 object-contain" />
          <span className="font-bold tracking-widest text-lg text-slate-100 uppercase">
            QHAPHELA
          </span>
        </div>
        
        <div className="flex items-center gap-4">
           {/* Mockup settings to match screenshot */}
           <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded px-3 py-1 cursor-pointer">
              <span className="text-xs text-slate-300">English</span>
              <Globe className="w-3.5 h-3.5 text-slate-400" />
           </div>
           <button className="text-slate-400 hover:text-slate-200">
             <Settings className="w-4 h-4" />
           </button>
        </div>
      </div>


      {/* Bottom Row: Flat Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center gap-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'scanner', label: 'Overview' },
            { id: 'academy', label: 'Red Flags' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`whitespace-nowrap pb-3 pt-1 text-sm font-semibold transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};