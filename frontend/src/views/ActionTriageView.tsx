import React, { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle,
  XCircle,
  Play,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Tag,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { Action, JiraPayload } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const ActionTriageView: React.FC = () => {
  const { role, selectedBrandId } = useAuth();
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded cards for payload details
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Reject dialog state
  const [rejectingAction, setRejectingAction] = useState<Action | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canTriage = role === 'admin' || role === 'responder';

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.actions.list({
        brand_id: selectedBrandId || undefined,
      });
      setActions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch actions');
    } finally {
      setLoading(false);
    }
  }, [selectedBrandId]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleApprove = async (action: Action) => {
    if (!canTriage) return;
    setIsSubmitting(true);
    try {
      const updated = await api.actions.approve(action.id);
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecute = async (action: Action) => {
    if (!canTriage) return;
    setIsSubmitting(true);
    try {
      const updated = await api.actions.execute(action.id);
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingAction || !rejectReason.trim()) return;

    setIsSubmitting(true);
    try {
      const updated = await api.actions.reject(rejectingAction.id, rejectReason.trim());
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setRejectingAction(null);
      setRejectReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingActions = actions.filter((a) => a.status === 'pending');
  const approvedActions = actions.filter((a) => a.status === 'approved');
  const executedActions = actions.filter((a) => a.status === 'executed');
  const rejectedActions = actions.filter((a) => a.status === 'rejected');

  const renderActionCard = (action: Action) => {
    const payload = action.payload as JiraPayload;
    const isExpanded = expandedCardId === action.id;

    return (
      <div key={action.id} className="bp-kanban-card">
        <div className="bp-kanban-card-header">
          <span className="bp-brand-chip">{action.brand_name || 'Brand'}</span>
          <span
            className={`bp-priority-badge ${
              payload?.priority?.toLowerCase() === 'high' || payload?.priority?.toLowerCase() === 'urgent'
                ? 'priority-high'
                : 'priority-normal'
            }`}
          >
            {payload?.priority || 'Normal'}
          </span>
        </div>

        <h4 className="bp-kanban-card-title">
          {payload?.summary || action.cluster_title || 'Synthesized Action'}
        </h4>

        {action.cluster_title && (
          <div className="bp-card-cluster-ref">
            <Tag className="w-3.5 h-3.5 text-indigo-400" />
            <span>Cluster: {action.cluster_title}</span>
          </div>
        )}

        <div className="bp-card-rationale">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>{action.rationale}</span>
        </div>

        {/* Expandable Jira Details */}
        {isExpanded && (
          <div className="bp-card-details">
            {payload?.description && (
              <div className="bp-detail-section">
                <div className="bp-section-label">Description:</div>
                <p className="bp-section-text">{payload.description}</p>
              </div>
            )}

            {payload?.steps_to_reproduce && payload.steps_to_reproduce.length > 0 && (
              <div className="bp-detail-section">
                <div className="bp-section-label">Steps to Reproduce:</div>
                <ul className="bp-detail-list">
                  {payload.steps_to_reproduce.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
              </div>
            )}

            {payload?.acceptance_criteria && payload.acceptance_criteria.length > 0 && (
              <div className="bp-detail-section">
                <div className="bp-section-label">Acceptance Criteria:</div>
                <ul className="bp-detail-list">
                  {payload.acceptance_criteria.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {action.reject_reason && (
              <div className="bp-reject-note">
                <strong>Rejection Reason:</strong> {action.reject_reason}
              </div>
            )}
          </div>
        )}

        {/* Card Toggle Details Button */}
        <button
          onClick={() => setExpandedCardId(isExpanded ? null : action.id)}
          className="bp-expand-btn"
        >
          <span>{isExpanded ? 'Hide Ticket Schema' : 'View Full Jira Ticket'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Card Footer & Action Buttons */}
        <div className="bp-kanban-card-footer">
          <div className="bp-card-date">
            <Clock className="w-3 h-3" />
            <span>{new Date(action.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="bp-card-actions">
            {action.status === 'pending' && (
              <>
                <button
                  disabled={!canTriage || isSubmitting}
                  onClick={() => setRejectingAction(action)}
                  className="bp-btn-reject"
                  title={!canTriage ? 'Requires responder or admin role' : 'Reject Action'}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                <button
                  disabled={!canTriage || isSubmitting}
                  onClick={() => handleApprove(action)}
                  className="bp-btn-approve"
                  title={!canTriage ? 'Requires responder or admin role' : 'Approve Jira Ticket'}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Approve</span>
                </button>
              </>
            )}

            {action.status === 'approved' && (
              <button
                disabled={!canTriage || isSubmitting}
                onClick={() => handleExecute(action)}
                className="bp-btn-execute"
                title={!canTriage ? 'Requires responder or admin role' : 'Push to Jira / Execute'}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Execute Ticket</span>
              </button>
            )}

            {action.status === 'executed' && (
              <span className="bp-tag-executed">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Executed</span>
              </span>
            )}

            {action.status === 'rejected' && (
              <span className="bp-tag-rejected">
                <XCircle className="w-3.5 h-3.5" />
                <span>Rejected</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bp-view-container">
      {/* Top Header */}
      <div className="bp-view-header">
        <div>
          <h2 className="bp-view-title">Autonomous Action Triage</h2>
          <p className="bp-view-desc">
            LLM-drafted Jira tickets triggered when cluster complaints cross negative volume thresholds.
          </p>
        </div>

        <button onClick={fetchActions} className="bp-btn-secondary" title="Refresh Actions">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="bp-alert-error mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Kanban Board Columns */}
      <div className="bp-kanban-board">
        {/* 1. Pending Column */}
        <div className="bp-kanban-column">
          <div className="bp-kanban-column-header border-amber-500/30">
            <div className="bp-column-title">
              <span className="bp-dot-pending" />
              <span>Pending Review</span>
            </div>
            <span className="bp-column-counter">{pendingActions.length}</span>
          </div>

          <div className="bp-kanban-column-content">
            {pendingActions.length === 0 ? (
              <div className="bp-kanban-empty">No pending actions</div>
            ) : (
              pendingActions.map(renderActionCard)
            )}
          </div>
        </div>

        {/* 2. Approved Column */}
        <div className="bp-kanban-column">
          <div className="bp-kanban-column-header border-emerald-500/30">
            <div className="bp-column-title">
              <span className="bp-dot-approved" />
              <span>Approved</span>
            </div>
            <span className="bp-column-counter">{approvedActions.length}</span>
          </div>

          <div className="bp-kanban-column-content">
            {approvedActions.length === 0 ? (
              <div className="bp-kanban-empty">No approved actions</div>
            ) : (
              approvedActions.map(renderActionCard)
            )}
          </div>
        </div>

        {/* 3. Executed Column */}
        <div className="bp-kanban-column">
          <div className="bp-kanban-column-header border-blue-500/30">
            <div className="bp-column-title">
              <span className="bp-dot-executed" />
              <span>Executed</span>
            </div>
            <span className="bp-column-counter">{executedActions.length}</span>
          </div>

          <div className="bp-kanban-column-content">
            {executedActions.length === 0 ? (
              <div className="bp-kanban-empty">No executed actions</div>
            ) : (
              executedActions.map(renderActionCard)
            )}
          </div>
        </div>

        {/* 4. Rejected Column */}
        <div className="bp-kanban-column">
          <div className="bp-kanban-column-header border-rose-500/30">
            <div className="bp-column-title">
              <span className="bp-dot-rejected" />
              <span>Rejected</span>
            </div>
            <span className="bp-column-counter">{rejectedActions.length}</span>
          </div>

          <div className="bp-kanban-column-content">
            {rejectedActions.length === 0 ? (
              <div className="bp-kanban-empty">No rejected actions</div>
            ) : (
              rejectedActions.map(renderActionCard)
            )}
          </div>
        </div>
      </div>

      {/* Reject Reason Modal */}
      {rejectingAction && (
        <div className="bp-modal-overlay">
          <div className="bp-modal-card bp-reject-modal">
            <h3 className="bp-modal-title">Reject Action Proposal</h3>
            <p className="bp-modal-desc">
              Please document why this draft ticket is being rejected. This feedback helps improve future synthesis.
            </p>

            <form onSubmit={handleRejectSubmit}>
              <div className="bp-input-group mt-4">
                <label>Rejection Reason</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Transient network issue already mitigated in hotfix 14.2..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="bp-textarea"
                  required
                />
              </div>

              <div className="bp-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingAction(null);
                    setRejectReason('');
                  }}
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
          </div>
        </div>
      )}
    </div>
  );
};
