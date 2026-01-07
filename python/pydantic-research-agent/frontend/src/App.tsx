import { NewAgentForm } from './components/NewAgentForm';
import { AgentList } from './components/AgentList';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Pydantic AI Research Agent</h1>
        <p>AI-powered deep research with structured outputs and durable execution</p>
      </header>
      <main className="app-main">
        <NewAgentForm />
        <AgentList />
      </main>
    </div>
  );
}

export default App;
