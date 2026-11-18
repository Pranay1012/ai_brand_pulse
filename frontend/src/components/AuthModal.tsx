import React, { useState } from 'react';
import { Lock, Mail, User as UserIcon, AlertCircle, Shield, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AuthModal: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Full name is required');
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSelect = async (roleType: 'admin' | 'responder' | 'viewer') => {
    const creds = {
      admin: { email: 'lead@brandpulse.dev', pass: 'Secret123!', name: 'Lead Engineer' },
      responder: { email: 'responder@brandpulse.dev', pass: 'Secret123!', name: 'Support Responder' },
      viewer: { email: 'viewer@brandpulse.dev', pass: 'Secret123!', name: 'Brand Observer' },
    }[roleType];

    setEmail(creds.email);
    setPassword(creds.pass);
    setName(creds.name);
    setError(null);

    // Auto-attempt login with demo credentials
    setLoading(true);
    try {
      if (isRegister) {
        await register(creds.email, creds.pass, creds.name);
      } else {
        await login(creds.email, creds.pass);
      }
    } catch {
      // If login failed (e.g. user not yet seeded), fill in fields and inform user
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const sampleHistogramHeights = [30, 48, 38, 62, 75, 58, 92, 68, 100, 72];

  return (
    <div className="bp-auth-split-layout">
      {/* 55% Left Showcase Panel on Architectural Grid */}
      <section className="bp-auth-showcase">
        {/* Top Bar */}
        <div className="bp-auth-showcase-top">
          <div className="bp-brand-wordmark">BrandPulse</div>
          <div className="bp-status-pill">
            <span className="bp-status-dot-ok" />
            <span>System Operational</span>
          </div>
        </div>

        {/* Center Floating Preview Stack */}
        <div className="bp-auth-preview-stage">
          {/* Primary Preview Card */}
          <div className="bp-preview-card-primary">
            <div className="bp-preview-card-header">
              <span className="bp-micro-label">LIVE WORKSPACE PREVIEW</span>
              <span className="bp-time-pill">24h</span>
            </div>

            <h3 className="bp-preview-title">Customer signals</h3>

            <div className="bp-preview-middle-row">
              <div className="bp-preview-metric-col">
                <span className="bp-metric-sublabel">Open issues</span>
                <div className="bp-metric-large">12</div>
                <span className="bp-metric-caption">3 surfaced this hour</span>
              </div>

              {/* 10-bar Vertical Histogram */}
              <div className="bp-histogram-10bar" aria-hidden="true">
                {sampleHistogramHeights.map((h, i) => (
                  <div
                    key={i}
                    className="bp-histogram-bar"
                    style={{ height: `${h}%` }}
                    title={`Bucket ${i + 1}: ${h}%`}
                  />
                ))}
              </div>
            </div>

            <div className="bp-preview-divider" />

            {/* Bottom Issue Highlight */}
            <div className="bp-preview-issue-section">
              <div className="bp-preview-issue-meta">
                <span className="bp-micro-label">Highest priority</span>
                <span className="bp-pill-needs-attention">Needs attention</span>
              </div>

              <h4 className="bp-preview-issue-title">Delivery delays</h4>
              <p className="bp-preview-issue-desc">186 mentions across 3 channels</p>

              <div className="bp-preview-issue-footer">
                <div className="bp-channel-pills-row">
                  <span className="bp-channel-pill">IG</span>
                  <span className="bp-channel-pill">X</span>
                  <span className="bp-channel-pill">R</span>
                </div>
                <span className="bp-view-issue-link">
                  View issue <span className="bp-arrow-glyph">↗</span>
                </span>
              </div>
            </div>
          </div>

          {/* L-Shaped Connector Line */}
          <div className="bp-connector-wrapper" aria-hidden="true">
            <svg
              className="bp-connector-svg"
              width="44"
              height="44"
              viewBox="0 0 44 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 0 V24 Q10 34 20 34 H40"
                stroke="#8C6D53"
                strokeWidth="1.75"
                strokeLinecap="round"
                fill="none"
              />
              <polyline
                points="36,30 42,34 36,38"
                fill="none"
                stroke="#8C6D53"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Connected Secondary Floating Card */}
          <div className="bp-preview-card-secondary">
            <div className="bp-preview-node-header">
              <span className="bp-node-meta-tag">AI Action Drafted →</span>
              <span className="bp-node-pill">Ready for Triage</span>
            </div>
            <div className="bp-node-title">Jira Ticket #BP-204 (Ready for Triage)</div>
          </div>
        </div>

        {/* Bottom Footer Controls */}
        <div className="bp-auth-showcase-footer">
          <div className="bp-footer-tag">
            <Shield className="w-3.5 h-3.5" />
            <span>WORKSPACE ACCESS CONTROLS</span>
          </div>
          <div className="bp-footer-tag">
            <UserCheck className="w-3.5 h-3.5" />
            <span>HUMAN-REVIEWED TRIAGE</span>
          </div>
        </div>
      </section>

      {/* 45% Right Sign-in Panel on Crisp Pure White */}
      <section className="bp-auth-form-panel">
        <div className="bp-auth-form-container">
          {/* Brand Monogram + Title */}
          <div className="bp-auth-form-brand">
            <div className="bp-monogram-badge">B</div>
            <span className="bp-auth-form-brandname">BrandPulse</span>
          </div>

          <h1 className="bp-auth-headline">
            Know what customers are angry about before it trends.
          </h1>
          <p className="bp-auth-subhead">
            BrandPulse groups social posts into issues and ranks which ones your team should handle first.
          </p>

          {/* Segmented Control Track */}
          <div className="bp-auth-segment-track">
            <button
              type="button"
              className={`bp-auth-segment-btn ${!isRegister ? 'active' : ''}`}
              onClick={() => {
                setIsRegister(false);
                setError(null);
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`bp-auth-segment-btn ${isRegister ? 'active' : ''}`}
              onClick={() => {
                setIsRegister(true);
                setError(null);
              }}
            >
              Create Account
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="bp-alert-error mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Sign In / Register Form */}
          <form onSubmit={handleSubmit} className="bp-auth-fields-form">
            {isRegister && (
              <div className="bp-field-group">
                <label className="bp-field-label">Full Name</label>
                <div className="bp-input-wrapper">
                  <UserIcon className="bp-input-icon" />
                  <input
                    type="text"
                    className="bp-input"
                    placeholder="Alex Rivera"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="bp-field-group">
              <label className="bp-field-label">Email Address</label>
              <div className="bp-input-wrapper">
                <Mail className="bp-input-icon" />
                <input
                  type="email"
                  className="bp-input"
                  placeholder="alex@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="bp-field-group">
              <label className="bp-field-label">Password</label>
              <div className="bp-input-wrapper">
                <Lock className="bp-input-icon" />
                <input
                  type="password"
                  className="bp-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bp-btn-primary bp-auth-submit-btn"
            >
              {loading
                ? 'Authenticating...'
                : isRegister
                ? 'Create Workspace Account →'
                : 'Sign In to Workspace →'}
            </button>
          </form>

          {/* Collapsible Quick Test Accounts Box */}
          <div className="bp-quick-test-box">
            <button
              type="button"
              className="bp-quick-test-toggle"
              onClick={() => setDemoOpen(!demoOpen)}
            >
              <span className="bp-quick-test-label">Quick Test Accounts</span>
              {demoOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {demoOpen && (
              <div className="bp-quick-test-pills">
                <button
                  type="button"
                  className="bp-role-test-pill"
                  onClick={() => handleDemoSelect('admin')}
                  title="Demo Admin: lead@brandpulse.dev"
                >
                  Admin
                </button>
                <button
                  type="button"
                  className="bp-role-test-pill"
                  onClick={() => handleDemoSelect('responder')}
                  title="Demo Responder: responder@brandpulse.dev"
                >
                  Responder
                </button>
                <button
                  type="button"
                  className="bp-role-test-pill"
                  onClick={() => handleDemoSelect('viewer')}
                  title="Demo Viewer: viewer@brandpulse.dev"
                >
                  Viewer
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
