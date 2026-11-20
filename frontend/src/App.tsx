import { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
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
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [actionsVersion, setActionsVersion] = useState<number>(0);
  const [systemStatus, setSystemStatus] = useState<'ok' | 'degraded' | 'checking'>('checking');

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();

    const fetchPendingCount = async () => {
      try {
        const pending = await api.actions.list(
          {
            status: 'pending',
            brand_id: selectedBrandId || undefined,
          },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setPendingCount(pending.length);
        }
      } catch {
        // Ignore transient polling failures
      }
    };

    void fetchPendingCount();
    const interval = setInterval(() => {
      void fetchPendingCount();
    }, 15000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [isAuthenticated, selectedBrandId, actionsVersion]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const controller = new AbortController();

    const checkHealth = async () => {
      try {
        const res = await api.health(controller.signal);
        if (!controller.signal.aborted) {
          setSystemStatus(res.status === 'ok' ? 'ok' : 'degraded');
        }
      } catch {
        if (!controller.signal.aborted) {
          setSystemStatus('degraded');
        }
      }
    };

    void checkHealth();
    const interval = setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const displayPendingCount = isAuthenticated ? pendingCount : 0;
  const displaySystemStatus = isAuthenticated ? systemStatus : 'checking';

  if (isLoading) {
    return (
      <div className="bp-app-loading-screen">
        <div className="bp-monogram-badge bp-mb-4 bp-pulse">B</div>
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
        pendingCount={displayPendingCount}
        systemStatus={displaySystemStatus}
      />

      <main className="bp-main-content">
        {activeTab === 'radar' && (
          <RadarView onNavigateToActions={() => setActiveTab('actions')} />
        )}
        {activeTab === 'actions' && (
          <ActionTriageView onActionsChanged={() => setActionsVersion((v) => v + 1)} />
        )}
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
