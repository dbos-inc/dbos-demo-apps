import { NewAgentForm } from './components/NewAgentForm';
import { AgentList } from './components/AgentList';
import './App.css';

function App() {
  const handleCrash = async () => {
    try {
      await fetch('http://localhost:8000/crash', { method: 'POST' });
    } catch {
      // Expected — server dies immediately, fetch will error
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Pydantic AI Research Agent</h1>
        <p>AI-powered deep research with structured outputs and durable execution</p>
        <button className="btn-crash" onClick={handleCrash}>💥 Crash App</button>
      </header>
      <main className="app-main">
        <NewAgentForm />
        <AgentList />
      </main>
    </div>
  );
}

export default App;
