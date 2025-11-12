import { useEffect, useState } from 'react';
import { listAgents } from '../api';
import type { AgentStatus } from '../types';

export function AgentList() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      setError(null);
      const data = await listAgents();
      setAgents(data);
    } catch (err) {
      setError('Failed to load agents');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    // Poll for updates every 3 seconds
    const interval = setInterval(fetchAgents, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadgeClass = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('success')) return 'status-success';
    if (lowerStatus.includes('pending') || lowerStatus.includes('running')) return 'status-running';
    if (lowerStatus.includes('error') || lowerStatus.includes('fail')) return 'status-error';
    return 'status-default';
  };

  if (isLoading) {
    return <div className="loading">Loading agents...</div>;
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="agent-list">
      <h2>Research Agents ({agents.length})</h2>
      {agents.length === 0 ? (
        <p className="empty-state">No agents yet. Launch one above to get started!</p>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => (
            <div key={agent.agent_id} className="agent-card">
              <div className="agent-header">
                <h3>{agent.topic}</h3>
                <span className={`status-badge ${getStatusBadgeClass(agent.status)}`}>
                  {agent.status}
                </span>
              </div>
              <div className="agent-meta">
                <div className="meta-item">
                  <span className="meta-label">ID:</span>
                  <span className="meta-value">{agent.agent_id}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Created:</span>
                  <span className="meta-value">
                    {new Date(agent.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Iterations:</span>
                  <span className="meta-value">{agent.iterations}</span>
                </div>
              </div>
              {agent.report && (
                <div className="agent-report">
                  <h4>Report:</h4>
                  <div className="report-content">{agent.report}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
