import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

type TabType = 'fair-queue' | 'rate-limited' | 'debouncer';

interface Workflow {
  workflow_id: string;
  workflow_status: string;
  workflow_name: string;
  start_time: number;
  tenant_id: string | null;
  input: string | null;
}

interface TenantCount {
  tenant_id: string;
  count: number;
}

interface PendingWorkflow {
  workflow_id: string;
  tenant_id: string;
}

interface Pipeline {
  enqueued: TenantCount[];
  pending_concurrency: PendingWorkflow[];
  success: TenantCount[];
}

// Categorical palette validated for the app's dark surface. Tenants are assigned a
// color the first time they're seen and never reshuffled; a 9th+ tenant folds to "Other".
const TENANT_PALETTE = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];
const OTHER_COLOR = '#94a3b8';

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
  const [tenantSelect, setTenantSelect] = useState('alice');
  const [customTenant, setCustomTenant] = useState('');
  const [debouncerTenantId, setDebouncerTenantId] = useState('');
  const [debouncerInput, setDebouncerInput] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const tenantOrderRef = useRef<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const workflowName = activeTab === 'fair-queue'
    ? 'fair_queue_concurrency_manager'
    : activeTab === 'rate-limited'
    ? 'rate_limited_queue_workflow'
    : 'debouncer_workflow';

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

  // Assign each tenant a stable color the first time it appears (never reshuffled).
  const colorForTenant = (tenant: string): string => {
    const i = tenantOrderRef.current.indexOf(tenant);
    return i >= 0 && i < TENANT_PALETTE.length ? TENANT_PALETTE[i] : OTHER_COLOR;
  };

  const fetchPipeline = useCallback(async () => {
    try {
      const response = await fetch('/api/fair_queue/pipeline');
      if (!response.ok) return;
      const data: Pipeline = await response.json();
      const seen = [
        ...data.enqueued,
        ...data.success,
        ...data.pending_concurrency,
      ].map((x) => x.tenant_id);
      const known = tenantOrderRef.current;
      const fresh = [...new Set(seen)].filter((t) => !known.includes(t)).sort();
      if (fresh.length) tenantOrderRef.current = [...known, ...fresh];
      setPipeline(data);
    } catch (error) {
      console.error('Failed to fetch pipeline:', error);
    }
  }, []);

  useEffect(() => {
    const load = activeTab === 'fair-queue' ? fetchPipeline : fetchWorkflows;
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [activeTab, fetchPipeline, fetchWorkflows]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleFairQueueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenant = tenantSelect === 'custom' ? customTenant.trim() : tenantSelect;
    if (!tenant) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/workflows/fair_queue?tenant_id=${encodeURIComponent(tenant)}`,
        { method: 'POST' },
      );

      if (response.ok) {
        setToast({ message: `Enqueued workflow for "${tenant}"`, type: 'success' });
        fetchPipeline();
      } else {
        setToast({ message: 'Failed to enqueue workflow', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRandomMix = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/workflows/fair_queue/random_mix', { method: 'POST' });

      if (response.ok) {
        const data = await response.json();
        setToast({
          message: `Enqueued ${data.total} workflows, skewed toward "${data.favored}"`,
          type: 'success',
        });
        fetchPipeline();
      } else {
        setToast({ message: 'Failed to enqueue mix', type: 'error' });
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

  const handleDebouncerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debouncerTenantId.trim() || !debouncerInput.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/workflows/debouncer?tenant_id=${encodeURIComponent(debouncerTenantId)}&input=${encodeURIComponent(debouncerInput)}`, {
        method: 'POST',
      });

      if (response.ok) {
        setToast({ message: `Debounced workflow triggered for "${debouncerTenantId}"`, type: 'success' });
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

  const showTenantBadge = activeTab === 'fair-queue' || activeTab === 'debouncer';
  const showInputBadge = activeTab === 'debouncer';

  const renderPipeline = () => {
    const p = pipeline ?? { enqueued: [], pending_concurrency: [], success: [] };
    const order = tenantOrderRef.current;
    const byOrder = (a: string, b: string) => order.indexOf(a) - order.indexOf(b);

    const tenantsInView = [...new Set([
      ...p.enqueued.map((x) => x.tenant_id),
      ...p.pending_concurrency.map((x) => x.tenant_id),
      ...p.success.map((x) => x.tenant_id),
    ])].sort(byOrder);

    const enqueued = [...p.enqueued].sort((a, b) => byOrder(a.tenant_id, b.tenant_id));
    const success = [...p.success].sort((a, b) => byOrder(a.tenant_id, b.tenant_id));
    const pendConc = [...p.pending_concurrency].sort((a, b) => byOrder(a.tenant_id, b.tenant_id));

    const countBox = (rows: TenantCount[]) =>
      rows.length === 0 ? (
        <div className="pipe-empty">—</div>
      ) : (
        rows.map((r) => (
          <div className="count-row" key={r.tenant_id}>
            <span className="count-dot" style={{ background: colorForTenant(r.tenant_id) }} />
            <span className="count-tenant" title={r.tenant_id}>{r.tenant_id}</span>
            <span className="count-num">{r.count}</span>
          </div>
        ))
      );

    const pillStack = (items: PendingWorkflow[]) =>
      items.length === 0 ? (
        <div className="pipe-empty">—</div>
      ) : (
        items.map((w) => (
          <div
            key={w.workflow_id}
            className="pill"
            style={{ background: colorForTenant(w.tenant_id) }}
            title={`${w.tenant_id} · ${w.workflow_id}`}
          />
        ))
      );

    return (
      <div className="pipeline">
        {tenantsInView.length > 0 && (
          <div className="pipeline-legend">
            {tenantsInView.map((t) => (
              <span className="legend-chip" key={t}>
                <span className="legend-dot" style={{ background: colorForTenant(t) }} />
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="pipeline-flow">
          <div className="pipe-section">
            <div className="pipe-label">Enqueued</div>
            <div className="pipe-sublabel">partition queue</div>
            <div className="count-box">{countBox(enqueued)}</div>
          </div>
          <div className="pipe-arrow" aria-hidden="true">→</div>
          <div className="pipe-section">
            <div className="pipe-label">Pending</div>
            <div className="pipe-sublabel">concurrency queue</div>
            <div className="pill-stack">{pillStack(pendConc)}</div>
          </div>
          <div className="pipe-arrow" aria-hidden="true">→</div>
          <div className="pipe-section">
            <div className="pipe-label">Success</div>
            <div className="pipe-sublabel">last 30 min</div>
            <div className="count-box">{countBox(success)}</div>
          </div>
        </div>
      </div>
    );
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
            <button
              className={`tab ${activeTab === 'debouncer' ? 'active' : ''}`}
              onClick={() => setActiveTab('debouncer')}
            >
              Debouncer
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
              Enqueue Workflows
            </h2>
          </div>
          <div className="card-body">
            {activeTab === 'fair-queue' && (
              <form onSubmit={handleFairQueueSubmit}>
                <p className="form-hint">
                  This queue runs up to 2 workflows per tenant, up to 4 workflows per process, and allocates capacity fairly across tenants.
                  For example, press "Enqueue a randomized mix" to saturate the queue. Then, add a workflow for "ed" and observe it run in a few seconds.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-mix"
                  onClick={handleRandomMix}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Enqueuing…' : 'Enqueue a randomized mix'}
                </button>
                <div className="submit-row" style={{ marginTop: '1rem' }}>
                  <div className="form-group tenant-group">
                    <label htmlFor="tenantSelect" className="form-label">
                      Add a single task
                    </label>
                    <div className="tenant-controls">
                      <select
                        id="tenantSelect"
                        className="form-input form-select"
                        value={tenantSelect}
                        onChange={(e) => setTenantSelect(e.target.value)}
                        disabled={isSubmitting}
                      >
                        <option value="alice">alice</option>
                        <option value="bob">bob</option>
                        <option value="clark">clark</option>
                        <option value="dave">dave</option>
                        <option value="ed">ed</option>
                        <option value="custom">custom…</option>
                      </select>
                      {tenantSelect === 'custom' && (
                        <input
                          type="text"
                          className="form-input custom-tenant-input"
                          placeholder="Enter tenant identifier..."
                          value={customTenant}
                          onChange={(e) => setCustomTenant(e.target.value)}
                          disabled={isSubmitting}
                          autoFocus
                        />
                      )}
                    </div>
                  </div>
                  <div className="form-group enqueue-group">
                    <button
                      type="submit"
                      className="btn btn-enqueue"
                      disabled={isSubmitting || (tenantSelect === 'custom' && !customTenant.trim())}
                    >
                      {'Enqueue'}
                    </button>
                  </div>
                </div>
              </form>
            )}
            {activeTab === 'rate-limited' && (
              <div>
                <p className="form-hint">
                  This queue starts no more than 2 workflows per 10 seconds.
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
            {activeTab === 'debouncer' && (
              <form onSubmit={handleDebouncerSubmit}>
                <div className="form-group">
                  <label htmlFor="debouncerTenantId" className="form-label">
                    Tenant ID
                  </label>
                  <input
                    type="text"
                    id="debouncerTenantId"
                    className="form-input"
                    placeholder="Enter tenant identifier..."
                    value={debouncerTenantId}
                    onChange={(e) => setDebouncerTenantId(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="debouncerInput" className="form-label">
                    Input
                  </label>
                  <input
                    type="text"
                    id="debouncerInput"
                    className="form-input"
                    placeholder="Enter input value..."
                    value={debouncerInput}
                    onChange={(e) => setDebouncerInput(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <p className="form-hint">
                  Debouncing waits 5 seconds after the last input before starting the workflow for each tenant.
                </p>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting || !debouncerTenantId.trim() || !debouncerInput.trim()}
                >
                  {isSubmitting ? 'Submitting...' : 'Trigger Debounce'}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {activeTab === 'fair-queue' ? 'Fair Queue Pipeline' : 'Queued Workflows'}
            </h2>
            <div className="refresh-indicator">
              <span className="refresh-dot"></span>
              Auto-refresh
            </div>
          </div>
          <div className="card-body">
            {activeTab === 'fair-queue' ? renderPipeline() : (
            <>
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
                          {showTenantBadge && (
                            <span className="tenant-badge">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                              </svg>
                              {workflow.tenant_id || 'N/A'}
                            </span>
                          )}
                          {showInputBadge && workflow.input && (
                            <span className="input-badge">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 6h16M4 12h16M4 18h7" />
                              </svg>
                              {workflow.input}
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
            </>
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
