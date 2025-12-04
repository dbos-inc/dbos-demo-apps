import { useState, useEffect } from 'react'

function App() {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchWorkflows() {
    console.log('Fetching workflows...')
    try {
      const response = await fetch('/api/workflows')
      console.log('Response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('Workflows:', data)
        setWorkflows(data)
        setError(null)
      } else {
        const text = await response.text()
        console.error('Error response:', text)
        setError(`Server error: ${response.status}`)
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message)
    }
  }

  useEffect(function() {
    console.log('Component mounted, starting polling')
    fetchWorkflows()
    const id = setInterval(function() {
      fetchWorkflows()
    }, 1000)
    return function() {
      console.log('Cleanup')
      clearInterval(id)
    }
  }, [])

  async function handleEnqueue() {
    console.log('Enqueueing...')
    setLoading(true)
    try {
      const response = await fetch('/api/workflows', { method: 'POST' })
      console.log('Enqueue response:', response.status)
      if (response.ok) {
        fetchWorkflows()
      }
    } catch (err) {
      console.error('Enqueue error:', err)
    }
    setLoading(false)
  }

  function getStatusColor(status) {
    if (status === 'SUCCESS') return '#10b981'
    if (status === 'PENDING') return '#f59e0b'
    if (status === 'ERROR') return '#ef4444'
    return '#6b7280'
  }

  return (
    <div className="container">
      <h1>Queue Worker Demo</h1>

      {error && <p className="error">Error: {error}</p>}

      <button onClick={handleEnqueue} disabled={loading}>
        {loading ? 'Enqueueing...' : 'Enqueue Workflow'}
      </button>

      <div className="workflows">
        <h2>Workflows ({workflows.length})</h2>
        {workflows.length === 0 ? (
          <p className="empty">No workflows yet</p>
        ) : (
          <div className="workflow-list">
            {workflows.map(function(wf) {
              return (
                <div key={wf.workflow_id} className="workflow-card">
                  <div className="workflow-header">
                    <span
                      className="status-badge"
                      style={{ background: getStatusColor(wf.workflow_status) }}
                    >
                      {wf.workflow_status}
                    </span>
                    <span className="workflow-id">{wf.workflow_id.slice(0, 8)}...</span>
                  </div>
                  {wf.steps_completed != null && wf.num_steps != null && (
                    <>
                      <div className="progress-container">
                        <div
                          className="progress-bar"
                          style={{ width: (wf.steps_completed / wf.num_steps * 100) + '%' }}
                        />
                      </div>
                      <div className="progress-text">
                        {wf.steps_completed} / {wf.num_steps} steps
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
