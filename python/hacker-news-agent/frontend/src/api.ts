import type { AgentStatus, AgentStartRequest } from './types';

const API_BASE = 'http://localhost:8000';

export async function startAgent(topic: string): Promise<void> {
  const response = await fetch(`${API_BASE}/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ topic } as AgentStartRequest),
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
