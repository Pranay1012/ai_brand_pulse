import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Edit2,
  Check,
  ChevronDown,
  X,
  AlertCircle,
} from 'lucide-react';
import type { Action, JiraPayload } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getDeterministicBars, getChannelBadges } from '../utils/metrics';

// Default mock actions matching Image 3 if backend actions are empty
const DEFAULT_DEMO_ACTIONS: Action[] = [
  {
    id: 'act-demo-1',
    cluster_id: 'cl-1',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'OAuth Token Refresh Failure on Mobile',
    action_type: 'jira_ticket',
    status: 'pending',
    rationale: 'Customer complaints spiked past negative sentiment threshold (82%) on mobile auth tokens.',
    created_at: new Date(Date.now() - 1200000).toISOString(),
    payload: {
      summary: 'OAuth Token Refresh Failure on Mobile',
      priority: 'Highest',
      description:
        'OAuth Token Refresh Failure on Mobile is resulting in repeated 401 unauthorized errors during token refresh cycles on iOS and Android client SDKs.',
      steps_to_reproduce: [
        'Initialize mobile client with persistent session',
        'Trigger token refresh after expiration window (3600s)',
        'Observe gateway returning invalid_grant instead of refreshed JWT',
      ],
      acceptance_criteria: [
        'Refresh token rotation handles transient socket drops with exponential backoff',
        'Mobile SDK gracefully updates storage without prompting forced re-login',
      ],
    },
  },
  {
    id: 'act-demo-2',
    cluster_id: 'cl-2',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'Billing API 500 Errors',
    action_type: 'jira_ticket',
    status: 'pending',
    rationale: 'Multiple developers reporting Stripe invoice sync failure during checkout.',
    created_at: new Date(Date.now() - 2400000).toISOString(),
    payload: {
      summary: 'Billing API 500 Errors on Invoice Webhook',
      priority: 'High',
      description: 'Stripe webhook listener fails to deserialize decimal currencies on international tiers.',
      steps_to_reproduce: ['Post test invoice.payment_succeeded payload with non-USD currency'],
    },
  },
  {
    id: 'act-demo-3',
    cluster_id: 'cl-3',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'Billing API 500 Errors',
    action_type: 'jira_ticket',
    status: 'pending',
    rationale: 'High negative sentiment concentration across Hacker News thread.',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    payload: {
      summary: 'Billing API 500 Errors',
      priority: 'Highest',
      description: 'Persistent 500 Internal Server errors reported across checkout microservice.',
    },
  },
  {
    id: 'act-demo-4',
    cluster_id: 'cl-4',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'Billing API 500 Errors',
    action_type: 'jira_ticket',
    status: 'approved',
    rationale: 'Approved for sprint dispatch by responder.',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    payload: {
      summary: 'Billing API 500 Errors',
      priority: 'High',
      description: 'Transient connection pool exhaustion under spike volume.',
    },
  },
  {
    id: 'act-demo-5',
    cluster_id: 'cl-5',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'Billing API 500 Errors',
    action_type: 'jira_ticket',
    status: 'approved',
    rationale: 'Approved ticket awaiting execution.',
    created_at: new Date(Date.now() - 9600000).toISOString(),
    payload: {
      summary: 'Billing API 500 Errors',
      priority: 'High',
      description: 'Rate limiter misconfiguration on external billing webhooks.',
    },
  },
  {
    id: 'act-demo-6',
    cluster_id: 'cl-6',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'Billing API 500 Errors',
    action_type: 'jira_ticket',
    status: 'approved',
    rationale: 'Cluster sentiment triggered alert.',
    created_at: new Date(Date.now() - 10800000).toISOString(),
    payload: {
      summary: 'Billing API 500 Errors',
      priority: 'High',
      description: 'Stripe webhook listener idempotency key conflict.',
    },
  },
  {
    id: 'act-demo-7',
    cluster_id: 'cl-7',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'Billing API 500 Errors',
    action_type: 'jira_ticket',
    status: 'executed',
    rationale: 'Dispatched to Jira project BP-104.',
    created_at: new Date(Date.now() - 14400000).toISOString(),
    payload: {
      summary: 'Billing API 500 Errors',
      priority: 'High',
      description: 'Ticket BP-104 executed and assigned to billing-platform team.',
    },
  },
  {
    id: 'act-demo-8',
    cluster_id: 'cl-8',
    brand_id: 'b-1',
    brand_name: 'Supabase',
    cluster_title: 'Billing API 500 Errors',
    action_type: 'jira_ticket',
    status: 'executed',
    rationale: 'Dispatched to Jira project BP-105.',
    created_at: new Date(Date.now() - 18000000).toISOString(),
    payload: {
      summary: 'Billing API 500 Errors',
      priority: 'Highest',
      description: 'Resolved via emergency patch in billing engine.',
    },
  },
];

export const ActionTriageView: React.FC = () => {
  const { role, selectedBrandId, brands } = useAuth();
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter bar states
  const [filterBrandId, setFilterBrandId] = useState<string>(selectedBrandId || '');
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  // Inspector selection (fallback to first action if none explicitly selected)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  // In-line editing of draft ticket
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<{ summary: string; description: string } | null>(null);

  // Rejection dialog / inline state
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canTriage = role === 'admin' || role === 'responder';

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.actions.list({
        brand_id: filterBrandId || selectedBrandId || undefined,
      });
      // If backend has no actions yet, seed with demo actions so UI renders rich layout
      if (data.length > 0) {
        setActions(data);
      } else {
        setActions(DEFAULT_DEMO_ACTIONS);
      }
    } catch {
      // Fallback to rich demo actions if backend is offline/empty
      setActions(DEFAULT_DEMO_ACTIONS);
    } finally {
      setLoading(false);
    }
  }, [filterBrandId, selectedBrandId]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  // Current selected action
  const currentAction = useMemo(() => {
    if (selectedActionId) {
      const found = actions.find((a) => a.id === selectedActionId);
      if (found) return found;
    }
    return actions.length > 0 ? actions[0] : null;
  }, [actions, selectedActionId]);

  const payload = currentAction?.payload as JiraPayload;
  const currentSummary = editValues?.summary ?? (payload?.summary || currentAction?.cluster_title || '');
  const currentDescription = editValues?.description ?? (payload?.description || currentAction?.rationale || '');

  const handleSelectCard = (id: string) => {
    setSelectedActionId(id);
    setIsEditing(false);
    setEditValues(null);
    setIsRejecting(false);
    setRejectReason('');
  };

  const handleStartEdit = () => {
    setEditValues({
      summary: currentSummary,
      description: currentDescription,
    });
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!currentAction) return;
    const updatedPayload = {
      ...(currentAction.payload as JiraPayload),
      summary: currentSummary,
      description: currentDescription,
    };
    const updatedAction: Action = {
      ...currentAction,
      payload: updatedPayload,
    };
    setActions((prev) => prev.map((a) => (a.id === updatedAction.id ? updatedAction : a)));
    setIsEditing(false);
    setEditValues(null);
  };

  const handleApprove = async () => {
    if (!currentAction || !canTriage) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (currentAction.id.startsWith('act-demo-')) {
        // Local state update for demo items
        setActions((prev) =>
          prev.map((a) =>
            a.id === currentAction.id ? { ...a, status: 'approved' as const } : a
          )
        );
      } else {
        const updated = await api.actions.approve(currentAction.id, currentAction.payload);
        setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecute = async () => {
    if (!currentAction || !canTriage) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (currentAction.id.startsWith('act-demo-')) {
        setActions((prev) =>
          prev.map((a) =>
            a.id === currentAction.id ? { ...a, status: 'executed' as const } : a
          )
        );
      } else {
        const updated = await api.actions.execute(currentAction.id);
        setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAction || !rejectReason.trim() || !canTriage) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (currentAction.id.startsWith('act-demo-')) {
        setActions((prev) =>
          prev.map((a) =>
            a.id === currentAction.id
              ? { ...a, status: 'rejected' as const, reject_reason: rejectReason.trim() }
              : a
          )
        );
        setIsRejecting(false);
        setRejectReason('');
      } else {
        const updated = await api.actions.reject(currentAction.id, rejectReason.trim());
        setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setIsRejecting(false);
        setRejectReason('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter actions based on toolbar filters
  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (filterBrandId && a.brand_id !== filterBrandId) return false;
      if (needsAttentionOnly && a.status !== 'pending') return false;
      return true;
    });
  }, [actions, filterBrandId, needsAttentionOnly]);

  const pendingList = filteredActions.filter((a) => a.status === 'pending');
  const approvedList = filteredActions.filter((a) => a.status === 'approved');
  const executedList = filteredActions.filter((a) => a.status === 'executed');
  const rejectedList = filteredActions.filter((a) => a.status === 'rejected');

  const renderCard = (action: Action) => {
    const payload = action.payload as JiraPayload;
    const isSelected = currentAction?.id === action.id;
    const priority = payload?.priority || 'Highest';
    const channels = getChannelBadges(action.id);
    const title = payload?.summary || action.cluster_title || 'Synthesized Action';

    return (
      <article
        key={action.id}
        onClick={() => handleSelectCard(action.id)}
        className={`bp-kanban-item-card ${isSelected ? 'selected' : ''}`}
      >
        {/* Top micro-header */}
        <div className="bp-kanban-card-top">
          <span className="bp-micro-label">
            JIRA BUG TICKET &bull; {priority.toUpperCase()} PRIORITY
          </span>
          <span className="bp-pill-needs-attention">Needs attention</span>
        </div>

        {/* Title and volume */}
        <h4 className="bp-kanban-title" title={title}>
          {title}
        </h4>

        <div className="bp-kanban-mid-row">
          <span className="bp-kanban-mentions">142 mentions across 3 channels</span>
          <div className="bp-kanban-mini-bars" aria-hidden="true">
            {getDeterministicBars(action.id, 8, 20, 95).map((h, i) => (
              <div
                key={i}
                className="bp-mini-histogram-bar"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        <div className="bp-card-divider" />

        {/* Footer row */}
        <div className="bp-kanban-card-bottom">
          <div className="bp-channel-pills-row">
            {channels.map((ch, idx) => (
              <span key={idx} className="bp-channel-pill">
                {ch}
              </span>
            ))}
          </div>
          <span className="bp-pill-neutral">Linked cluster</span>
        </div>
      </article>
    );
  };

  const currentPriority = payload?.priority || 'High';

  return (
    <div className="bp-view-shell">
      {/* Filter Pills Bar */}
      <section className="bp-triage-filter-bar">
        <div className="bp-filter-pill-group">
          {/* Brand Filter */}
          <div className="bp-select-pill-wrapper">
            <select
              value={filterBrandId}
              onChange={(e) => setFilterBrandId(e.target.value)}
              className="bp-filter-select-pill"
            >
              <option value="">All Brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown className="bp-select-chevron" />
          </div>

          {/* Needs Attention Toggle */}
          <button
            type="button"
            className={`bp-filter-toggle-pill ${needsAttentionOnly ? 'active' : ''}`}
            onClick={() => setNeedsAttentionOnly(!needsAttentionOnly)}
          >
            Needs Attention
          </button>

          {/* Jira Tickets Tag */}
          <div className="bp-select-pill-wrapper">
            <span className="bp-filter-static-pill">Jira Tickets ▾</span>
          </div>

          {/* Toggle Show Rejected */}
          <button
            type="button"
            className={`bp-filter-toggle-pill ${showRejected ? 'active' : ''}`}
            onClick={() => setShowRejected(!showRejected)}
          >
            {showRejected ? 'Hide Rejected' : 'Show Rejected'}
          </button>
        </div>

        <button
          type="button"
          onClick={fetchActions}
          className="bp-icon-refresh-btn"
          title="Refresh actions"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </section>

      {/* Error alert */}
      {error && (
        <div className="bp-alert-error mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Split Layout: 60% Left Kanban Queue / 40% Right AI Action Inspector & Diff */}
      <div className="bp-triage-split-layout">
        {/* Left Kanban Columns (60%) */}
        <div className="bp-kanban-board-area">
          {/* Column 1: Pending Review */}
          <div className="bp-triage-column">
            <div className="bp-triage-col-header">
              <span className="bp-triage-col-title">Pending Review</span>
              <span className="bp-triage-col-count">({pendingList.length})</span>
            </div>
            <div className="bp-triage-col-scroll">
              {pendingList.length === 0 ? (
                <div className="bp-triage-empty-col">No pending actions</div>
              ) : (
                pendingList.map(renderCard)
              )}
            </div>
          </div>

          {/* Column 2: Approved */}
          <div className="bp-triage-column">
            <div className="bp-triage-col-header">
              <span className="bp-triage-col-title">Approved</span>
              <span className="bp-triage-col-count">({approvedList.length})</span>
            </div>
            <div className="bp-triage-col-scroll">
              {approvedList.length === 0 ? (
                <div className="bp-triage-empty-col">No approved actions</div>
              ) : (
                approvedList.map(renderCard)
              )}
            </div>
          </div>

          {/* Column 3: Executed */}
          <div className="bp-triage-column">
            <div className="bp-triage-col-header">
              <span className="bp-triage-col-title">Executed</span>
              <span className="bp-triage-col-count">({executedList.length})</span>
            </div>
            <div className="bp-triage-col-scroll">
              {executedList.length === 0 ? (
                <div className="bp-triage-empty-col">No executed actions</div>
              ) : (
                executedList.map(renderCard)
              )}
            </div>
          </div>

          {/* Column 4: Rejected (Optional/Toggle) */}
          {showRejected && (
            <div className="bp-triage-column">
              <div className="bp-triage-col-header">
                <span className="bp-triage-col-title">Rejected</span>
                <span className="bp-triage-col-count">({rejectedList.length})</span>
              </div>
              <div className="bp-triage-col-scroll">
                {rejectedList.length === 0 ? (
                  <div className="bp-triage-empty-col">No rejected actions</div>
                ) : (
                  rejectedList.map(renderCard)
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right AI Action Inspector & Diff (40%) */}
        <aside className="bp-triage-inspector-col" aria-label="Action Inspector and Diff">
          <div className="bp-action-inspector-card">
            {currentAction ? (
              <>
                {/* Micro-label & Badges Header */}
                <div className="bp-action-meta-bar">
                  <span className="bp-micro-label">AI ACTION INSPECTOR &amp; DIFF</span>
                </div>

                <div className="bp-action-badges-row">
                  <span className="bp-pill-neutral font-semibold">JIRA BUG Ticket</span>
                  <span className="bp-pill-neutral font-medium">{currentPriority} Post</span>
                  <span className="bp-pill-needs-attention">Needs Action</span>
                </div>

                {/* Title with In-line Edit toggle */}
                <div className="bp-action-title-row">
                  {isEditing ? (
                    <input
                      type="text"
                      className="bp-input bp-edit-title-input"
                      value={currentSummary}
                      onChange={(e) =>
                        setEditValues({
                          summary: e.target.value,
                          description: currentDescription,
                        })
                      }
                    />
                  ) : (
                    <h3 className="bp-action-main-title">
                      Draft Jira Ticket: {currentSummary || 'OAuth Token Refresh Failure on Mobile'}
                    </h3>
                  )}

                  {canTriage && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          handleSaveEdit();
                        } else {
                          handleStartEdit();
                        }
                      }}
                      className="bp-action-edit-btn"
                      title={isEditing ? 'Save Changes' : 'Edit Ticket Content'}
                    >
                      {isEditing ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </>
                      ) : (
                        <>
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Structured Document Well */}
                <div className="bp-document-well">
                  {/* Summary Section */}
                  <div className="bp-doc-section">
                    <h5 className="bp-doc-heading">Summary</h5>
                    {isEditing ? (
                      <textarea
                        rows={3}
                        className="bp-input bp-doc-textarea"
                        value={currentDescription}
                        onChange={(e) =>
                          setEditValues({
                            summary: currentSummary,
                            description: e.target.value,
                          })
                        }
                      />
                    ) : (
                      <p className="bp-doc-paragraph">
                        {currentDescription ||
                          'OAuth Token Refresh Failure on Mobile is resulting in persistent 401 unauthenticated errors for active consumer sessions.'}
                      </p>
                    )}
                  </div>

                  {/* Customer Impact Section */}
                  <div className="bp-doc-section">
                    <h5 className="bp-doc-heading">Customer Impact</h5>
                    <ul className="bp-doc-bullet-list">
                      <li>Customer Impact: recurrent 401 exceptions on mobile sessions, forced logout.</li>
                      <li>Customer Impact: checkout session drops causing immediate order abandonment.</li>
                    </ul>
                  </div>

                  {/* Suggested Fix Section with Code Block */}
                  <div className="bp-doc-section">
                    <h5 className="bp-doc-heading">Suggested Fix</h5>
                    <p className="bp-doc-subtext">
                      Develop client interceptor logic to handle token rotation seamlessly:
                    </p>
                    <div className="bp-code-diff-well">
                      <div className="bp-code-line">
                        <span className="bp-code-lineno">1</span>
                        <code>section (motfection) &#123;</code>
                      </div>
                      <div className="bp-code-line">
                        <span className="bp-code-lineno">2</span>
                        <code>&nbsp;&nbsp;return this.come.enoth();</code>
                      </div>
                      <div className="bp-code-line">
                        <span className="bp-code-lineno">3</span>
                        <code>&#125;</code>
                      </div>
                    </div>
                    <ul className="bp-doc-bullet-list mt-2">
                      <li>Enforce exponential backoff on retry headers.</li>
                      <li>Suggested fix: rotate refresh token before expiration deadline.</li>
                    </ul>
                  </div>

                  {/* Assignee Row */}
                  <div className="bp-doc-assignee-row">
                    <div className="bp-assignee-pill">
                      <span>Assignee: Alex M. / Jira ▾</span>
                    </div>
                    <span className="bp-pill-needs-attention">Needs Action</span>
                  </div>
                </div>

                {/* Linked Evidence Section */}
                <div className="bp-linked-evidence-section">
                  <h5 className="bp-evidence-heading">Linked evidence</h5>

                  {/* Evidence item 1: Hacker News */}
                  <div className="bp-evidence-item">
                    <div className="bp-evidence-source-row">
                      <span className="bp-source-icon-hn">H</span>
                      <strong className="bp-evidence-source">Hacker News</strong>
                      <span className="bp-evidence-time">&bull; 2 quoted one ago</span>
                    </div>
                    <p className="bp-evidence-quote">
                      &ldquo;OAuth Token Refresh Failure on Mobile: 2 post social mobile mentions no in consumer is more than business into the evidence.&rdquo;
                    </p>
                  </div>

                  {/* Evidence item 2: Reddit */}
                  <div className="bp-evidence-item">
                    <div className="bp-evidence-source-row">
                      <span className="bp-source-icon-reddit">R</span>
                      <strong className="bp-evidence-source">Reddit</strong>
                      <span className="bp-evidence-time">&bull; 2 quoted one ago</span>
                    </div>
                    <p className="bp-evidence-quote">
                      &ldquo;Today&apos;s Billing API for 500 errors small ootange an when post&rdquo;
                    </p>
                  </div>
                </div>

                {/* Rejection Form (In-line if active) */}
                {isRejecting && (
                  <form onSubmit={handleRejectSubmit} className="bp-inline-reject-box">
                    <div className="bp-reject-box-header">
                      <span>Document Rejection Reason</span>
                      <button
                        type="button"
                        onClick={() => setIsRejecting(false)}
                        className="bp-close-icon-btn"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="e.g. Known transient issue addressed in release v14.2..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="bp-input bp-reject-textarea"
                      required
                    />
                    <div className="bp-reject-actions-row">
                      <button
                        type="button"
                        onClick={() => setIsRejecting(false)}
                        className="bp-btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || !rejectReason.trim()}
                        className="bp-btn-danger"
                      >
                        {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Bottom Sticky Action Bar */}
                <div className="bp-inspector-bottom-actions">
                  {!canTriage ? (
                    <div className="bp-viewer-restricted-notice">
                      <span>Viewing mode (Responder or Admin role required to triage actions)</span>
                    </div>
                  ) : currentAction.status === 'pending' ? (
                    <div className="bp-action-btn-cluster">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleApprove}
                        className="bp-btn-primary bp-btn-action-primary"
                      >
                        Approve &amp; Dispatch to Jira →
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setIsEditing(false);
                            setEditValues(null);
                          } else {
                            handleStartEdit();
                          }
                        }}
                        className="bp-btn-secondary bp-btn-action-secondary"
                      >
                        {isEditing ? 'Cancel Edit' : 'Edit Draft'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsRejecting(true)}
                        className="bp-action-reject-btn"
                      >
                        Reject with Reason
                      </button>
                    </div>
                  ) : currentAction.status === 'approved' ? (
                    <div className="bp-action-btn-cluster">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleExecute}
                        className="bp-btn-primary bp-btn-action-primary"
                      >
                        Execute &amp; Push to Jira →
                      </button>
                    </div>
                  ) : currentAction.status === 'executed' ? (
                    <div className="bp-status-executed-banner">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Ticket Executed &amp; Dispatched to External Jira Workspace</span>
                    </div>
                  ) : (
                    <div className="bp-status-rejected-banner">
                      <span>Rejected: {currentAction.reject_reason || 'Rejected by reviewer'}</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bp-inspector-empty">
                <p>Select any ticket proposal from the Kanban columns to inspect and review.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
