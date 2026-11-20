import React, { useEffect, useState, useMemo } from 'react';
import { CheckCircle, AlertCircle, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { api } from '../api/client';
import type { IssueCluster, TrackedBrand } from '../types';
import { getDeterministicBars } from '../utils/metrics';

function normalizeKeyword(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim();
}

export const BrandsView: React.FC = () => {
  const { brands, refreshBrands, role } = useAuth();
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [name, setName] = useState('');

  // Interactive tag-chip inputs
  const [keywordChips, setKeywordChips] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');

  const [competitorChips, setCompetitorChips] = useState<string[]>([]);
  const [competitorInput, setCompetitorInput] = useState('');

  const [isActive, setIsActive] = useState<boolean>(true);
  const [openClusters, setOpenClusters] = useState<IssueCluster[]>([]);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  useEffect(() => {
    const controller = new AbortController();

    const loadOpenClusters = async () => {
      try {
        const data = await api.clusters.list({ status: 'open' }, controller.signal);
        if (!controller.signal.aborted) {
          setOpenClusters(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Failed to load open clusters for brand counts:', err);
        }
      }
    };

    void loadOpenClusters();

    return () => {
      controller.abort();
    };
  }, [brands]);

  const clusterCountsByBrand = useMemo(() => {
    const counts = new Map<string, { openCount: number; criticalCount: number }>();
    for (const cluster of openClusters) {
      const entry = counts.get(cluster.brand_id) ?? { openCount: 0, criticalCount: 0 };
      entry.openCount += 1;
      if ((cluster.negative_ratio || 0) >= 0.6) {
        entry.criticalCount += 1;
      }
      counts.set(cluster.brand_id, entry);
    }
    return counts;
  }, [openClusters]);

  const resetForm = () => {
    setEditingBrandId(null);
    setName('');
    setKeywordChips([]);
    setKeywordInput('');
    setCompetitorChips([]);
    setCompetitorInput('');
    setIsActive(true);
  };

  const handleStartConfigure = (brand: TrackedBrand) => {
    if (!isAdmin) return;
    setEditingBrandId(brand.id);
    setName(brand.name);
    setKeywordChips(brand.keywords || []);
    setKeywordInput('');
    setCompetitorChips(brand.competitor_names || []);
    setCompetitorInput('');
    setIsActive(brand.is_active);
    setError(null);
    setSuccess(null);
  };

  // Keyword chip handlers
  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = normalizeKeyword(keywordInput);
      if (val) {
        if (!keywordChips.includes(val)) {
          setKeywordChips((prev) => [...prev, val]);
        }
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
      if (val) {
        if (!competitorChips.includes(val)) {
          setCompetitorChips((prev) => [...prev, val]);
        }
        setCompetitorInput('');
      }
    } else if (e.key === 'Backspace' && !competitorInput && competitorChips.length > 0) {
      setCompetitorChips((prev) => prev.slice(0, -1));
    }
  };

  const removeCompetitorChip = (idx: number) => {
    setCompetitorChips((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const finalKeywords = [...keywordChips];
      const pendingKeyword = normalizeKeyword(keywordInput);
      if (pendingKeyword && !finalKeywords.includes(pendingKeyword)) {
        finalKeywords.push(pendingKeyword);
      }

      const finalCompetitors = [...competitorChips];
      const pendingCompetitor = competitorInput.trim();
      if (pendingCompetitor && !finalCompetitors.includes(pendingCompetitor)) {
        finalCompetitors.push(pendingCompetitor);
      }

      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error('Brand name is required');
      }

      if (finalKeywords.length === 0) {
        throw new Error('At least one monitored keyword is required');
      }

      if (editingBrandId) {
        await api.brands.update(editingBrandId, {
          name: trimmedName,
          keywords: finalKeywords,
          competitor_names: finalCompetitors,
          is_active: isActive,
        });
        setSuccess(`Brand "${trimmedName}" configuration updated.`);
      } else {
        await api.brands.create({
          name: trimmedName,
          keywords: finalKeywords,
          competitor_names: finalCompetitors,
          is_active: isActive,
        });
        setSuccess(`Brand "${trimmedName}" added to listening pipeline!`);
      }

      resetForm();
      await refreshBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save brand configuration');
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
          {brands.length === 0 ? (
            <div className="bp-empty-well">
              <Sparkles className="bp-icon-xl bp-text-muted bp-mb-2" />
              <div className="bp-empty-title">No tracked brands yet</div>
              <p className="bp-empty-desc">
                Register a brand in the configuration studio to start monitoring public mentions.
              </p>
            </div>
          ) : (
            <div className="bp-brands-2x2-grid">
              {brands.map((b) => {
                const monogram = b.name.charAt(0).toUpperCase();
                const histogramBars = getDeterministicBars(b.id || b.name, 10, 20, 95);
                const brandStats = clusterCountsByBrand.get(b.id) ?? {
                  openCount: 0,
                  criticalCount: 0,
                };
                const isSelectedForEdit = editingBrandId === b.id;

                return (
                  <article
                    key={b.id}
                    className={`bp-brand-card ${isSelectedForEdit ? 'selected' : ''}`}
                  >
                    {/* Uppercase micro-label */}
                    <span className="bp-micro-label">MONITORED WORKSPACE BRAND</span>

                    {/* Top Bar: Monogram, Name & Active/Paused Pill */}
                    <div className="bp-brand-card-top">
                      <div className="bp-brand-header-left">
                        <div className="bp-brand-monogram">{monogram}</div>
                        <h3 className="bp-brand-title">{b.name}</h3>
                      </div>
                      <div className="bp-status-pill">
                        <span
                          className={b.is_active ? 'bp-status-dot-ok' : 'bp-status-dot-paused'}
                        />
                        <span>{b.is_active ? 'Listening Active' : 'Paused'}</span>
                      </div>
                    </div>

                    {/* Open Issues & 10-bar Histogram */}
                    <div className="bp-brand-metrics-row">
                      <div className="bp-brand-issues-metric">
                        <div className="bp-brand-issues-number">{brandStats.openCount}</div>
                        <span className="bp-brand-issues-label">Open issue clusters</span>
                        <span className="bp-brand-issues-subtext">
                          {brandStats.criticalCount} critical{' '}
                          {brandStats.criticalCount === 1 ? 'alert' : 'alerts'}
                        </span>
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

                    {/* Competitors */}
                    <div className="bp-brand-section-box">
                      <div className="bp-brand-section-label">Competitors</div>
                      {b.competitor_names && b.competitor_names.length > 0 ? (
                        <div className="bp-keyword-pills-wrap">
                          {b.competitor_names.map((comp, idx) => (
                            <span key={idx} className="bp-pill-neutral">
                              vs {comp}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="bp-doc-subtext">No competitors configured</span>
                      )}
                    </div>

                    <div className="bp-card-divider" />

                    {/* Footer with keyword count & Configure Brand Link */}
                    <div className="bp-brand-card-footer">
                      <span className="bp-pill-neutral">
                        {b.keywords.length} {b.keywords.length === 1 ? 'keyword' : 'keywords'}
                      </span>

                      <button
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => handleStartConfigure(b)}
                        className="bp-view-cluster-link"
                        title={
                          isAdmin
                            ? `Configure ${b.name}`
                            : 'Administrator role required to configure brands'
                        }
                      >
                        <span>Configure brand</span>
                        <span className="bp-arrow-glyph">↗</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column (35%): ADD / CONFIGURE TRACKED BRAND Studio Card */}
        <aside className="bp-brands-studio-col" aria-label="Brand Configuration Studio">
          <div className="bp-studio-card">
            {/* Studio Header */}
            <div className="bp-studio-header">
              <span className="bp-micro-label">
                {editingBrandId ? 'EDIT TRACKED BRAND' : 'ADD TRACKED BRAND'}
              </span>
              <h3 className="bp-studio-title">
                {editingBrandId ? 'Update Brand Pipeline' : 'Register Brand Pipeline'}
              </h3>
              <p className="bp-studio-subtitle">
                Configure monitored keywords, competitors, and pipeline status for ingestion workers.
              </p>
            </div>

            {/* Non-admin RBAC warning */}
            {!isAdmin && (
              <div className="bp-alert-warning bp-mb-4">
                <ShieldAlert className="bp-icon-md bp-shrink-0" />
                <span>Only workspace administrators can add or configure brand pipelines.</span>
              </div>
            )}

            {/* Alerts */}
            {success && (
              <div className="bp-alert-success bp-mb-4">
                <CheckCircle className="bp-icon-md bp-shrink-0" />
                <span>{success}</span>
              </div>
            )}
            {error && (
              <div className="bp-alert-error bp-mb-4">
                <AlertCircle className="bp-icon-md bp-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Configuration Form */}
            <form onSubmit={handleSubmit} className="bp-studio-form">
              {/* Brand Name Input */}
              <div className="bp-field-group">
                <label className="bp-field-label" htmlFor="brand-name-input">
                  Brand Name
                </label>
                <input
                  id="brand-name-input"
                  type="text"
                  placeholder="e.g. Acme Cloud, Vercel"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin || loading}
                  className="bp-input"
                  required
                />
              </div>

              {/* Monitored Keywords Tag-Chip Input Box */}
              <div className="bp-field-group">
                <label className="bp-field-label" htmlFor="brand-keywords-input">
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
                          aria-label={`Remove keyword ${chip}`}
                        >
                          <X className="bp-icon-xs" />
                        </button>
                      )}
                    </span>
                  ))}
                  <input
                    id="brand-keywords-input"
                    type="text"
                    placeholder={
                      keywordChips.length === 0 ? 'Type keyword and press Enter...' : 'Add keyword...'
                    }
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
                <label className="bp-field-label" htmlFor="brand-competitors-input">
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
                          aria-label={`Remove competitor ${comp}`}
                        >
                          <X className="bp-icon-xs" />
                        </button>
                      )}
                    </span>
                  ))}
                  <input
                    id="brand-competitors-input"
                    type="text"
                    placeholder={
                      competitorChips.length === 0
                        ? 'Type competitor and press Enter...'
                        : 'Add competitor...'
                    }
                    value={competitorInput}
                    onChange={(e) => setCompetitorInput(e.target.value)}
                    onKeyDown={handleCompetitorKeyDown}
                    disabled={!isAdmin || loading}
                    className="bp-tag-chip-input"
                  />
                </div>
              </div>

              {/* Active Listening Pipeline Toggle */}
              <div className="bp-field-group">
                <label className="bp-toggle-row" htmlFor="brand-active-toggle">
                  <input
                    id="brand-active-toggle"
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={!isAdmin || loading}
                    className="bp-toggle-checkbox"
                  />
                  <div>
                    <div className="bp-field-label bp-mb-0">Active Listening Pipeline</div>
                    <span className="bp-doc-subtext">
                      Enable ingestion polling for this brand
                    </span>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="bp-studio-actions-row bp-mt-4">
                {editingBrandId && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      resetForm();
                      setError(null);
                    }}
                    className="bp-btn-secondary"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!isAdmin || loading}
                  className="bp-btn-primary bp-btn-full"
                >
                  {loading
                    ? 'Saving...'
                    : editingBrandId
                    ? 'Save Changes →'
                    : 'Save & Start Listening →'}
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};
