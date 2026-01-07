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
