import React, { useState } from 'react';
import { Tag, Plus, CheckCircle, AlertCircle, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export const BrandsView: React.FC = () => {
  const { brands, refreshBrands, role } = useAuth();
  const [name, setName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const keywordList = keywords
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      const competitorList = competitors
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      if (keywordList.length === 0) {
        throw new Error('At least one keyword is required');
      }

      await api.brands.create({
        name: name.trim(),
        keywords: keywordList,
        competitor_names: competitorList,
      });

      setSuccess(`Brand "${name}" registered successfully!`);
      setName('');
      setKeywords('');
      setCompetitors('');
      await refreshBrands();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create brand');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bp-view-container">
      <div className="bp-view-header">
        <div>
          <h2 className="bp-view-title">Tracked Brands & Keywords</h2>
          <p className="bp-view-desc">
            Configure brands and keywords monitored by the background ingestion worker.
          </p>
        </div>
      </div>

      <div className="bp-brands-layout">
        {/* Left: Active Brands List */}
        <div className="bp-brands-list-card">
          <h3 className="bp-card-heading">
            <Tag className="w-5 h-5 text-indigo-400" />
            <span>Active Monitored Brands ({brands.length})</span>
          </h3>

          <div className="bp-brands-grid">
            {brands.map((b) => (
              <div key={b.id} className="bp-brand-item-card">
                <div className="bp-brand-item-top">
                  <h4 className="bp-brand-item-name">{b.name}</h4>
                  <span className="bp-brand-active-badge">
                    <span className="bp-status-dot-active" />
                    <span>Active</span>
                  </span>
                </div>

                <div className="bp-brand-tags-section">
                  <div className="bp-tag-label">Monitored Keywords:</div>
                  <div className="bp-chip-cloud">
                    {b.keywords.map((kw, i) => (
                      <span key={i} className="bp-chip-keyword">
                        #{kw}
                      </span>
                    ))}
                  </div>
                </div>

                {b.competitor_names && b.competitor_names.length > 0 && (
                  <div className="bp-brand-tags-section mt-3">
                    <div className="bp-tag-label">Competitors:</div>
                    <div className="bp-chip-cloud">
                      {b.competitor_names.map((comp, i) => (
                        <span key={i} className="bp-chip-competitor">
                          vs {comp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Add Brand Form */}
        <div className="bp-add-brand-card">
          <h3 className="bp-card-heading">
            <Plus className="w-5 h-5 text-emerald-400" />
            <span>Add Tracked Brand</span>
          </h3>

          {!isAdmin && (
            <div className="bp-alert-warning mb-4">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>Only workspace administrators can add tracked brands.</span>
            </div>
          )}

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

          <form onSubmit={handleAddBrand} className="bp-add-brand-form">
            <div className="bp-input-group">
              <label>Brand Name</label>
              <input
                type="text"
                placeholder="e.g. Supabase, Prisma, Stripe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin || loading}
                required
              />
            </div>

            <div className="bp-input-group">
              <label>Keywords (comma separated)</label>
              <input
                type="text"
                placeholder="supabase, postgres, auth"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={!isAdmin || loading}
                required
              />
              <span className="bp-field-hint">
                These terms will be queried against Hacker News and Google News.
              </span>
            </div>

            <div className="bp-input-group">
              <label>Competitors (optional, comma separated)</label>
              <input
                type="text"
                placeholder="Firebase, PlanetScale"
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
                disabled={!isAdmin || loading}
              />
            </div>

            <button
              type="submit"
              disabled={!isAdmin || loading}
              className="bp-btn-primary w-full mt-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? 'Registering...' : 'Add Brand to Listening Pipeline'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

