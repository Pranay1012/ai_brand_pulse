export type Role = 'admin' | 'responder' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export interface Workspace {
  id: string;
  name?: string;
  created_at?: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
  workspace: Workspace | null;
  role: Role | null;
}

export interface TrackedBrand {
  id: string;
  workspace_id?: string;
  name: string;
  keywords: string[];
  competitor_names: string[];
  is_active: boolean;
  created_at?: string;
}

export interface IssueCluster {
  id: string;
  brand_id: string;
  brand_name?: string;
  title: string;
  mention_count: number;
  negative_count: number;
  avg_sentiment: number;
  negative_ratio: number;
  status: 'open' | 'resolved' | 'archived';
  first_seen_at: string;
  last_seen_at: string;
  created_at?: string;
}

export interface Mention {
  id: string;
  brand_id: string;
  cluster_id?: string;
  source: string;
  external_id: string;
  url: string;
  author: string;
  title: string;
  content: string;
  content_hash: string;
  published_at: string;
  sentiment_score: number;
  sentiment_label: 'negative' | 'neutral' | 'positive';
  created_at?: string;
}

export interface JiraPayload {
  summary: string;
  description: string;
  priority: string;
  steps_to_reproduce?: string[];
  acceptance_criteria?: string[];
}

export interface Action {
  id: string;
  cluster_id: string;
  brand_id: string;
  brand_name?: string;
  cluster_title?: string;
  mention_count?: number;
  negative_count?: number;
  avg_sentiment?: number;
  action_type: 'jira_ticket' | 'pr_response' | 'sales_counter_hook';
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  payload: JiraPayload | Record<string, unknown>;
  rationale: string;
  reviewed_by?: string;
  reject_reason?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface ClusterDetail extends IssueCluster {
  mentions: Mention[];
  actions: Action[];
}

