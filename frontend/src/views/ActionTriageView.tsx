import React, { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw,
  Edit2,
  Check,
  ChevronDown,
  X,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type { Action, JiraPayload, Mention } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/useAuth';

interface ActionTriageViewProps {
  onActionsChanged?: () => void;
}

type ActionTypeFilter = 'all' | Action['action_type'];

function formatActionType(actionType: Action['action_type']): string {
  switch (actionType) {
    case 'jira_ticket':
      return 'Jira Ticket';
    case 'pr_response':
      return 'PR Response';
    case 'sales_counter_hook':
      return 'Sales Counter Hook';
    default:
      return actionType;
  }
}

function getStatusBadgeMeta(status: Action['status']): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending Review', className: 'bp-pill-needs-attention' };
    case 'approved':
      return { label: 'Approved', className: 'bp-pill-neutral' };
    case 'executed':
      return { label: 'Executed', className: 'bp-pill-success' };
    case 'rejected':
      return { label: 'Rejected', className: 'bp-pill-neutral' };
  }
}

function formatSourceMeta(source: string): { label: string; iconClass: string; glyph: string } {
  const lower = (source || '').toLowerCase();
  if (lower.includes('hacker') || lower === 'hn') {
    return { label: 'Hacker News', iconClass: 'bp-source-icon-hn', glyph: 'H' };
  }
  if (lower.includes('google')) {
    return { label: 'Google News', iconClass: 'bp-source-icon-news', glyph: 'G' };
  }
  if (lower.includes('reddit')) {
    return { label: 'Reddit', iconClass: 'bp-source-icon-reddit', glyph: 'R' };
  }
  return { label: source || 'Web', iconClass: 'bp-source-icon-news', glyph: 'W' };
}

function formatDateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ActionTriageView: React.FC<ActionTriageViewProps> = ({ onActionsChanged }) => {
  const { role, selectedBrandId, setSelectedBrandId, brands } = useAuth();
  const [actions, setActions] = useState<Action[]>([]);
  const [loadedBrandKey, setLoadedBrandKey] = useState<string>('');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Filter bar states
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>('all');
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  // Inspector selection
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  // In-line editing of draft ticket
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<{ summary: string; description: string } | null>(
    null,
  );

  // Rejection dialog / inline state
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Linked cluster evidence mentions
  const [evidenceState, setEvidenceState] = useState<{
    clusterId: string | null;
    items: Mention[];
    failed: boolean;
  }>({ clusterId: null, items: [], failed: false });

  const canTriage = role === 'admin' || role === 'responder';
  const brandKey = selectedBrandId || 'all';
  const loading = loadedBrandKey !== brandKey || isManualRefreshing;

  useEffect(() => {
    const controller = new AbortController();

    const loadActions = async () => {
      try {
        const data = await api.actions.list(
          {
            brand_id: selectedBrandId || undefined,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setActions(data);
        setError(null);
        setLoadedBrandKey(brandKey);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load actions');
        setLoadedBrandKey(brandKey);
      } finally {
        if (!controller.signal.aborted) {
          setIsManualRefreshing(false);
        }
      }
    };

    void loadActions();

    return () => {
      controller.abort();
    };
  }, [selectedBrandId, brandKey, refreshTick]);

  const handleManualRefresh = () => {
    setIsManualRefreshing(true);
    setRefreshTick((t) => t + 1);
  };

  // Filter actions based on toolbar filters
  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (selectedBrandId && a.brand_id !== selectedBrandId) return false;
      if (actionTypeFilter !== 'all' && a.action_type !== actionTypeFilter) return false;
      if (needsAttentionOnly && a.status !== 'pending') return false;
      return true;
    });
  }, [actions, selectedBrandId, actionTypeFilter, needsAttentionOnly]);

  // Current selected action must come from filteredActions
  const currentAction = useMemo(() => {
    if (filteredActions.length === 0) return null;
    if (selectedActionId) {
      const found = filteredActions.find((a) => a.id === selectedActionId);
      if (found) return found;
    }
    return filteredActions[0];
  }, [filteredActions, selectedActionId]);

  const activeClusterId = currentAction?.cluster_id ?? null;

  useEffect(() => {
    if (!activeClusterId) return;

    const controller = new AbortController();

    api.clusters
      .mentions(activeClusterId, controller.signal)
      .then((mentions) => {
        if (!controller.signal.aborted) {
          setEvidenceState({ clusterId: activeClusterId, items: mentions, failed: false });
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load linked evidence mentions:', err);
        setEvidenceState({ clusterId: activeClusterId, items: [], failed: true });
      });

    return () => {
      controller.abort();
    };
  }, [activeClusterId]);

  const loadingEvidence = Boolean(activeClusterId && evidenceState.clusterId !== activeClusterId);
  const linkedMentions = useMemo(
    () =>
      activeClusterId && evidenceState.clusterId === activeClusterId
        ? evidenceState.items.slice(0, 4)
        : [],
    [activeClusterId, evidenceState],
  );
  const evidenceError = Boolean(
    activeClusterId && evidenceState.clusterId === activeClusterId && evidenceState.failed,
  );

  const payload = currentAction?.payload as JiraPayload | undefined;
  const payloadSummary = typeof payload?.summary === 'string' ? payload.summary : '';
  const payloadDescription = typeof payload?.description === 'string' ? payload.description : '';
  const currentSummary = editValues?.summary ?? (payloadSummary || currentAction?.cluster_title || '');
  const currentDescription =
    editValues?.description ?? (payloadDescription || currentAction?.rationale || '');

  const stepsToReproduce = Array.isArray(payload?.steps_to_reproduce)
    ? payload.steps_to_reproduce.map((step) => String(step))
    : [];
  const acceptanceCriteria = Array.isArray(payload?.acceptance_criteria)
    ? payload.acceptance_criteria.map((item) => String(item))
    : [];

  const resetInspectorInputs = () => {
    setIsEditing(false);
    setEditValues(null);
    setIsRejecting(false);
    setRejectReason('');
  };

  const handleSelectCard = (id: string) => {
    setSelectedActionId(id);
    resetInspectorInputs();
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
      const payloadToSend =
        isEditing && editValues
          ? {
              ...(currentAction.payload as JiraPayload),
              summary: editValues.summary,
              description: editValues.description,
            }
          : currentAction.payload;

      const updated = await api.actions.approve(currentAction.id, payloadToSend);
      setActions((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      setIsEditing(false);
      setEditValues(null);
      onActionsChanged?.();
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
      const updated = await api.actions.execute(currentAction.id);
      setActions((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      onActionsChanged?.();
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
      const updated = await api.actions.reject(currentAction.id, rejectReason.trim());
      setActions((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      setIsRejecting(false);
      setRejectReason('');
      setIsEditing(false);
      setEditValues(null);
      onActionsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingList = filteredActions.filter((a) => a.status === 'pending');
  const approvedList = filteredActions.filter((a) => a.status === 'approved');
  const executedList = filteredActions.filter((a) => a.status === 'executed');
  const rejectedList = filteredActions.filter((a) => a.status === 'rejected');

  const renderCard = (action: Action) => {
    const cardPayload = action.payload as JiraPayload;
    const isSelected = currentAction?.id === action.id;
    const priority =
      typeof cardPayload?.priority === 'string' && cardPayload.priority
        ? cardPayload.priority
        : 'Normal';
    const title =
      (typeof cardPayload?.summary === 'string' && cardPayload.summary) ||
      action.cluster_title ||
      'Synthesized Action';
    const statusMeta = getStatusBadgeMeta(action.status);
    const createdLabel = formatDateLabel(action.created_at);

    return (
      <article
        key={action.id}
        onClick={() => handleSelectCard(action.id)}
        className={`bp-kanban-item-card ${isSelected ? 'selected' : ''}`}
      >
        {/* Top micro-header */}
        <div className="bp-kanban-card-top">
          <span className="bp-micro-label">
            {formatActionType(action.action_type).toUpperCase()} &bull; {priority.toUpperCase()}
          </span>
          <span className={statusMeta.className}>{statusMeta.label}</span>
        </div>

        {/* Title */}
        <h4 className="bp-kanban-title" title={title}>
          {title}
        </h4>

        <div className="bp-kanban-mid-row">
          <span className="bp-kanban-mentions">
            {action.cluster_title || 'Linked issue cluster'}
          </span>
        </div>

        <div className="bp-card-divider" />

        {/* Footer row */}
        <div className="bp-kanban-card-bottom">
          <span className="bp-pill-neutral">{action.brand_name || 'Workspace'}</span>
          {createdLabel && <span className="bp-kanban-mentions">{createdLabel}</span>}
        </div>
      </article>
    );
  };

  const currentPriority =
    typeof payload?.priority === 'string' && payload.priority ? payload.priority : 'Normal';
  const currentStatusMeta = currentAction ? getStatusBadgeMeta(currentAction.status) : null;

  return (
    <div className="bp-view-shell">
      {/* Filter Pills Bar */}
      <section className="bp-triage-filter-bar">
        <div className="bp-filter-pill-group">
          {/* Brand Filter synced with AuthContext */}
          <div className="bp-select-pill-wrapper">
            <select
              value={selectedBrandId}
              onChange={(e) => {
                setSelectedBrandId(e.target.value);
                resetInspectorInputs();
              }}
              className="bp-filter-select-pill"
              aria-label="Filter actions by brand"
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

          {/* Action Type Filter */}
          <div className="bp-select-pill-wrapper">
            <select
              value={actionTypeFilter}
              onChange={(e) => {
                setActionTypeFilter(e.target.value as ActionTypeFilter);
                resetInspectorInputs();
              }}
              className="bp-filter-select-pill"
              aria-label="Filter actions by type"
            >
              <option value="all">All Action Types</option>
              <option value="jira_ticket">Jira Tickets</option>
              <option value="pr_response">PR Responses</option>
              <option value="sales_counter_hook">Sales Counter Hooks</option>
            </select>
            <ChevronDown className="bp-select-chevron" />
          </div>

          {/* Needs Attention Toggle */}
          <button
            type="button"
            className={`bp-filter-toggle-pill ${needsAttentionOnly ? 'active' : ''}`}
            onClick={() => {
              setNeedsAttentionOnly(!needsAttentionOnly);
              resetInspectorInputs();
            }}
          >
            Pending Only
          </button>

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
          onClick={handleManualRefresh}
          className="bp-icon-refresh-btn"
          title="Refresh actions"
          aria-label="Refresh actions"
        >
          <RefreshCw className={`bp-icon-sm ${loading ? 'bp-spin' : ''}`} />
        </button>
      </section>

      {/* Error alert */}
      {error && (
        <div className="bp-alert-error bp-mb-4">
          <AlertCircle className="bp-icon-md bp-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Split Layout: 60% Left Kanban Queue / 40% Right AI Action Inspector */}
      <div className="bp-triage-split-layout">
        {/* Left Kanban Columns (60%) */}
        <div className={`bp-kanban-board-area ${showRejected ? 'cols-4' : ''}`}>
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

        {/* Right AI Action Inspector (40%) */}
        <aside className="bp-triage-inspector-col" aria-label="Action Inspector">
          <div className="bp-action-inspector-card">
            {currentAction ? (
              <>
                {/* Micro-label & Badges Header */}
                <div className="bp-action-meta-bar">
                  <span className="bp-micro-label">AI ACTION INSPECTOR</span>
                </div>

                <div className="bp-action-badges-row">
                  <span className="bp-pill-neutral bp-font-semibold">
                    {formatActionType(currentAction.action_type)}
                  </span>
                  <span className="bp-pill-neutral bp-font-medium">
                    {currentPriority} Priority
                  </span>
                  {currentStatusMeta && (
                    <span className={currentStatusMeta.className}>{currentStatusMeta.label}</span>
                  )}
                </div>

                {/* Title with In-line Edit toggle (pending actions only) */}
                <div className="bp-action-title-row">
                  {isEditing ? (
                    <input
                      type="text"
                      className="bp-input bp-edit-title-input"
                      value={currentSummary}
                      aria-label="Action summary"
                      onChange={(e) =>
                        setEditValues({
                          summary: e.target.value,
                          description: currentDescription,
                        })
                      }
                    />
                  ) : (
                    <h3 className="bp-action-main-title">
                      {currentSummary || 'Untitled Action Draft'}
                    </h3>
                  )}

                  {canTriage && currentAction.status === 'pending' && (
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
                          <Check className="bp-icon-sm" />
                          <span>Save</span>
                        </>
                      ) : (
                        <>
                          <Edit2 className="bp-icon-sm" />
                          <span>Edit</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Structured Document Well */}
                <div className="bp-document-well">
                  {/* Description Section */}
                  <div className="bp-doc-section">
                    <h5 className="bp-doc-heading">Description</h5>
                    {isEditing ? (
                      <textarea
                        rows={4}
                        className="bp-input bp-doc-textarea"
                        value={currentDescription}
                        aria-label="Action description"
                        onChange={(e) =>
                          setEditValues({
                            summary: currentSummary,
                            description: e.target.value,
                          })
                        }
                      />
                    ) : (
                      <p className="bp-doc-paragraph">
                        {currentDescription || 'No description provided.'}
                      </p>
                    )}
                  </div>

                  {/* Rationale Section */}
                  {currentAction.rationale && (
                    <div className="bp-doc-section">
                      <h5 className="bp-doc-heading">Trigger Rationale</h5>
                      <p className="bp-doc-paragraph">{currentAction.rationale}</p>
                    </div>
                  )}

                  {/* Steps to Reproduce */}
                  {stepsToReproduce.length > 0 && (
                    <div className="bp-doc-section">
                      <h5 className="bp-doc-heading">Steps to Reproduce</h5>
                      <ul className="bp-doc-bullet-list">
                        {stepsToReproduce.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Acceptance Criteria */}
                  {acceptanceCriteria.length > 0 && (
                    <div className="bp-doc-section bp-mb-0">
                      <h5 className="bp-doc-heading">Acceptance Criteria</h5>
                      <ul className="bp-doc-bullet-list">
                        {acceptanceCriteria.map((criterion, idx) => (
                          <li key={idx}>{criterion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Linked Evidence Section */}
                <div className="bp-linked-evidence-section">
                  <h5 className="bp-evidence-heading">Linked evidence</h5>

                  {loadingEvidence ? (
                    <div className="bp-mentions-loading">
                      <span className="bp-sync-spinner" />
                      <span>Loading linked mentions...</span>
                    </div>
                  ) : linkedMentions.length === 0 ? (
                    <p className="bp-doc-subtext">
                      {evidenceError
                        ? 'Unable to load linked mentions for this cluster.'
                        : 'No linked mentions available for this cluster.'}
                    </p>
                  ) : (
                    linkedMentions.map((mention) => {
                      const src = formatSourceMeta(mention.source);
                      const score = Number(mention.sentiment_score ?? 0);
                      const formattedScore = `${score > 0 ? '+' : ''}${score.toFixed(2)}`;
                      const published = formatDateLabel(mention.published_at);

                      return (
                        <div key={mention.id} className="bp-evidence-item">
                          <div className="bp-evidence-source-row">
                            <span className={src.iconClass}>{src.glyph}</span>
                            <strong className="bp-evidence-source">{src.label}</strong>
                            {mention.author && (
                              <span className="bp-evidence-time">&bull; @{mention.author}</span>
                            )}
                            {published && (
                              <span className="bp-evidence-time">&bull; {published}</span>
                            )}
                            <span className="bp-evidence-score">{formattedScore}</span>
                            {mention.url && mention.url !== '#' && (
                              <a
                                href={mention.url}
                                target="_blank"
                                rel="noreferrer"
                                className="bp-complaint-external-link"
                                title="Open original mention"
                                aria-label="Open original mention"
                              >
                                <ExternalLink className="bp-icon-xs" />
                              </a>
                            )}
                          </div>
                          <p className="bp-evidence-quote">
                            &ldquo;{mention.content || mention.title}&rdquo;
                          </p>
                        </div>
                      );
                    })
                  )}
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
                        aria-label="Close rejection form"
                      >
                        <X className="bp-icon-sm" />
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
                        Approve &amp; Dispatch →
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
                        Execute Action →
                      </button>
                    </div>
                  ) : currentAction.status === 'executed' ? (
                    <div className="bp-status-executed-banner">
                      <Check className="bp-icon-md bp-text-success" />
                      <span>Action Executed</span>
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
                <p>Select any action from the Kanban columns to inspect and review.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
