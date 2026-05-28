export interface AgentStatus {
  agent_id: string;
  created_at: string;
  query: string;
  report: string | null;
  status: string;
}

export interface AgentStartRequest {
  query: string;
}

export interface ApprovalRequest {
  action: 'finish' | 'research_more';
  prompt?: string;
}
