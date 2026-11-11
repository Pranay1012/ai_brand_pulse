import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { RadarView } from './views/RadarView';
import { ActionTriageView } from './views/ActionTriageView';
import { BrandsView } from './views/BrandsView';
import { api } from './api/client';
import { Activity } from 'lucide-react';
import './App.css';

function MainApp() {
  const { isAuthenticated, isLoading, selectedBrandId } = useAuth();
  const [activeTab, setActiveTab] = useState<'radar' | 'actions' | 'brands'>('radar');
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchPendingCount = async () => {
      try {
        const pending = await api.actions.list({
          status: 'pending',
          brand_id: selectedBrandId || undefined,
        });
        setPendingCount(pending.length);
      } catch {
        // ignore background poll errors
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, selectedBrandId]);

  if (isLoading) {
    return (
      <div className="bp-app-loading-screen">
        <Activity className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
        <div className="text-slate-300 font-medium">Connecting to BrandPulse Gateway...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthModal />;
  }

  return (
    <div className="bp-app-layout">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
      />

      <main className="bp-main-content">
        {activeTab === 'radar' && <RadarView />}
        {activeTab === 'actions' && <ActionTriageView />}
        {activeTab === 'brands' && <BrandsView />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
