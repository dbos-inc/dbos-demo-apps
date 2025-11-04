import { useState, useEffect } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'

function App() {
  const [waitingAgents, setWaitingAgents] = useState([])
  const [approvedAgents, setApprovedAgents] = useState([])
  const [deniedAgents, setDeniedAgents] = useState([])
  const [agentCounter, setAgentCounter] = useState(1)
  const [activeTab, setActiveTab] = useState('pending')

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

  const tabs = [
    { id: 'pending', label: 'Pending', count: waitingAgents.length },
    { id: 'approved', label: 'Approved', count: approvedAgents.length },
    { id: 'denied', label: 'Denied', count: deniedAgents.length }
  ]

  const renderAgentList = () => {
    let agents = []
    let emptyMessage = ''
    let showActions = false

    if (activeTab === 'pending') {
      agents = waitingAgents
      emptyMessage = 'No pending agents'
      showActions = true
    } else if (activeTab === 'approved') {
      agents = approvedAgents
      emptyMessage = 'No approved agents'
    } else {
      agents = deniedAgents
      emptyMessage = 'No denied agents'
    }

    if (agents.length === 0) {
      return <div className="empty-state">{emptyMessage}</div>
    }

    return (
      <div className="agent-grid">
        {agents.map((agent) => (
          <div key={agent.agent_id} className={`agent-card ${activeTab}`}>
            <div className="agent-header">
              <h3>{agent.name}</h3>
              <span className={`status-badge ${activeTab}`}>
                {activeTab === 'pending' ? 'Waiting' : activeTab}
              </span>
            </div>
            <div className="agent-body">
              <p className="agent-task">{agent.task}</p>
              {agent.question && <p className="agent-question">{agent.question}</p>}
            </div>
            {showActions && (
              <div className="agent-actions">
                <button
                  className="btn-confirm"
                  onClick={() => respondToAgent(agent.agent_id, 'confirm')}
                >
                  Confirm
                </button>
                <button
                  className="btn-deny"
                  onClick={() => respondToAgent(agent.agent_id, 'deny')}
                >
                  Deny
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="logo">
          <img src="https://docs.dbos.dev/img/dbos-logo.png" alt="DBOS" />
          <h1>Agent Inbox</h1>
        </div>
        <button className="btn-start" onClick={startAgent}>
          <span className="btn-icon">+</span>
          Start Agent
        </button>
        <div className="sidebar-footer">
          <a href="https://docs.dbos.dev/" target="_blank" rel="noopener noreferrer" className="footer-link">
            <span className="link-icon">📚</span>
            Documentation
          </a>
          <a href="https://github.com/dbos-inc" target="_blank" rel="noopener noreferrer" className="footer-link">
            <span className="link-icon">⭐</span>
            GitHub
          </a>
        </div>
      </div>

      <div className="main-content">
        <div className="tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              <span className="tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="content">
          {renderAgentList()}
        </div>
      </div>
    </div>
  )
}

export default App
