import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { CodeSnippet } from './CodeSnippet';

type TabType = 'fair-queue' | 'rate-limited' | 'debouncer' | 'delayed';

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
  pending: PendingWorkflow[];
  success: TenantCount[];
}

interface DebounceItem {
  workflow_id: string;
  tenant_id: string;
  input: string;
  start_time: number;
  delay_until: number | null;
  ran_at: number;
}

interface DebouncePipeline {
  delayed: DebounceItem[];
  pending: DebounceItem[];
  completed: DebounceItem[];
}

interface DelayedWorkflow {
  workflow_id: string;
  workflow_status: string;
  created_at: number;
  due_at: number | null;
}

// Categorical palette validated for the app's dark surface. Tenants are assigned a
// color the first time they're seen and never reshuffled; a 9th+ tenant folds to "Other".
const TENANT_PALETTE = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];
const OTHER_COLOR = '#94a3b8';

// Debouncer tab: preset tenants and a set of playful inputs so firing a debounce
// (and re-firing it before the window closes) is a single click.
const DEBOUNCE_TENANTS = ['alice', 'bob', 'clark'];
// Jobs a tenant might repeatedly trigger: debouncing runs the job once after the
// triggers stop, with only the last argument submitted.
const DEBOUNCE_INPUTS = ['input_1', 'input_2', 'input_3', 'input_4'];

// Delayed execution tab: the delays a user can enqueue a workflow with, or
// change a waiting workflow's delay to, in seconds.
const DELAY_OPTIONS = [5, 15, 30, 60, 300, 3600, 86400];

// Format a duration with its two largest units, e.g. "45s", "4m 12s", "1h", "23h 59m".
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const units: [number, string][] = [[86400, 'd'], [3600, 'h'], [60, 'm'], [1, 's']];
  const found = units.findIndex(([size]) => s >= size);
  const i = found === -1 ? units.length - 1 : found;
  const [size, label] = units[i];
  const whole = Math.floor(s / size);
  if (i === units.length - 1) return `${whole}${label}`;
  const [nextSize, nextLabel] = units[i + 1];
  const rest = Math.floor((s % size) / nextSize);
  return rest ? `${whole}${label} ${rest}${nextLabel}` : `${whole}${label}`;
}

// The DBOS code behind each tab, shown in the Code card.
const CODE_SNIPPETS: Record<TabType, string> = {
  'fair-queue': `await DBOS.registerQueue('fair-queue', {
  partitionConcurrency: 2,
  workerConcurrency: 4,
});`,
  'rate-limited': `await DBOS.registerQueue('rate-limited-queue', {
  rateLimit: { limitPerPeriod: 2, periodSec: 10 },
});`,
  debouncer: `await DBOS.registerQueue('debouncer-queue');
// ...
const debouncer = new Debouncer({
  workflow: debouncerWorkflow,
  startWorkflowParams: { queueName: 'debouncer-queue' },
});
// ...
const debounceKey = tenantId;
const debouncePeriodMs = 10000;
await debouncer.debounce(debounceKey, debouncePeriodMs, tenantId, input);`,
  delayed: `await DBOS.registerQueue('delayed-queue');
// ...
await DBOS.startWorkflow(delayedWorkflow, {
  queueName: 'delayed-queue',
  enqueueOptions: { delaySeconds },
})();
// ...
await DBOS.setWorkflowDelay(workflowID, { delaySeconds: newDelaySeconds });`,
};

function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Like formatTime, but prefixed with the date when it isn't today (e.g. a 1d delay).
function formatDueTime(epochMs: number, nowMs: number): string {
  const date = new Date(epochMs);
  if (date.toDateString() === new Date(nowMs).toDateString()) return formatTime(epochMs);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${formatTime(epochMs)}`;
}

interface Toast {
  message: string;
  type: 'success' | 'error';
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('rate-limited');
  const [tenantSelect, setTenantSelect] = useState('ed');
  const [customTenant, setCustomTenant] = useState('');
  const [debouncerTenantId, setDebouncerTenantId] = useState('alice');
  const [debouncerCustomTenant, setDebouncerCustomTenant] = useState('');
  const [debouncerInput, setDebouncerInput] = useState(DEBOUNCE_INPUTS[0]);
  const [debouncerCustomInput, setDebouncerCustomInput] = useState('');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [debounce, setDebounce] = useState<DebouncePipeline | null>(null);
  const [enqueueDelaySeconds, setEnqueueDelaySeconds] = useState(DELAY_OPTIONS[2]);
  const [delayedWorkflows, setDelayedWorkflows] = useState<DelayedWorkflow[]>([]);
  // The workflow whose delay change is in flight, so only its pulldown is disabled.
  const [changingDelayFor, setChangingDelayFor] = useState<string | null>(null);
  const tenantOrderRef = useRef<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const workflowName = activeTab === 'fair-queue'
    ? 'fair_queue_workflow'
    : activeTab === 'rate-limited'
    ? 'rate_limited_queue_workflow'
    : activeTab === 'delayed'
    ? 'delayed_workflow'
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
        ...data.pending,
      ].map((x) => x.tenant_id);
      const known = tenantOrderRef.current;
      const fresh = [...new Set(seen)].filter((t) => !known.includes(t)).sort();
      if (fresh.length) tenantOrderRef.current = [...known, ...fresh];
      setPipeline(data);
    } catch (error) {
      console.error('Failed to fetch pipeline:', error);
    }
  }, []);

  const fetchDebouncer = useCallback(async () => {
    try {
      const response = await fetch('/api/debouncer/pipeline');
      if (!response.ok) return;
      const data: DebouncePipeline = await response.json();
      const seen = [...data.delayed, ...data.pending, ...data.completed].map((x) => x.tenant_id);
      const known = tenantOrderRef.current;
      const fresh = [...new Set(seen)].filter((t) => !known.includes(t)).sort();
      if (fresh.length) tenantOrderRef.current = [...known, ...fresh];
      setDebounce(data);
    } catch (error) {
      console.error('Failed to fetch debouncer pipeline:', error);
    }
  }, []);

  const fetchDelayed = useCallback(async () => {
    try {
      const response = await fetch('/api/delayed/workflows');
      if (!response.ok) return;
      setDelayedWorkflows(await response.json());
    } catch (error) {
      console.error('Failed to fetch delayed workflows:', error);
    }
  }, []);

  useEffect(() => {
    const load =
      activeTab === 'fair-queue'
        ? fetchPipeline
        : activeTab === 'debouncer'
        ? fetchDebouncer
        : activeTab === 'delayed'
        ? fetchDelayed
        : fetchWorkflows;
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [activeTab, fetchPipeline, fetchDebouncer, fetchDelayed, fetchWorkflows]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Tick every second on the debouncer and delayed tabs so their countdowns
  // update smoothly between the 2s data polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (activeTab !== 'debouncer' && activeTab !== 'delayed') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTab]);

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

  const submitDebounce = async (tenant: string, input: string) => {
    if (!tenant || !input) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/workflows/debouncer?tenant_id=${encodeURIComponent(tenant)}&input=${encodeURIComponent(input)}`,
        { method: 'POST' },
      );

      if (response.ok) {
        setToast({ message: `Debounced "${input}" for "${tenant}"`, type: 'success' });
        fetchDebouncer();
      } else {
        setToast({ message: 'Failed to submit workflow', type: 'error' });
      }
    } catch (error) {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Post a delayed-workflow action, then refresh the table right away instead
  // of waiting for the next poll.
  const postDelayedAction = async (url: string, successMessage: string) => {
    try {
      const response = await fetch(url, { method: 'POST' });
      if (response.ok) {
        setToast({ message: successMessage, type: 'success' });
      } else {
        const body = await response.json().catch(() => null);
        setToast({ message: body?.error ?? 'Request failed', type: 'error' });
      }
      await fetchDelayed();
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    }
  };

  const handleEnqueueDelayed = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await postDelayedAction(
      `/api/workflows/delayed?delay_seconds=${enqueueDelaySeconds}`,
      `Enqueued a workflow delayed by ${formatDuration(enqueueDelaySeconds)}`,
    );
    setIsSubmitting(false);
  };

  const handleChangeDelay = async (workflowId: string, delaySeconds: number) => {
    setChangingDelayFor(workflowId);
    await postDelayedAction(
      `/api/workflows/delayed/${encodeURIComponent(workflowId)}/set_delay?delay_seconds=${delaySeconds}`,
      `${workflowId.slice(0, 8)} now runs in ${formatDuration(delaySeconds)}`,
    );
    setChangingDelayFor(null);
  };

  const handleDebouncerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tenant =
      debouncerTenantId === 'custom' ? debouncerCustomTenant.trim() : debouncerTenantId;
    const input = debouncerInput === 'custom' ? debouncerCustomInput.trim() : debouncerInput;
    submitDebounce(tenant, input);
  };

  const getStatusClass = (status: string) => {
    switch (status.toLowerCase()) {
      case 'success':
        return 'success';
      case 'enqueued':
        return 'enqueued';
      case 'delayed':
        return 'delayed';
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
    const p = pipeline ?? { enqueued: [], pending: [], success: [] };
    const order = tenantOrderRef.current;
    const byOrder = (a: string, b: string) => order.indexOf(a) - order.indexOf(b);

    const tenantsInView = [...new Set([
      ...p.enqueued.map((x) => x.tenant_id),
      ...p.pending.map((x) => x.tenant_id),
      ...p.success.map((x) => x.tenant_id),
    ])].sort(byOrder);

    const enqueued = [...p.enqueued].sort((a, b) => byOrder(a.tenant_id, b.tenant_id));
    const success = [...p.success].sort((a, b) => byOrder(a.tenant_id, b.tenant_id));
    const pending = [...p.pending].sort((a, b) => byOrder(a.tenant_id, b.tenant_id));

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
            <div className="pipe-sublabel">waiting for a slot</div>
            <div className="count-box">{countBox(enqueued)}</div>
          </div>
          <div className="pipe-arrow" aria-hidden="true">→</div>
          <div className="pipe-section">
            <div className="pipe-label">Pending</div>
            <div className="pipe-sublabel">running</div>
            <div className="pill-stack">{pillStack(pending)}</div>
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

  const renderDebouncer = () => {
    const d = debounce ?? { delayed: [], pending: [], completed: [] };
    const order = tenantOrderRef.current;
    const byOrder = (a: string, b: string) => order.indexOf(a) - order.indexOf(b);

    const tenantsInView = [...new Set([
      ...d.delayed.map((x) => x.tenant_id),
      ...d.pending.map((x) => x.tenant_id),
      ...d.completed.map((x) => x.tenant_id),
    ])].sort(byOrder);

    const secondsUntil = (delayUntil: number | null): number =>
      delayUntil == null ? 0 : Math.max(0, Math.ceil((delayUntil - Date.now()) / 1000));

    const itemRow = (it: DebounceItem, right?: React.ReactNode) => (
      <div className="debounce-row" key={it.workflow_id} title={`${it.tenant_id} · ${it.input}`}>
        <span className="count-dot" style={{ background: colorForTenant(it.tenant_id) }} />
        <span className="debounce-tenant">{it.tenant_id}</span>
        <span className="debounce-input">{it.input}</span>
        {right}
      </div>
    );

    const list = (
      items: DebounceItem[],
      renderRight?: (it: DebounceItem) => React.ReactNode,
      sortBy: 'tenant' | 'recent' = 'tenant',
    ) =>
      items.length === 0 ? (
        <div className="pipe-empty">—</div>
      ) : (
        [...items]
          .sort((a, b) =>
            sortBy === 'recent' ? b.ran_at - a.ran_at : byOrder(a.tenant_id, b.tenant_id),
          )
          .map((it) => itemRow(it, renderRight?.(it)))
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
            <div className="pipe-label">Delayed</div>
            <div className="pipe-sublabel">waiting to debounce</div>
            <div className="count-box debounce-list">
              {list(d.delayed, (it) => (
                <span className="debounce-countdown">{secondsUntil(it.delay_until)}s until run</span>
              ))}
            </div>
          </div>
          <div className="pipe-arrow" aria-hidden="true">→</div>
          <div className="pipe-section">
            <div className="pipe-label">Pending</div>
            <div className="pipe-sublabel">running now</div>
            <div className="count-box debounce-list">{list(d.pending)}</div>
          </div>
        </div>
        <div className="debounce-completed">
          <div className="pipe-label">Completed</div>
          <div className="pipe-sublabel">last 30 min</div>
          <div className="count-box debounce-list debounce-completed-list">
            {list(
              d.completed,
              (it) => <span className="debounce-time">{formatTime(it.ran_at)}</span>,
              'recent',
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDelayed = () => {
    if (delayedWorkflows.length === 0) {
      return (
        <div className="empty-state">
          <h3 className="empty-title">No delayed workflows yet</h3>
          <p className="empty-text">Enqueue a delayed workflow to get started</p>
        </div>
      );
    }

    return (
      <div className="delayed-table-scroll">
        <table className="delayed-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Due</th>
              <th className="delayed-action-col">Delay</th>
            </tr>
          </thead>
          <tbody>
            {delayedWorkflows.map((w) => {
              const isDelayed = w.workflow_status === 'DELAYED';
              return (
                <tr key={w.workflow_id}>
                  <td className="delayed-id" title={w.workflow_id}>{w.workflow_id.slice(0, 8)}</td>
                  <td>
                    <span className={`status-badge ${getStatusClass(w.workflow_status)}`}>
                      <span className="status-dot"></span>
                      {w.workflow_status}
                    </span>
                  </td>
                  <td>
                    {isDelayed && w.due_at ? (
                      <span className="delayed-due">
                        {formatDueTime(w.due_at, now)}
                        <span className="debounce-countdown">
                          {w.due_at > now ? `in ${formatDuration((w.due_at - now) / 1000)}` : 'due now'}
                        </span>
                      </span>
                    ) : (
                      <span className="delayed-muted">—</span>
                    )}
                  </td>
                  <td className="delayed-action-col">
                    {isDelayed ? (
                      // A native select, styled as a button, is the "change delay" pulldown.
                      <select
                        className="delay-change"
                        aria-label={`Change delay for ${w.workflow_id.slice(0, 8)}`}
                        value=""
                        disabled={changingDelayFor === w.workflow_id}
                        onChange={(e) => handleChangeDelay(w.workflow_id, Number(e.target.value))}
                      >
                        <option value="" disabled>
                          {changingDelayFor === w.workflow_id ? 'Changing…' : 'Change delay'}
                        </option>
                        {DELAY_OPTIONS.map((s) => (
                          <option key={s} value={s}>Run in {formatDuration(s)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="delayed-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
              className={`tab ${activeTab === 'rate-limited' ? 'active' : ''}`}
              onClick={() => setActiveTab('rate-limited')}
            >
              Rate Limited Queue
            </button>
            <button
              className={`tab ${activeTab === 'fair-queue' ? 'active' : ''}`}
              onClick={() => setActiveTab('fair-queue')}
            >
              Fair Queue
            </button>
            <button
              className={`tab ${activeTab === 'delayed' ? 'active' : ''}`}
              onClick={() => setActiveTab('delayed')}
            >
              Delays
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
        <div className="card code-card">
          <div className="card-header">
            <h2 className="card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
              </svg>
              Code
            </h2>
          </div>
          <div className="card-body">
            <CodeSnippet code={CODE_SNIPPETS[activeTab]} />
          </div>
        </div>

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
                <p className="form-hint">
                  This debouncer waits 10 seconds after the last input before enqueuing the workflow.
                  Consecutive triggers for the same tenant replace earlier pending instances.
                  This pattern is used for cases like delaying processing until a user stops typing.
                </p>
                <div className="submit-row">
                  <div className="form-group tenant-group">
                    <label htmlFor="debouncerTenantId" className="form-label">
                      Tenant
                    </label>
                    <div className="tenant-controls">
                      <select
                        id="debouncerTenantId"
                        className="form-input form-select"
                        value={debouncerTenantId}
                        onChange={(e) => setDebouncerTenantId(e.target.value)}
                        disabled={isSubmitting}
                      >
                        {DEBOUNCE_TENANTS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                        <option value="custom">custom…</option>
                      </select>
                      {debouncerTenantId === 'custom' && (
                        <input
                          type="text"
                          className="form-input custom-tenant-input"
                          placeholder="Enter tenant..."
                          value={debouncerCustomTenant}
                          onChange={(e) => setDebouncerCustomTenant(e.target.value)}
                          disabled={isSubmitting}
                          autoFocus
                        />
                      )}
                    </div>
                  </div>
                  <div className="form-group tenant-group">
                    <label htmlFor="debouncerInput" className="form-label">
                      Input
                    </label>
                    <div className="tenant-controls">
                      <select
                        id="debouncerInput"
                        className="form-input form-select"
                        value={debouncerInput}
                        onChange={(e) => setDebouncerInput(e.target.value)}
                        disabled={isSubmitting}
                      >
                        {DEBOUNCE_INPUTS.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                        <option value="custom">custom…</option>
                      </select>
                      {debouncerInput === 'custom' && (
                        <input
                          type="text"
                          className="form-input custom-tenant-input"
                          placeholder="Enter input..."
                          value={debouncerCustomInput}
                          onChange={(e) => setDebouncerCustomInput(e.target.value)}
                          disabled={isSubmitting}
                          autoFocus
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="submit-row">
                  <button
                    type="submit"
                    className="btn btn-enqueue"
                    disabled={
                      isSubmitting ||
                      (debouncerTenantId === 'custom' && !debouncerCustomTenant.trim()) ||
                      (debouncerInput === 'custom' && !debouncerCustomInput.trim())
                    }
                  >
                    {isSubmitting ? 'Debouncing…' : 'Trigger Debounce'}
                  </button>
                </div>
              </form>
            )}
            {activeTab === 'delayed' && (
              <form onSubmit={handleEnqueueDelayed}>
                <p className="form-hint">
                  Enqueue workflows that wait before running. While a workflow is DELAYED, change its delay from the table to run it sooner or later.
                  The delay is stored in the database, so a workflow still runs if the app restarts before it is due.
                </p>
                <div className="submit-row">
                  <div className="form-group tenant-group">
                    <label htmlFor="enqueueDelaySeconds" className="form-label">
                      Delay
                    </label>
                    <div className="tenant-controls">
                      <select
                        id="enqueueDelaySeconds"
                        className="form-input form-select"
                        value={enqueueDelaySeconds}
                        onChange={(e) => setEnqueueDelaySeconds(Number(e.target.value))}
                      >
                        {DELAY_OPTIONS.map((s) => (
                          <option key={s} value={s}>{formatDuration(s)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Enqueuing…' : 'Enqueue Delayed Workflow'}
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
              {activeTab === 'fair-queue'
                ? 'Fair Queue Pipeline'
                : activeTab === 'debouncer'
                ? 'Debouncer Pipeline'
                : activeTab === 'delayed'
                ? 'Delayed Workflows'
                : 'Queued Workflows'}
            </h2>
            <div className="refresh-indicator">
              <span className="refresh-dot"></span>
              Auto-refresh
            </div>
          </div>
          <div className="card-body">
            {activeTab === 'fair-queue' ? renderPipeline() : activeTab === 'debouncer' ? renderDebouncer() : activeTab === 'delayed' ? renderDelayed() : (
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
