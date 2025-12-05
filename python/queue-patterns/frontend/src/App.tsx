import { useState, useEffect, useCallback } from 'react';
import './App.css';

type TabType = 'fair-queue' | 'rate-limited';

interface Workflow {
  workflow_id: string;
  workflow_status: string;
  workflow_name: string;
  start_time: number;
  tenant_id: string | null;
}

function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('fair-queue');
  const [tenantId, setTenantId] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const workflowName = activeTab === 'fair-queue'
    ? 'fair_queue_concurrency_manager'
    : 'rate_limited_queue_workflow';

  const fetchWorkflows = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows?workflow_name=${workflowName}`);
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data);
      }
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    }
  }, [workflowName]);

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 2000);
    return () => clearInterval(interval);
  }, [fetchWorkflows]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleFairQueueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/workflows/fair_queue?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
      });

      if (response.ok) {
        setToast({ message: `Workflow queued for tenant "${tenantId}"`, type: 'success' });
        setTenantId('');
        fetchWorkflows();
      } else {
        setToast({ message: 'Failed to submit workflow', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRateLimitedSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/workflows/rate_limited_queue', {
        method: 'POST',
      });

      if (response.ok) {
        setToast({ message: 'Rate-limited workflow queued', type: 'success' });
        fetchWorkflows();
      } else {
        setToast({ message: 'Failed to submit workflow', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
        return 'success';
      case 'enqueued':
        return 'enqueued';
      case 'pending':
        return 'pending';
      case 'error':
      case 'failed':
        return 'error';
      default:
        return 'enqueued';
    }
  };

  const stats = {
    enqueued: workflows.filter(w => w.workflow_status.toLowerCase() === 'enqueued').length,
    pending: workflows.filter(w => w.workflow_status.toLowerCase() === 'pending').length,
    completed: workflows.filter(w => w.workflow_status.toLowerCase() === 'success').length,
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1 className="logo">DBOS Queue Patterns</h1>
          <nav className="tabs">
            <button
              className={`tab ${activeTab === 'fair-queue' ? 'active' : ''}`}
              onClick={() => setActiveTab('fair-queue')}
            >
              Fair Queue
            </button>
            <button
              className={`tab ${activeTab === 'rate-limited' ? 'active' : ''}`}
              onClick={() => setActiveTab('rate-limited')}
            >
              Rate Limited Queue
            </button>
          </nav>
        </div>
      </header>

      <main className="main-content">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Submit Workflow
            </h2>
          </div>
          <div className="card-body">
            {activeTab === 'fair-queue' ? (
              <form onSubmit={handleFairQueueSubmit}>
                <div className="form-group">
                  <label htmlFor="tenantId" className="form-label">
                    Tenant ID
                  </label>
                  <input
                    type="text"
                    id="tenantId"
                    className="form-input"
                    placeholder="Enter tenant identifier..."
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <p className="form-hint">
                  Fair queueing ensures at most 5 workflows run concurrently, with max 1 per tenant.
                </p>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || !tenantId.trim()}
                >
                  {isSubmitting ? 'Submitting...' : 'Queue Workflow'}
                </button>
              </form>
            ) : (
              <div>
                <p className="form-hint">
                  Rate limiting ensures no more than 2 workflows start per 10 seconds.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRateLimitedSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Queue Workflow'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Queued Workflows
            </h2>
            <div className="refresh-indicator">
              <span className="refresh-dot"></span>
              Auto-refresh
            </div>
          </div>
          <div className="card-body">
            <div className="stats">
              <div className="stat">
                <div className="stat-value">{stats.enqueued}</div>
                <div className="stat-label">Enqueued</div>
              </div>
              <div className="stat">
                <div className="stat-value">{stats.pending}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat">
                <div className="stat-value">{stats.completed}</div>
                <div className="stat-label">Completed</div>
              </div>
            </div>

            {workflows.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h3 className="empty-title">No workflows yet</h3>
                <p className="empty-text">Submit a workflow to get started</p>
              </div>
            ) : (
              <div className="workflow-scroll">
                <div className="workflow-list">
                  {workflows.map((workflow) => (
                    <div key={workflow.workflow_id} className="workflow-item">
                      <div className="workflow-info">
                        <div className="workflow-id">{workflow.workflow_id}</div>
                        <div className="workflow-meta">
                          {activeTab === 'fair-queue' && (
                            <span className="tenant-badge">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                              </svg>
                              {workflow.tenant_id || 'N/A'}
                            </span>
                          )}
                          <span className="time-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                            {formatTime(workflow.start_time)}
                          </span>
                        </div>
                      </div>
                      <span className={`status-badge ${getStatusClass(workflow.workflow_status)}`}>
                        <span className="status-dot"></span>
                        {workflow.workflow_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
