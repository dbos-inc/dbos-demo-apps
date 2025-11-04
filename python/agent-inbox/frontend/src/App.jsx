import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'

function App() {
  const [waitingAgents, setWaitingAgents] = useState([])
  const [agentName, setAgentName] = useState('')
  const [agentTask, setAgentTask] = useState('')

  const fetchWaitingAgents = async () => {
    const response = await fetch(`${API_URL}/agents/waiting`)
    const data = await response.json()
    setWaitingAgents(data)
  }

  useEffect(() => {
    fetchWaitingAgents()
    const interval = setInterval(fetchWaitingAgents, 2000)
    return () => clearInterval(interval)
  }, [])

  const startAgent = async () => {
    await fetch(`${API_URL}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: agentName, task: agentTask })
    })
    setAgentName('')
    setAgentTask('')
    fetchWaitingAgents()
  }

  const respondToAgent = async (agentId, response) => {
    await fetch(`${API_URL}/agents/${agentId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response })
    })
    fetchWaitingAgents()
  }

  return (
    <div style={{ display: 'flex', gap: '40px', padding: '20px' }}>
      <div style={{ flex: 1 }}>
        <h2>Start Agent</h2>
        <input
          type="text"
          placeholder="Agent name"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
        />
        <input
          type="text"
          placeholder="Task description"
          value={agentTask}
          onChange={(e) => setAgentTask(e.target.value)}
          style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
        />
        <button onClick={startAgent}>Start Agent</button>
      </div>

      <div style={{ flex: 1 }}>
        <h2>Pending Agents ({waitingAgents.length})</h2>
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
        {waitingAgents.length === 0 && <p>No agents waiting for approval</p>}
      </div>
    </div>
  )
}

export default App
