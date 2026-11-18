import React from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  activeTab: 'radar' | 'actions' | 'brands';
  setActiveTab: (tab: 'radar' | 'actions' | 'brands') => void;
  pendingCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, pendingCount = 0 }) => {
  const { role, logout, brands, selectedBrandId, setSelectedBrandId } = useAuth();

  const formatRole = (r: string | null) => {
    if (!r) return 'Viewer';
    return r.charAt(0).toUpperCase() + r.slice(1);
  };

  return (
    <header className="bp-navbar-shell">
      <div className="bp-navbar-inner">
        {/* Left: Monogram B + BrandPulse Wordmark */}
        <div className="bp-nav-left">
          <div className="bp-monogram-badge">B</div>
          <span className="bp-nav-brand-title">BrandPulse</span>
        </div>

        {/* Center: Segmented Capsule Navigation Track */}
        <nav className="bp-nav-segmented-track" aria-label="Main Navigation">
          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            className={`bp-nav-pill-btn ${activeTab === 'radar' ? 'active' : ''}`}
          >
            Radar & Clusters
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            className={`bp-nav-pill-btn ${activeTab === 'actions' ? 'active' : ''}`}
          >
            Action Triage {pendingCount > 0 ? `(${pendingCount})` : ''}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('brands')}
            className={`bp-nav-pill-btn ${activeTab === 'brands' ? 'active' : ''}`}
          >
            Tracked Brands
          </button>
        </nav>

        {/* Right: Operational Status, Brand Select, Role Pill & Sign Out */}
        <div className="bp-nav-right">
          {/* System Operational Status Pill */}
          <div className="bp-status-pill">
            <span className="bp-status-dot-ok" />
            <span>System Operational</span>
          </div>

          {/* Brand Filter Dropdown */}
          <div className="bp-brand-select-container">
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="bp-brand-pill-select"
              aria-label="Filter by brand"
            >
              <option value="">All Tracked Brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown className="bp-select-chevron" />
          </div>

          {/* User Role Pill */}
          <div className="bp-role-badge-pill" title={`Signed in as ${formatRole(role)}`}>
            {formatRole(role)}
          </div>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={logout}
            className="bp-signout-btn"
            title="Sign Out"
            aria-label="Sign out of workspace"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
