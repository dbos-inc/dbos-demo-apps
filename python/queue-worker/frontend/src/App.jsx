import { useState } from 'react'

function App() {
  const [status, setStatus] = useState('')

  const enqueueWorkflow = async () => {
    setStatus('Enqueueing...')
    try {
      const response = await fetch('/api/workflows', { method: 'POST' })
      if (response.ok) {
        setStatus('Workflow enqueued successfully!')
      } else {
        setStatus('Failed to enqueue workflow')
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`)
    }
  }

  return (
    <div className="container">
      <h1>Queue Worker Demo</h1>
      <button onClick={enqueueWorkflow}>Enqueue Workflow</button>
      {status && <p className="status">{status}</p>}
    </div>
  )
}

export default App
