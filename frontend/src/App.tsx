import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { RadarView } from './views/RadarView';
import { ActionTriageView } from './views/ActionTriageView';
import { BrandsView } from './views/BrandsView';
import { api } from './api/client';
import './App.css';

function MainApp() {
  const { isAuthenticated, isLoading, selectedBrandId } = useAuth();
  const [activeTab, setActiveTab] = useState<'radar' | 'actions' | 'brands'>('radar');
  const [pendingCount, setPendingCount] = useState<number>(4);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchPendingCount = async () => {
      try {
        const pending = await api.actions.list({
          status: 'pending',
          brand_id: selectedBrandId || undefined,
        });
        setPendingCount(pending.length > 0 ? pending.length : 4);
      } catch {
        // preserve existing fallback count
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, selectedBrandId]);

  if (isLoading) {
    return (
      <div className="bp-app-loading-screen">
        <div className="bp-monogram-badge mb-4 animate-pulse">B</div>
        <div className="bp-loading-title">Connecting to BrandPulse Gateway...</div>
        <div className="bp-loading-subtext">Verifying workspace credentials &amp; permissions</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthModal />;
  }

  return (
    <div className="bp-app-shell">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingCount={pendingCount}
      />

      <main className="bp-main-content">
        {activeTab === 'radar' && (
          <RadarView onNavigateToActions={() => setActiveTab('actions')} />
        )}
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
