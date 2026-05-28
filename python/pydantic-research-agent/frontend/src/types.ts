export interface AgentStatus {
  agent_id: string;
  created_at: string;
  query: string;
  report: string | null;
  status: string;
}

export interface SearchInfo {
  workflow_id: string;
  search_terms: string;
  status: string;
  completed: boolean;
}

export interface AgentStartRequest {
  query: string;
}

export interface ApprovalRequest {
  action: 'finish' | 'research_more';
  prompt?: string;
}
