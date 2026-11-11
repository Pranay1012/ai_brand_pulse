import React, { useState } from 'react';
import { Radio, Lock, Mail, User as UserIcon, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AuthModal: React.FC = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const prefillDemo = (demoEmail: string, demoPass: string, demoName: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setName(demoName);
    setError(null);
  };

  return (
    <div className="bp-auth-container">
      <div className="bp-auth-card">
        {/* Header */}
        <div className="bp-auth-header">
          <div className="bp-auth-logo">
            <Radio className="w-8 h-8 text-indigo-400 animate-pulse" />
          </div>
          <h1 className="bp-auth-title">BrandPulse <span className="bp-badge-ai">AI</span></h1>
          <p className="bp-auth-desc">
            Social issue clustering and autonomous triage microservice
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="bp-auth-tabs">
          <button
            type="button"
            className={`bp-auth-tab ${!isRegister ? 'active' : ''}`}
            onClick={() => { setIsRegister(false); setError(null); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`bp-auth-tab ${isRegister ? 'active' : ''}`}
            onClick={() => { setIsRegister(true); setError(null); }}
          >
            Register
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bp-alert-error">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bp-auth-form">
          {isRegister && (
            <div className="bp-input-group">
              <label>Full Name</label>
              <div className="bp-input-wrapper">
                <UserIcon className="bp-input-icon" />
                <input
                  type="text"
                  placeholder="Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="bp-input-group">
            <label>Email Address</label>
            <div className="bp-input-wrapper">
              <Mail className="bp-input-icon" />
              <input
                type="email"
                placeholder="alex@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="bp-input-group">
            <label>Password</label>
            <div className="bp-input-wrapper">
              <Lock className="bp-input-icon" />
              <input
                type="password"
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
            className="bp-btn-primary bp-auth-submit"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>{isRegister ? 'Create Account' : 'Sign In to Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Pre-fill */}
        <div className="bp-auth-demo-box">
          <div className="bp-auth-demo-label">Quick Test Accounts:</div>
          <div className="bp-auth-demo-buttons">
            <button
              type="button"
              className="bp-demo-pill"
              onClick={() => {
                setIsRegister(true);
                prefillDemo('lead@brandpulse.dev', 'Secret123!', 'Lead Engineer');
              }}
            >
              Prefill Register (Admin)
            </button>
            <button
              type="button"
              className="bp-demo-pill"
              onClick={() => {
                setIsRegister(false);
                prefillDemo('lead@brandpulse.dev', 'Secret123!', 'Lead Engineer');
              }}
            >
              Prefill Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

