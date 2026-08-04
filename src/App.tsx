import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { FraudScanner } from './components/FraudScanner';
import { RedFlagAcademy } from './components/RedFlagAcademy';
import { ExtensionSimulator } from './components/ExtensionSimulator';
import { ApiDocs } from './components/ApiDocs';

export function App() {
  const [activeTab, setActiveTab] = useState<'scanner' | 'academy' | 'simulator' | 'api'>('scanner');
  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') {
          setApiStatus('online');
        } else {
          setApiStatus('offline');
        }
      })
      .catch(() => setApiStatus('offline'));
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      
      <div>
        <Header activeTab={activeTab} setActiveTab={setActiveTab} apiStatus={apiStatus} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'scanner' && <FraudScanner />}
          {activeTab === 'academy' && <RedFlagAcademy />}
          {activeTab === 'simulator' && <ExtensionSimulator />}
          {activeTab === 'api' && <ApiDocs />}
        </main>
      </div>

      <footer className="border-t border-slate-800 bg-slate-950/60 py-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>QHAPHELA — Job Posting Fraud Reader & Red Flag Academy</span>
          <span className="text-slate-600">South African Deception Pattern Detection • XAI SHAP Scoring Engine</span>
        </div>
      </footer>

    </div>
  );
}

export default App;
