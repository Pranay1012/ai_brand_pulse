import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  RefreshCw,
  Search,
  Sparkles,
  ExternalLink,
  Shield,
  UserCheck,
} from 'lucide-react';
import type { IssueCluster, Mention } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';
import { getDeterministicBars } from '../utils/metrics';

interface RadarViewProps {
  onNavigateToActions?: () => void;
}

function formatSourceLabel(source: string): string {
  const lower = (source || '').toLowerCase();
  if (lower.includes('hacker') || lower === 'hn') return 'HN';
  if (lower.includes('google')) return 'Google News';
  if (lower.includes('reddit')) return 'Reddit';
  if (lower === 'x' || lower.includes('twitter')) return 'X';
  return source || 'Web';
}

function buildMentionBuckets(mentions: Mention[], bucketCount = 12): { height: number; count: number }[] {
  if (mentions.length === 0) {
    return Array.from({ length: bucketCount }, () => ({ height: 14, count: 0 }));
  }

  const timestamps = mentions
    .map((m) => new Date(m.published_at || m.created_at || '').getTime())
    .filter((ts) => !Number.isNaN(ts));

  if (timestamps.length === 0) {
    return Array.from({ length: bucketCount }, () => ({ height: 14, count: 0 }));
  }

  const maxTs = Math.max(...timestamps);
  const rawMinTs = Math.min(...timestamps);
  const minTs = maxTs === rawMinTs ? maxTs - 24 * 60 * 60 * 1000 : rawMinTs;
  const span = Math.max(1, maxTs - minTs);

  const counts = new Array<number>(bucketCount).fill(0);
  for (const ts of timestamps) {
    const ratio = (ts - minTs) / span;
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)));
    counts[idx] += 1;
  }

  const maxCount = Math.max(1, ...counts);
  return counts.map((count) => ({
    count,
    height: count === 0 ? 14 : Math.max(20, Math.round((count / maxCount) * 100)),
  }));
}

export const RadarView: React.FC<RadarViewProps> = ({ onNavigateToActions }) => {
  const { selectedBrandId } = useAuth();
  const [clusters, setClusters] = useState<IssueCluster[]>([]);
  const [stats, setStats] = useState<{
    total_mentions: number;
    total_clusters: number;
    critical_clusters: number;
    avg_negative_ratio: number;
  } | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected cluster for right-hand persistent inspector
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [mentionsState, setMentionsState] = useState<{
    clusterId: string | null;
    items: Mention[];
    failed: boolean;
  }>({ clusterId: null, items: [], failed: false });

  const refreshDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterKey = `${statusFilter}:${selectedBrandId}`;
  const isInitialLoading = loadedKey !== filterKey;

  useEffect(() => {
    const controller = new AbortController();

    const runFetch = async () => {
      const startTime = Date.now();
      try {
        const [clusterData, statsData] = await Promise.all([
          api.clusters.list(
            {
              status: statusFilter === 'all' ? undefined : statusFilter,
              brand_id: selectedBrandId || undefined,
            },
            controller.signal,
          ),
          api.clusters
            .stats(
              {
                brand_id: selectedBrandId || undefined,
              },
              controller.signal,
            )
            .catch(() => null),
        ]);

        if (controller.signal.aborted) return;

        setClusters(clusterData);
        if (statsData) setStats(statsData);
        setError(null);
        setLastSynced(new Date());
        setLoadedKey(filterKey);

        if (clusterData.length === 0) {
          setSelectedClusterId(null);
        } else {
          setSelectedClusterId((prev) => {
            if (prev && clusterData.some((c) => c.id === prev)) return prev;
            const critical = clusterData.find((c) => (c.negative_ratio || 0) >= 0.6);
            return critical ? critical.id : clusterData[0].id;
          });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch clusters');
        setLoadedKey(filterKey);
      } finally {
        if (!controller.signal.aborted) {
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, 300 - elapsed);
          if (refreshDelayRef.current) clearTimeout(refreshDelayRef.current);
          refreshDelayRef.current = setTimeout(() => {
            setIsManualRefreshing(false);
          }, remaining);
        }
      }
    };

    void runFetch();
    const interval = setInterval(() => {
      void runFetch();
    }, 10000);

    return () => {
      controller.abort();
      clearInterval(interval);
      if (refreshDelayRef.current) {
        clearTimeout(refreshDelayRef.current);
        refreshDelayRef.current = null;
      }
    };
  }, [statusFilter, selectedBrandId, filterKey, refreshTick]);

  const handleManualRefresh = () => {
    setIsManualRefreshing(true);
    setRefreshTick((t) => t + 1);
  };

  // Filtered clusters by search term
  const filteredClusters = useMemo(() => {
    return clusters.filter((c) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        c.title.toLowerCase().includes(term) ||
        (c.brand_name && c.brand_name.toLowerCase().includes(term))
      );
    });
  }, [clusters, searchTerm]);

  // Selected cluster must come from the active filtered list
  const selectedCluster = useMemo(() => {
    if (filteredClusters.length === 0) return null;
    if (selectedClusterId) {
      const found = filteredClusters.find((c) => c.id === selectedClusterId);
      if (found) return found;
    }
    const critical = filteredClusters.find((c) => (c.negative_ratio || 0) >= 0.6);
    return critical || filteredClusters[0];
  }, [filteredClusters, selectedClusterId]);

  const activeClusterId = selectedCluster?.id ?? null;

  // Fetch mentions only when the selected cluster ID changes
  useEffect(() => {
    if (!activeClusterId) return;

    const controller = new AbortController();

    api.clusters
      .mentions(activeClusterId, controller.signal)
      .then((mentions) => {
        if (!controller.signal.aborted) {
          setMentionsState({ clusterId: activeClusterId, items: mentions, failed: false });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load cluster mentions:', err);
        setMentionsState({ clusterId: activeClusterId, items: [], failed: true });
      });

    return () => {
      controller.abort();
    };
  }, [activeClusterId]);

  const loadingMentions = Boolean(activeClusterId && mentionsState.clusterId !== activeClusterId);
  const clusterMentions = useMemo(
    () => (activeClusterId && mentionsState.clusterId === activeClusterId ? mentionsState.items : []),
    [activeClusterId, mentionsState],
  );
  const mentionsError = Boolean(
    activeClusterId && mentionsState.clusterId === activeClusterId && mentionsState.failed,
  );

  // Real metrics (never fall back to fake numbers)
  const totalMentions =
    stats?.total_mentions ?? clusters.reduce((acc, c) => acc + (c.mention_count || 0), 0);
  const activeClustersCount = stats?.total_clusters ?? clusters.length;
  const criticalClustersCount =
    stats?.critical_clusters ?? clusters.filter((c) => (c.negative_ratio || 0) >= 0.6).length;
  const avgNegativeRatio =
    stats?.avg_negative_ratio !== undefined
      ? stats.avg_negative_ratio * 100
      : clusters.length > 0
      ? (clusters.reduce((acc, c) => acc + (c.negative_ratio || 0), 0) / clusters.length) * 100
      : 0;

  const recentHourCount = useMemo(() => {
    const oneHourMs = 60 * 60 * 1000;
    const now = lastSynced ? lastSynced.getTime() : 0;
    if (!now) return 0;
    return clusters.filter((c) => {
      const ts = new Date(c.first_seen_at).getTime();
      return !Number.isNaN(ts) && now - ts <= oneHourMs;
    }).length;
  }, [clusters, lastSynced]);

  const displayTotalMentions = totalMentions.toLocaleString();
  const displayActiveClusters = activeClustersCount;
  const displayCriticalAlerts = criticalClustersCount;
  const displayAvgNegativeRatio = `${avgNegativeRatio.toFixed(1)}%`;

  const displayMentions = useMemo(
    () =>
      clusterMentions.slice(0, 4).map((m) => {
        const score = Number(m.sentiment_score ?? 0);
        const sentimentClass =
          m.sentiment_label === 'positive' || score >= 0.05
            ? 'positive'
            : m.sentiment_label === 'negative' || score <= -0.05
            ? 'negative'
            : 'neutral';
        return {
          id: m.id,
          source: formatSourceLabel(m.source),
          content: m.content || m.title,
          score,
          formattedScore: `${score > 0 ? '+' : ''}${score.toFixed(2)}`,
          sentimentClass,
          url: m.url,
        };
      }),
    [clusterMentions],
  );

  const activityBuckets = useMemo(
    () => buildMentionBuckets(clusterMentions, 12),
    [clusterMentions],
  );

  const selectedAvgSentiment = Number(selectedCluster?.avg_sentiment ?? 0);

  return (
    <div className="bp-view-shell">
      {/* Top 4 KPI Cards */}
      <section className="bp-kpi-row" aria-label="Key Performance Indicators">
        {/* KPI 1: Total Mentions */}
        <div className="bp-kpi-card">
          <div className="bp-kpi-content">
            <span className="bp-micro-label">TOTAL MENTIONS</span>
            <div className="bp-kpi-figure">{displayTotalMentions}</div>
            <span className="bp-kpi-subtext">Across all monitored feeds</span>
          </div>
          <div className="bp-kpi-histogram" aria-hidden="true">
            {getDeterministicBars('total_mentions', 10, 25, 95).map((h, i) => (
              <div
                key={i}
                className="bp-histogram-bar"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* KPI 2: Active Clusters */}
        <div className="bp-kpi-card">
          <div className="bp-kpi-content">
            <span className="bp-micro-label">ACTIVE CLUSTERS</span>
            <div className="bp-kpi-figure">{displayActiveClusters}</div>
            <span className="bp-kpi-subtext">{recentHourCount} surfaced this hour</span>
          </div>
          <div className="bp-kpi-histogram" aria-hidden="true">
            {getDeterministicBars('active_clusters', 10, 20, 90).map((h, i) => (
              <div
                key={i}
                className="bp-histogram-bar"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* KPI 3: Critical Alerts */}
        <div className="bp-kpi-card">
          <div className="bp-kpi-content">
            <span className="bp-micro-label">CRITICAL ALERTS</span>
            <div className="bp-kpi-figure">{displayCriticalAlerts}</div>
            <div className="bp-kpi-pill-slot">
              {criticalClustersCount > 0 ? (
                <span className="bp-pill-needs-attention">Needs attention</span>
              ) : (
                <span className="bp-pill-neutral">All clear</span>
              )}
            </div>
          </div>
          <div className="bp-kpi-histogram" aria-hidden="true">
            {getDeterministicBars('critical_alerts', 10, 15, 100).map((h, i) => (
              <div
                key={i}
                className="bp-histogram-bar"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* KPI 4: Avg Negative Ratio */}
        <div className="bp-kpi-card">
          <div className="bp-kpi-content">
            <span className="bp-micro-label">AVG NEGATIVE RATIO</span>
            <div className="bp-kpi-figure">{displayAvgNegativeRatio}</div>
            <span className="bp-kpi-subtext">VADER threshold &ge; 60%</span>
          </div>
          <div className="bp-kpi-histogram" aria-hidden="true">
            {getDeterministicBars('avg_negative', 10, 30, 85).map((h, i) => (
              <div
                key={i}
                className="bp-histogram-bar"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Filter Toolbar Sub-Header */}
      <section className="bp-radar-toolbar">
        {/* Status Pills */}
        <div className="bp-status-filter-pills" role="tablist">
          {[
            { id: 'open', label: 'Open' },
            { id: 'resolved', label: 'Resolved' },
            { id: 'archived', label: 'Archived' },
            { id: 'all', label: 'All Statuses' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.id}
              className={`bp-filter-pill-btn ${statusFilter === tab.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Refresh */}
        <div className="bp-toolbar-right">
          <div className="bp-search-input-box">
            <Search className="bp-icon-sm bp-text-muted" />
            <input
              type="text"
              placeholder="Search clusters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bp-search-input"
              aria-label="Search clusters"
            />
          </div>

          <span className="bp-sync-time">
            {lastSynced
              ? `Synced ${lastSynced.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}`
              : 'Syncing...'}
          </span>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="bp-icon-refresh-btn"
            title="Refresh clusters"
            aria-label="Refresh clusters"
          >
            <RefreshCw className={`bp-icon-sm ${isInitialLoading || isManualRefreshing ? 'bp-spin' : ''}`} />
          </button>
        </div>
      </section>

      {/* Error alert */}
      {error && (
        <div className="bp-alert-error bp-mb-4">
          <span>{error}</span>
        </div>
      )}

      {/* Main Split Layout: 65% Cluster Grid / 35% Cluster Signal Inspector */}
      <div className="bp-radar-split-workspace">
        {/* Left Column (65%): 2x2 Cluster Grid */}
        <div className="bp-radar-cluster-area">
          {isInitialLoading && clusters.length === 0 ? (
            <div className="bp-loading-well">
              <span className="bp-sync-spinner" />
              <span>Scanning pgvector clusters...</span>
            </div>
          ) : filteredClusters.length === 0 ? (
            <div className="bp-empty-well">
              <Sparkles className="bp-icon-xl bp-text-muted bp-mb-2" />
              <div className="bp-empty-title">No clusters found</div>
              <p className="bp-empty-desc">
                No active discussions match current filters. Ingest social posts to synthesize clusters.
              </p>
            </div>
          ) : (
            <div className="bp-cluster-2col-grid">
              {filteredClusters.map((cluster) => {
                const negRatio = (cluster.negative_ratio || 0) * 100;
                const isCritical = negRatio >= 60;
                const isSelected = selectedCluster?.id === cluster.id;

                return (
                  <article
                    key={cluster.id}
                    className={`bp-cluster-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedClusterId(cluster.id)}
                  >
                    {/* Top Row: Priority micro-label & Status Pill */}
                    <div className="bp-cluster-card-top">
                      <span className="bp-micro-label">
                        {isCritical ? 'HIGHEST PRIORITY' : 'ACTIVE CLUSTER'}
                      </span>
                      {isCritical ? (
                        <span className="bp-pill-needs-attention">Needs attention</span>
                      ) : (
                        <span className="bp-pill-neutral">{cluster.status}</span>
                      )}
                    </div>

                    {/* Cluster Title */}
                    <h3 className="bp-cluster-title" title={cluster.title}>
                      {cluster.title}
                    </h3>

                    {/* Multi-segment Horizontal Sentiment Meter */}
                    <div className="bp-sentiment-meter-track" aria-hidden="true">
                      {/* Negative Segment */}
                      <div
                        className="bp-sentiment-segment-neg"
                        style={{ width: `${Math.min(negRatio, 100)}%` }}
                      />
                      {/* Remainder Segment */}
                      <div
                        className="bp-sentiment-segment-secondary"
                        style={{ width: `${Math.max(0, Math.min(25, 100 - negRatio))}%` }}
                      />
                    </div>

                    {/* Subtitle with real brand, mention count & negative percentage */}
                    <p className="bp-cluster-caption">
                      {cluster.brand_name ? `${cluster.brand_name} \u2022 ` : ''}
                      {cluster.mention_count} mention{cluster.mention_count === 1 ? '' : 's'} &bull;{' '}
                      {Math.round(negRatio)}% negative
                    </p>

                    <div className="bp-card-divider" />

                    {/* Footer: Negative count badge & View Cluster link */}
                    <div className="bp-cluster-footer">
                      <span className="bp-pill-neutral">
                        {cluster.negative_count} negative
                      </span>

                      <button
                        type="button"
                        className="bp-view-cluster-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClusterId(cluster.id);
                        }}
                      >
                        <span>View cluster</span>
                        <span className="bp-arrow-glyph">↗</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (35%): CLUSTER SIGNAL INSPECTOR Drawer / Panel */}
        <aside className="bp-radar-inspector-col" aria-label="Cluster Signal Inspector">
          <div className="bp-inspector-card">
            {selectedCluster ? (
              <>
                {/* Header */}
                <div className="bp-inspector-header">
                  <div className="bp-inspector-header-left">
                    <span className="bp-micro-label">CLUSTER SIGNAL INSPECTOR</span>
                    <span className="bp-inspector-subcaption">avg VADER sentiment</span>
                  </div>
                  <div className="bp-similarity-score-pill">
                    VADER {selectedAvgSentiment >= 0 ? '+' : ''}
                    {selectedAvgSentiment.toFixed(2)}
                  </div>
                </div>

                <h3 className="bp-inspector-cluster-title">{selectedCluster.title}</h3>

                {/* Mention Activity Histogram */}
                <div className="bp-inspector-spike-section">
                  <div className="bp-spike-chart-label">Mention Activity (Recent)</div>
                  <div className="bp-spike-chart-bars" aria-hidden="true">
                    {activityBuckets.map((bucket, i) => (
                      <div
                        key={i}
                        className="bp-spike-bar"
                        style={{ height: `${bucket.height}%` }}
                        title={`Bucket ${i + 1}: ${bucket.count} mention${bucket.count === 1 ? '' : 's'}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Mentions Quoted Section */}
                <div className="bp-inspector-mentions-section">
                  <div className="bp-mentions-header-label">
                    {loadingMentions
                      ? 'Loading quoted mentions...'
                      : `${displayMentions.length} live quoted ${
                          displayMentions.length === 1 ? 'mention' : 'mentions'
                        }`}
                  </div>

                  {loadingMentions ? (
                    <div className="bp-mentions-loading">
                      <span className="bp-sync-spinner" />
                      <span>Loading quoted mentions...</span>
                    </div>
                  ) : displayMentions.length === 0 ? (
                    <div className="bp-inspector-empty">
                      <p>
                        {mentionsError
                          ? 'Unable to load mentions for this cluster.'
                          : 'No raw mentions recorded for this cluster yet.'}
                      </p>
                    </div>
                  ) : (
                    <div className="bp-mentions-list">
                      {displayMentions.map((mention) => (
                        <div key={mention.id} className="bp-quoted-complaint-card">
                          <div className="bp-complaint-content">
                            <span className="bp-complaint-source">{mention.source}:</span>{' '}
                            <span className="bp-complaint-text">{mention.content}</span>
                          </div>
                          <div className={`bp-complaint-score-pill ${mention.sentimentClass}`}>
                            {mention.formattedScore}
                          </div>
                          {mention.url && mention.url !== '#' && (
                            <a
                              href={mention.url}
                              target="_blank"
                              rel="noreferrer"
                              className="bp-complaint-external-link"
                              title="Open original discussion"
                              aria-label="Open original discussion"
                            >
                              <ExternalLink className="bp-icon-xs" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom CTA Action Button */}
                <div className="bp-inspector-cta-slot">
                  <button
                    type="button"
                    onClick={() => {
                      if (onNavigateToActions) {
                        onNavigateToActions();
                      }
                    }}
                    className="bp-btn-primary bp-btn-full"
                  >
                    Open Action Triage →
                  </button>
                </div>
              </>
            ) : (
              <div className="bp-inspector-empty">
                <Sparkles className="bp-icon-lg bp-text-muted bp-mb-2" />
                <p>Select any cluster to inspect sentiment signals and live quoted mentions.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Page Footer Tag Strip */}
      <footer className="bp-page-footer">
        <div className="bp-footer-tag">
          <Shield className="bp-icon-sm" />
          <span>WORKSPACE ACCESS CONTROLS</span>
        </div>
        <div className="bp-footer-tag">
          <UserCheck className="bp-icon-sm" />
          <span>HUMAN-REVIEWED TRIAGE</span>
        </div>
      </footer>
    </div>
  );
};
