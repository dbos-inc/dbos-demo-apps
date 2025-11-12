export interface AgentStatus {
  agent_id: string;
  created_at: string;
  topic: string;
  iterations: number;
  report: string | null;
  status: string;
}

export interface AgentStartRequest {
  topic: string;
}
