import React, { useState, useMemo } from 'react';
import { CheckCircle, AlertCircle, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import type { TrackedBrand } from '../types';
import { getDeterministicBars } from '../utils/metrics';

// Default monitored brands if workspace has no brands yet
const DEFAULT_WORKSPACE_BRANDS: TrackedBrand[] = [
  {
    id: 'brand-demo-1',
    name: 'Supabase',
    keywords: ['supabase', 'postgres', 'rls', 'edge-functions'],
    competitor_names: ['Firebase', 'PlanetScale'],
    is_active: true,
  },
  {
    id: 'brand-demo-2',
    name: 'Prisma',
    keywords: ['prisma', 'orm', 'accelerate', 'pulse'],
    competitor_names: ['Drizzle', 'TypeORM'],
    is_active: true,
  },
  {
    id: 'brand-demo-3',
    name: 'Stripe',
    keywords: ['stripe', 'checkout', 'billing', 'webhooks'],
    competitor_names: ['Adyen', 'Paddle'],
    is_active: true,
  },
  {
    id: 'brand-demo-4',
    name: 'Vercel',
    keywords: ['vercel', 'nextjs', 'turbopack', 'ssr'],
    competitor_names: ['Netlify', 'Cloudflare Pages'],
    is_active: true,
  },
];

export const BrandsView: React.FC = () => {
  const { brands, refreshBrands, role } = useAuth();
  const [name, setName] = useState('');

  // Interactive tag-chip inputs
  const [keywordChips, setKeywordChips] = useState<string[]>(['supabase', 'postgres', 'auth']);
  const [keywordInput, setKeywordInput] = useState('');

  const [competitorChips, setCompetitorChips] = useState<string[]>(['Firebase', 'PlanetScale']);
  const [competitorInput, setCompetitorInput] = useState('');

  // Slider & channel pill toggles
  const [alertThreshold, setAlertThreshold] = useState<number>(60);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([
    'Instagram',
    'Reddit',
    'Hacker News',
    'X',
  ]);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  // Effective brands list
  const displayBrands = useMemo(() => {
    return brands.length > 0 ? brands : DEFAULT_WORKSPACE_BRANDS;
  }, [brands]);

  // Keyword chip handlers
  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = keywordInput.trim().replace(/^#/, '');
      if (val && !keywordChips.includes(val)) {
        setKeywordChips((prev) => [...prev, val]);
        setKeywordInput('');
      }
    } else if (e.key === 'Backspace' && !keywordInput && keywordChips.length > 0) {
      setKeywordChips((prev) => prev.slice(0, -1));
    }
  };

  const removeKeywordChip = (idx: number) => {
    setKeywordChips((prev) => prev.filter((_, i) => i !== idx));
  };

  // Competitor chip handlers
  const handleCompetitorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = competitorInput.trim();
      if (val && !competitorChips.includes(val)) {
        setCompetitorChips((prev) => [...prev, val]);
        setCompetitorInput('');
      }
    } else if (e.key === 'Backspace' && !competitorInput && competitorChips.length > 0) {
      setCompetitorChips((prev) => prev.slice(0, -1));
    }
  };

  const removeCompetitorChip = (idx: number) => {
    setCompetitorChips((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleChannel = (ch: string) => {
    setSelectedChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Gather chips + any pending text
      const finalKeywords = [...keywordChips];
      if (keywordInput.trim() && !finalKeywords.includes(keywordInput.trim())) {
        finalKeywords.push(keywordInput.trim().replace(/^#/, ''));
      }

      const finalCompetitors = [...competitorChips];
      if (competitorInput.trim() && !finalCompetitors.includes(competitorInput.trim())) {
        finalCompetitors.push(competitorInput.trim());
      }

      if (!name.trim()) {
        throw new Error('Brand name is required');
      }

      if (finalKeywords.length === 0) {
        throw new Error('At least one monitored keyword is required');
      }

      await api.brands.create({
        name: name.trim(),
        keywords: finalKeywords,
        competitor_names: finalCompetitors,
      });

      setSuccess(`Brand "${name}" added to real-time listening pipeline!`);
      setName('');
      setKeywordChips(['api', 'performance']);
      setKeywordInput('');
      setCompetitorChips(['Datadog']);
      setCompetitorInput('');
      await refreshBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bp-view-shell">
      {/* Split Layout: 65% Left 2x2 Grid / 35% Right Configuration Studio */}
      <div className="bp-brands-split-layout">
        {/* Left Column (65%): 2x2 Grid of Monitored Workspace Brands */}
        <section className="bp-brands-grid-col" aria-label="Monitored Brands">
          <div className="bp-brands-2x2-grid">
            {displayBrands.map((b) => {
              const monogram = b.name.charAt(0).toUpperCase();
              const histogramBars = getDeterministicBars(b.id || b.name, 10, 20, 95);
              const competitorsList = b.competitor_names && b.competitor_names.length > 0
                ? b.competitor_names
                : ['Firebase', 'PlanetScale'];

              return (
                <article key={b.id} className="bp-brand-card">
                  {/* Uppercase micro-label */}
                  <span className="bp-micro-label">MONITORED WORKSPACE BRAND</span>

                  {/* Top Bar: Monogram, Name & Listening Active Pill */}
                  <div className="bp-brand-card-top">
                    <div className="bp-brand-header-left">
                      <div className="bp-brand-monogram">{monogram}</div>
                      <h3 className="bp-brand-title">{b.name}</h3>
                    </div>
                    <div className="bp-status-pill">
                      <span className="bp-status-dot-ok" />
                      <span>Listening Active</span>
                    </div>
                  </div>

                  {/* Open Issues & 10-bar Histogram */}
                  <div className="bp-brand-metrics-row">
                    <div className="bp-brand-issues-metric">
                      <div className="bp-brand-issues-number">8</div>
                      <span className="bp-brand-issues-label">Open issue clusters</span>
                      <span className="bp-brand-issues-subtext">2 critical alerts</span>
                    </div>

                    <div className="bp-kpi-histogram" aria-hidden="true">
                      {histogramBars.map((h, i) => (
                        <div
                          key={i}
                          className="bp-histogram-bar"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Monitored Keywords Cloud */}
                  <div className="bp-brand-section-box">
                    <div className="bp-brand-section-label">Keywords</div>
                    <div className="bp-keyword-pills-wrap">
                      {b.keywords.map((kw, i) => (
                        <span key={i} className="bp-tag-keyword-pill">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Competitor Share of Voice Bars */}
                  <div className="bp-brand-section-box">
                    <div className="bp-brand-section-label">Competitor Share of Voice</div>
                    <div className="bp-sov-list">
                      {competitorsList.slice(0, 2).map((comp, idx) => {
                        const sovPercent = idx === 0 ? 64 : 36;
                        return (
                          <div key={idx} className="bp-sov-item">
                            <span className="bp-sov-label">vs {comp}</span>
                            <div className="bp-sov-bar-track">
                              <div
                                className="bp-sov-bar-fill"
                                style={{ width: `${sovPercent}%` }}
                              />
                            </div>
                            <span className="bp-sov-percentage">{sovPercent}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bp-card-divider" />

                  {/* Footer with Channel badges & Configure Brand Link */}
                  <div className="bp-brand-card-footer">
                    <div className="bp-channel-pills-row">
                      <span className="bp-channel-pill">IG</span>
                      <span className="bp-channel-pill">X</span>
                      <span className="bp-channel-pill">R</span>
                      <span className="bp-channel-pill">HN</span>
                    </div>

                    <button type="button" className="bp-view-cluster-link">
                      <span>Configure brand</span>
                      <span className="bp-arrow-glyph">↗</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Right Column (35%): ADD / CONFIGURE TRACKED BRAND Studio Card */}
        <aside className="bp-brands-studio-col" aria-label="Brand Configuration Studio">
          <div className="bp-studio-card">
            {/* Studio Header */}
            <div className="bp-studio-header">
              <span className="bp-micro-label">ADD / CONFIGURE TRACKED BRAND</span>
              <h3 className="bp-studio-title">Register Brand Pipeline</h3>
              <p className="bp-studio-subtitle">
                Configure background streaming crawlers across Hacker News, X, Reddit, and Instagram.
              </p>
            </div>

            {/* Non-admin RBAC warning */}
            {!isAdmin && (
              <div className="bp-alert-warning mb-4">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>Only workspace administrators can add or configure brand pipelines.</span>
              </div>
            )}

            {/* Alerts */}
            {success && (
              <div className="bp-alert-success mb-4">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}
            {error && (
              <div className="bp-alert-error mb-4">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Configuration Form */}
            <form onSubmit={handleAddBrand} className="bp-studio-form">
              {/* Brand Name Input */}
              <div className="bp-field-group">
                <label className="bp-field-label">Brand Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Cloud, Supabase"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin || loading}
                  className="bp-input"
                  required
                />
              </div>

              {/* Monitored Keywords Tag-Chip Input Box */}
              <div className="bp-field-group">
                <label className="bp-field-label">
                  Monitored Keywords (press Enter or comma)
                </label>
                <div className="bp-tag-chip-container">
                  {keywordChips.map((chip, idx) => (
                    <span key={idx} className="bp-input-chip">
                      #{chip}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => removeKeywordChip(idx)}
                          className="bp-chip-remove-btn"
                          title={`Remove ${chip}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={keywordChips.length === 0 ? 'Type keyword and press Enter...' : 'Add keyword...'}
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                    disabled={!isAdmin || loading}
                    className="bp-tag-chip-input"
                  />
                </div>
              </div>

              {/* Competitor Benchmarks Tag-Chip Input Box */}
              <div className="bp-field-group">
                <label className="bp-field-label">
                  Competitor Benchmarks (press Enter or comma)
                </label>
                <div className="bp-tag-chip-container">
                  {competitorChips.map((comp, idx) => (
                    <span key={idx} className="bp-input-chip">
                      vs {comp}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => removeCompetitorChip(idx)}
                          className="bp-chip-remove-btn"
                          title={`Remove ${comp}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={competitorChips.length === 0 ? 'Type competitor and press Enter...' : 'Add competitor...'}
                    value={competitorInput}
                    onChange={(e) => setCompetitorInput(e.target.value)}
                    onKeyDown={handleCompetitorKeyDown}
                    disabled={!isAdmin || loading}
                    className="bp-tag-chip-input"
                  />
                </div>
              </div>

              {/* Negative Sentiment Alert Threshold Range Slider */}
              <div className="bp-field-group">
                <div className="bp-slider-header">
                  <label className="bp-field-label mb-0">Negative Sentiment Alert Threshold</label>
                  <span className="bp-slider-value">{alertThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="90"
                  step="5"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(Number(e.target.value))}
                  disabled={!isAdmin || loading}
                  className="bp-range-slider"
                />
              </div>

              {/* Source Channels Pill Toggles */}
              <div className="bp-field-group">
                <label className="bp-field-label">Source Channels</label>
                <div className="bp-channel-toggles-row">
                  {['Instagram', 'Reddit', 'Hacker News', 'X'].map((ch) => {
                    const active = selectedChannels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleChannel(ch)}
                        disabled={!isAdmin || loading}
                        className={`bp-channel-toggle-pill ${active ? 'active' : ''}`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Full-width Umber Submit Button */}
              <button
                type="submit"
                disabled={!isAdmin || loading}
                className="bp-btn-primary bp-btn-full mt-4"
              >
                {loading ? 'Saving...' : 'Save & Start Listening →'}
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};
