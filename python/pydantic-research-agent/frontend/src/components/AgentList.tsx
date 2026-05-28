import { useEffect, useState } from 'react';
import { listAgents, finishAgent, researchMoreAgent } from '../api';
import type { AgentStatus } from '../types';

export function AgentList() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [researchMorePrompts, setResearchMorePrompts] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<Record<string, string | null>>({});

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
    let timeoutId: NodeJS.Timeout;

    const pollAgents = async () => {
      await fetchAgents();
      // Wait 3 seconds after the request completes before polling again
      timeoutId = setTimeout(pollAgents, 3000);
    };

    // Start polling
    pollAgents();

    return () => clearTimeout(timeoutId);
  }, []);

  const getStatusBadgeClass = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('complete')) return 'status-success';
    if (lowerStatus.includes('error') || lowerStatus.includes('fail')) return 'status-error';
    if (lowerStatus === 'pending_approval') return 'status-pending-approval';
    return 'status-running';
  };

  const showSpinner = (status: string) => {
    const lowerStatus = status.toLowerCase();
    return lowerStatus !== 'pending_approval' &&
      !lowerStatus.includes('complete') &&
      !lowerStatus.includes('error');
  };

  const formatReportWithLinks = (report: string) => {
    // Split by markdown links [text](url)
    const parts: (string | JSX.Element)[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(report)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(report.substring(lastIndex, match.index));
      }

      // Add the link
      const linkText = match[1];
      const linkUrl = match[2];
      parts.push(
        <a
          key={match.index}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="report-link"
        >
          {linkText}
        </a>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < report.length) {
      parts.push(report.substring(lastIndex));
    }

    return parts;
  };

  const handleFinish = async (agentId: string) => {
    setActionLoading(prev => ({ ...prev, [agentId]: true }));
    setActionError(prev => ({ ...prev, [agentId]: null }));
    try {
      await finishAgent(agentId);
    } catch (err) {
      setActionError(prev => ({ ...prev, [agentId]: 'Failed to finish. Please try again.' }));
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [agentId]: false }));
    }
  };

  const handleResearchMore = async (agentId: string) => {
    const prompt = researchMorePrompts[agentId]?.trim();
    if (!prompt) return;
    setActionLoading(prev => ({ ...prev, [agentId]: true }));
    setActionError(prev => ({ ...prev, [agentId]: null }));
    try {
      await researchMoreAgent(agentId, prompt);
      setResearchMorePrompts(prev => ({ ...prev, [agentId]: '' }));
    } catch (err) {
      setActionError(prev => ({ ...prev, [agentId]: 'Failed to request more research. Please try again.' }));
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [agentId]: false }));
    }
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
                <h3>{agent.query}</h3>
                <span className={`status-badge ${getStatusBadgeClass(agent.status)}`}>
                  {showSpinner(agent.status) && <span className="spinner"></span>}
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
              </div>
              {agent.report && (
                <div className="agent-report">
                  <h4>Report:</h4>
                  <div className="report-content">{formatReportWithLinks(agent.report)}</div>
                </div>
              )}
              {agent.status === 'PENDING_APPROVAL' && (
                <div className="approval-section">
                  <p className="approval-prompt">
                    Research complete — would you like to finish or dig deeper?
                  </p>
                  {actionError[agent.agent_id] && (
                    <div className="error approval-error">{actionError[agent.agent_id]}</div>
                  )}
                  <div className="approval-actions">
                    <button
                      className="btn-finish"
                      onClick={() => handleFinish(agent.agent_id)}
                      disabled={actionLoading[agent.agent_id]}
                    >
                      {actionLoading[agent.agent_id] ? 'Sending...' : 'Finish'}
                    </button>
                    <span className="approval-or">or</span>
                    <div className="research-more-group">
                      <input
                        type="text"
                        className="research-more-input"
                        placeholder="What additional research would you like?"
                        value={researchMorePrompts[agent.agent_id] || ''}
                        onChange={(e) =>
                          setResearchMorePrompts(prev => ({ ...prev, [agent.agent_id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleResearchMore(agent.agent_id);
                        }}
                        disabled={actionLoading[agent.agent_id]}
                      />
                      <button
                        onClick={() => handleResearchMore(agent.agent_id)}
                        disabled={actionLoading[agent.agent_id] || !researchMorePrompts[agent.agent_id]?.trim()}
                      >
                        {actionLoading[agent.agent_id] ? 'Sending...' : 'Research More'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
