import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  TrendingDown,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import type { IssueCluster, Mention } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const RadarView: React.FC = () => {
  const { selectedBrandId } = useAuth();
  const [clusters, setClusters] = useState<IssueCluster[]>([]);
  const [stats, setStats] = useState<{
    total_mentions: number;
    total_clusters: number;
    critical_clusters: number;
    avg_negative_ratio: number;
  } | null>(null);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected cluster for detail drawer/modal
  const [selectedCluster, setSelectedCluster] = useState<IssueCluster | null>(null);
  const [clusterMentions, setClusterMentions] = useState<Mention[]>([]);
  const [loadingMentions, setLoadingMentions] = useState(false);

  const fetchClusters = useCallback(async (isManual = false) => {
    setLoading(true);
    setError(null);
    const startTime = Date.now();
    try {
      const [clusterData, statsData] = await Promise.all([
        api.clusters.list({
          status: statusFilter === 'all' ? undefined : statusFilter,
          brand_id: selectedBrandId || undefined,
        }),
        api.clusters.stats({
          brand_id: selectedBrandId || undefined,
        }).catch(() => null),
      ]);
      setClusters(clusterData);
      if (statsData) setStats(statsData);
      setLastSynced(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch clusters');
    } finally {
      if (isManual) {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, 400 - elapsed);
        setTimeout(() => setLoading(false), delay);
      } else {
        setLoading(false);
      }
    }
  }, [statusFilter, selectedBrandId]);

  useEffect(() => {
    fetchClusters(false);
    // Auto-refresh every 10 seconds to catch new background mentions in real-time
    const interval = setInterval(() => {
      fetchClusters(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchClusters]);

  const openClusterDetails = async (cluster: IssueCluster) => {
    setSelectedCluster(cluster);
    setLoadingMentions(true);
    try {
      const mentions = await api.clusters.mentions(cluster.id);
      setClusterMentions(mentions);
    } catch (err) {
      console.error('Failed to load cluster mentions:', err);
    } finally {
      setLoadingMentions(false);
    }
  };

  const closeClusterDetails = () => {
    setSelectedCluster(null);
    setClusterMentions([]);
  };

  // Filtered clusters
  const filteredClusters = clusters.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.title.toLowerCase().includes(term) ||
      (c.brand_name && c.brand_name.toLowerCase().includes(term))
    );
  });

  // Calculate metrics accurately from stats API if available, fallback to clusters list
  const totalMentions = stats?.total_mentions ?? clusters.reduce((acc, c) => acc + (c.mention_count || 0), 0);
  const activeClustersCount = stats?.total_clusters ?? clusters.length;
  const criticalClustersCount = stats?.critical_clusters ?? clusters.filter((c) => (c.negative_ratio || 0) >= 0.6).length;
  const avgNegativeRatio =
    stats?.avg_negative_ratio !== undefined
      ? stats.avg_negative_ratio * 100
      : clusters.length > 0
        ? (clusters.reduce((acc, c) => acc + (c.negative_ratio || 0), 0) / clusters.length) * 100
        : 0;

  return (
    <div className="bp-view-container">
      {/* KPI Overview Strip */}
      <div className="bp-kpi-grid">
        <div className="bp-kpi-card">
          <div className="bp-kpi-header">
            <span className="bp-kpi-label">Total Ingested Mentions</span>
            <Activity className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="bp-kpi-value">{totalMentions}</div>
          <div className="bp-kpi-sub">Across all monitored feeds</div>
        </div>

        <div className="bp-kpi-card">
          <div className="bp-kpi-header">
            <span className="bp-kpi-label">Active Issue Clusters</span>
            <MessageSquare className="w-5 h-5 text-blue-400" />
          </div>
          <div className="bp-kpi-value">{activeClustersCount}</div>
          <div className="bp-kpi-sub">Synthesized via pgvector similarity</div>
        </div>

        <div className="bp-kpi-card">
          <div className="bp-kpi-header">
            <span className="bp-kpi-label">Critical Trigger Clusters</span>
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="bp-kpi-value text-rose-400">{criticalClustersCount}</div>
          <div className="bp-kpi-sub">&ge; 60% negative ratio threshold</div>
        </div>

        <div className="bp-kpi-card">
          <div className="bp-kpi-header">
            <span className="bp-kpi-label">Avg Negative Ratio</span>
            <TrendingDown className="w-5 h-5 text-amber-400" />
          </div>
          <div className="bp-kpi-value text-amber-400">{avgNegativeRatio.toFixed(1)}%</div>
          <div className="bp-kpi-sub">VADER sentiment distribution</div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="bp-toolbar">
        <div className="bp-search-input-wrapper">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search clusters by title or brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bp-filter-group">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bp-select"
          >
            <option value="open">Open Clusters</option>
            <option value="resolved">Resolved</option>
            <option value="archived">Archived</option>
            <option value="all">All Statuses</option>
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono hidden sm:inline" title="Last background sync">
              Synced {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <button onClick={() => fetchClusters(true)} className="bp-btn-secondary" title="Refresh Now">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <div className="bp-alert-error mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Clusters List */}
      {loading && clusters.length === 0 ? (
        <div className="bp-loading-state">
          <Activity className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
          <span>Scanning issue clusters from pgvector...</span>
        </div>
      ) : filteredClusters.length === 0 ? (
        <div className="bp-empty-state">
          <Sparkles className="w-12 h-12 text-slate-500 mb-2" />
          <div className="bp-empty-title">No Issue Clusters Found</div>
          <p className="bp-empty-desc">
            No discussions matching the filter criteria. Run the ingestion worker to ingest mentions.
          </p>
        </div>
      ) : (
        <div className="bp-cluster-grid">
          {filteredClusters.map((cluster) => {
            const negRatio = (cluster.negative_ratio || 0) * 100;
            const isCritical = negRatio >= 60;

            return (
              <div
                key={cluster.id}
                onClick={() => openClusterDetails(cluster)}
                className={`bp-cluster-card ${isCritical ? 'critical' : ''}`}
              >
                <div className="bp-cluster-header">
                  <span className="bp-brand-chip">{cluster.brand_name || 'Brand'}</span>
                  <span
                    className={`bp-status-chip ${
                      cluster.status === 'open' ? 'status-open' : 'status-resolved'
                    }`}
                  >
                    {cluster.status}
                  </span>
                </div>

                <h3 className="bp-cluster-title">{cluster.title}</h3>

                {/* Sentiment Severity Meter */}
                <div className="bp-sentiment-meter-group">
                  <div className="bp-sentiment-meta">
                    <span className="bp-sentiment-label">Negative Sentiment:</span>
                    <span className={`bp-sentiment-pct ${isCritical ? 'text-rose-400' : 'text-slate-300'}`}>
                      {negRatio.toFixed(0)}%
                    </span>
                  </div>
                  <div className="bp-progress-bar-bg">
                    <div
                      className={`bp-progress-bar-fill ${
                        negRatio >= 60
                          ? 'bg-rose-500'
                          : negRatio >= 30
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(negRatio, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Metrics Footer */}
                <div className="bp-cluster-footer">
                  <div className="bp-cluster-stat">
                    <span>Volume:</span>
                    <strong>{cluster.mention_count} posts</strong>
                    <span className="text-rose-400">({cluster.negative_count} neg)</span>
                  </div>

                  <div className="bp-cluster-stat">
                    <span>Avg Sentiment:</span>
                    <strong className={cluster.avg_sentiment < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                      {cluster.avg_sentiment.toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cluster Mentions Detail Modal */}
      {selectedCluster && (
        <div className="bp-modal-overlay">
          <div className="bp-modal-card bp-cluster-modal">
            <div className="bp-modal-header">
              <div>
                <div className="bp-modal-category">
                  Cluster Details &bull; {selectedCluster.brand_name}
                </div>
                <h2 className="bp-modal-title">{selectedCluster.title}</h2>
              </div>
              <button onClick={closeClusterDetails} className="bp-modal-close-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bp-modal-body">
              {/* Cluster Stats Summary */}
              <div className="bp-detail-metrics">
                <div>
                  <span className="bp-meta-label">Total Posts:</span>
                  <strong>{selectedCluster.mention_count}</strong>
                </div>
                <div>
                  <span className="bp-meta-label">Negative Posts:</span>
                  <strong className="text-rose-400">{selectedCluster.negative_count}</strong>
                </div>
                <div>
                  <span className="bp-meta-label">Negative Ratio:</span>
                  <strong className="text-amber-400">
                    {((selectedCluster.negative_ratio || 0) * 100).toFixed(1)}%
                  </strong>
                </div>
                <div>
                  <span className="bp-meta-label">First Seen:</span>
                  <span>{new Date(selectedCluster.first_seen_at).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="bp-meta-label">Last Seen:</span>
                  <span>{new Date(selectedCluster.last_seen_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Mentions Feed */}
              <h4 className="bp-subheading">
                Associated Mentions ({clusterMentions.length})
              </h4>

              {loadingMentions ? (
                <div className="bp-loading-box">
                  <Activity className="w-5 h-5 animate-spin text-indigo-400" />
                  <span>Loading raw social mentions...</span>
                </div>
              ) : clusterMentions.length === 0 ? (
                <div className="bp-empty-box">No raw mentions found for this cluster.</div>
              ) : (
                <div className="bp-mentions-feed">
                  {clusterMentions.map((mention) => {
                    const isNeg = mention.sentiment_label === 'negative';
                    const isPos = mention.sentiment_label === 'positive';

                    return (
                      <div key={mention.id} className="bp-mention-item">
                        <div className="bp-mention-top">
                          <div className="bp-mention-source-badge">
                            {mention.source.replace('_', ' ').toUpperCase()}
                          </div>
                          <span
                            className={`bp-sentiment-badge ${
                              isNeg
                                ? 'badge-negative'
                                : isPos
                                ? 'badge-positive'
                                : 'badge-neutral'
                            }`}
                          >
                            {mention.sentiment_label} ({mention.sentiment_score.toFixed(2)})
                          </span>
                          <span className="bp-mention-date">
                            {mention.published_at
                              ? new Date(mention.published_at).toLocaleString()
                              : 'Recent'}
                          </span>
                        </div>

                        {mention.title && (
                          <div className="bp-mention-title">{mention.title}</div>
                        )}

                        <div className="bp-mention-content">{mention.content}</div>

                        <div className="bp-mention-bottom">
                          <span className="bp-mention-author">
                            Author: {mention.author || 'Anonymous'}
                          </span>
                          {mention.url && (
                            <a
                              href={mention.url}
                              target="_blank"
                              rel="noreferrer"
                              className="bp-mention-link"
                            >
                              <span>View Discussion</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bp-modal-footer">
              <button onClick={closeClusterDetails} className="bp-btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
