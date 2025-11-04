import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'

function App() {
  const [waitingAgents, setWaitingAgents] = useState([])
  const [approvedAgents, setApprovedAgents] = useState([])
  const [deniedAgents, setDeniedAgents] = useState([])
  const [agentCounter, setAgentCounter] = useState(1)

  const fetchAgents = async () => {
    const [waiting, approved, denied] = await Promise.all([
      fetch(`${API_URL}/agents/waiting`).then(r => r.json()),
      fetch(`${API_URL}/agents/approved`).then(r => r.json()),
      fetch(`${API_URL}/agents/denied`).then(r => r.json())
    ])
    setWaitingAgents(waiting)
    setApprovedAgents(approved)
    setDeniedAgents(denied)
  }

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 2000)
    return () => clearInterval(interval)
  }, [])

  const startAgent = async () => {
    await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Agent ${agentCounter}`,
        task: `Task ${agentCounter}`
      })
    })
    setAgentCounter(agentCounter + 1)
    fetchAgents()
  }

  const respondToAgent = async (agentId, response) => {
    await fetch(`${API_URL}/agents/${agentId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response })
    })
    fetchAgents()
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2>Start Agent</h2>
        <button onClick={startAgent}>Start Agent</button>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          <h2>Pending ({waitingAgents.length})</h2>
          {waitingAgents.map((agent) => (
            <div key={agent.agent_id} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
              <h3>{agent.name}</h3>
              <p><strong>Task:</strong> {agent.task}</p>
              <p><strong>Question:</strong> {agent.question}</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => respondToAgent(agent.agent_id, 'confirm')}>
                  Confirm
                </button>
                <button onClick={() => respondToAgent(agent.agent_id, 'deny')}>
                  Deny
                </button>
              </div>
            </div>
          ))}
          {waitingAgents.length === 0 && <p>No pending agents</p>}
        </div>

        <div style={{ flex: 1 }}>
          <h2>Approved ({approvedAgents.length})</h2>
          {approvedAgents.map((agent) => (
            <div key={agent.agent_id} style={{ border: '1px solid #4caf50', padding: '10px', marginBottom: '10px' }}>
              <h3>{agent.name}</h3>
              <p><strong>Task:</strong> {agent.task}</p>
            </div>
          ))}
          {approvedAgents.length === 0 && <p>No approved agents</p>}
        </div>

        <div style={{ flex: 1 }}>
          <h2>Denied ({deniedAgents.length})</h2>
          {deniedAgents.map((agent) => (
            <div key={agent.agent_id} style={{ border: '1px solid #f44336', padding: '10px', marginBottom: '10px' }}>
              <h3>{agent.name}</h3>
              <p><strong>Task:</strong> {agent.task}</p>
            </div>
          ))}
          {deniedAgents.length === 0 && <p>No denied agents</p>}
        </div>
      </div>
    </div>
  )
}

export default App
