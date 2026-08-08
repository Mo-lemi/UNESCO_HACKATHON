import React, { useState } from 'react';
import { Globe, Settings, Sun, Moon, XCircle } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scanner' | 'academy' | 'simulator' | 'api';
  setActiveTab: (tab: 'scanner' | 'academy' | 'simulator' | 'api') => void;
  apiStatus: 'online' | 'offline' | 'checking';
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, apiStatus }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const toggleTheme = () => {
    const newIsDark = !isDarkMode;
    setIsDarkMode(newIsDark);
    
    // Toggle the theme classes on the document body to apply your CSS variables
    if (newIsDark) {
      document.body.classList.remove('light');
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    }
    
    setShowSettings(false); // Close the dropdown after selection
  };

  const closeApp = () => {
    if (window.confirm("Are you sure you want to close the app?")) {
      // Browsers often block scripts from closing tabs that the script didn't open itself.
      // We attempt window.close() first, then fallback to replacing the screen.
      window.close();
      
      // Fallback screen if the browser prevents closing the tab
      document.body.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:center; height:100vh; background-color:#0B1120; color:white; font-family:sans-serif;">
          <div style="text-align:center;">
            <h2 style="font-size:24px; font-weight:bold; margin-bottom:8px;">Qhaphela is closed.</h2>
            <p style="color:#94a3b8;">You can safely close this browser tab.</p>
          </div>
        </div>
      `;
    }
    setShowSettings(false);
  };

  return (
    <header className="bg-[#0f172a]/95 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      {/* Top Row: Brand & Settings */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Official Shield Logo */}
          <img src="/icons/logo-mark.png" alt="Qhaphela" className="w-8 h-8 object-contain" />
          <span className="font-bold tracking-widest text-lg text-slate-100 uppercase">
            QHAPHELA: KNOW BEFORE YOU APPLY!
          </span>
        </div>
        
        <div className="flex items-center gap-4 relative">
           <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded px-3 py-1 cursor-pointer hover:bg-slate-800/80 transition-colors">
              <span className="text-xs text-slate-300">English</span>
              <Globe className="w-3.5 h-3.5 text-slate-400" />
           </div>
           
           {/* Settings Toggle Button */}
           <button 
             onClick={() => setShowSettings(!showSettings)}
             className={`p-1.5 rounded-md transition-colors ${showSettings ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
             aria-label="Settings"
           >
             <Settings className="w-4 h-4" />
           </button>

           {/* Settings Dropdown Menu */}
           {showSettings && (
             <div className="absolute right-0 top-10 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 z-50">
               <button 
                 onClick={toggleTheme}
                 className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
               >
                 {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                 <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
               </button>
               <button 
                 onClick={closeApp}
                 className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors border-t border-slate-800 mt-1"
               >
                 <XCircle className="w-4 h-4" />
                 <span>Close App</span>
               </button>
             </div>
           )}
        </div>
      </div>

      {/* Bottom Row: Flat Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center gap-8 overflow-x-auto no-scrollbar">
          {[
            { id: 'scanner', label: 'Overview' },
            { id: 'academy', label: 'Red Flags' }
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