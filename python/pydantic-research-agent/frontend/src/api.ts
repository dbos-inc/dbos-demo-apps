import type { AgentStatus, AgentStartRequest, ApprovalRequest } from './types';

const API_BASE = 'http://localhost:8000';

export async function startAgent(query: string): Promise<void> {
  const response = await fetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query } as AgentStartRequest),
  });

  if (!response.ok) {
    throw new Error('Failed to start agent');
  }
}

export async function listAgents(): Promise<AgentStatus[]> {
  const response = await fetch(`${API_BASE}/agents`);

  if (!response.ok) {
    throw new Error('Failed to fetch agents');
  }

  return response.json();
}

async function sendApproval(agentId: string, body: ApprovalRequest): Promise<void> {
  const response = await fetch(`${API_BASE}/agents/${agentId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Failed to send approval');
  }
}

export async function finishAgent(agentId: string): Promise<void> {
  return sendApproval(agentId, { action: 'finish' });
}

export async function researchMoreAgent(agentId: string, prompt: string): Promise<void> {
  return sendApproval(agentId, { action: 'research_more', prompt });
}
