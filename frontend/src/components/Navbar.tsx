import React from 'react';
import { Activity, CheckSquare, Tag, LogOut, Shield, Building2, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  activeTab: 'radar' | 'actions' | 'brands';
  setActiveTab: (tab: 'radar' | 'actions' | 'brands') => void;
  pendingCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, pendingCount = 0 }) => {
  const { user, workspace, role, logout, brands, selectedBrandId, setSelectedBrandId } = useAuth();

  const getRoleBadgeColor = () => {
    switch (role) {
      case 'admin':
        return 'bg-purple-900/60 text-purple-300 border-purple-700/50';
      case 'responder':
        return 'bg-blue-900/60 text-blue-300 border-blue-700/50';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <header className="bp-navbar">
      <div className="bp-navbar-container">
        {/* Brand / Logo */}
        <div className="bp-logo-group">
          <div className="bp-logo-icon">
            <Radio className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <div className="bp-logo-title">BrandPulse <span className="bp-badge-ai">AI</span></div>
            <div className="bp-logo-subtitle">Realtime Semantic Listening</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="bp-nav-tabs">
          <button
            onClick={() => setActiveTab('radar')}
            className={`bp-tab-btn ${activeTab === 'radar' ? 'active' : ''}`}
          >
            <Activity className="w-4 h-4" />
            <span>Radar & Clusters</span>
          </button>

          <button
            onClick={() => setActiveTab('actions')}
            className={`bp-tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Action Triage</span>
            {pendingCount > 0 && (
              <span className="bp-tab-badge">{pendingCount}</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('brands')}
            className={`bp-tab-btn ${activeTab === 'brands' ? 'active' : ''}`}
          >
            <Tag className="w-4 h-4" />
            <span>Tracked Brands</span>
          </button>
        </nav>

        {/* Right Section: Brand selector & User Info */}
        <div className="bp-navbar-right">
          {/* Brand Selector */}
          {brands.length > 0 && (
            <div className="bp-brand-select-wrapper">
              <select
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
                className="bp-brand-select"
              >
                <option value="">All Tracked Brands</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Workspace and Role Info */}
          <div className="bp-user-info">
            <div className="bp-user-meta">
              <div className="bp-workspace-name">
                <Building2 className="w-3.5 h-3.5" />
                <span>{workspace?.name || 'Workspace'}</span>
              </div>
              <div className="bp-user-email">{user?.email}</div>
            </div>

            <span className={`bp-role-badge ${getRoleBadgeColor()}`}>
              <Shield className="w-3 h-3" />
              <span>{role || 'viewer'}</span>
            </span>

            <button
              onClick={logout}
              title="Sign Out"
              className="bp-logout-btn"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

