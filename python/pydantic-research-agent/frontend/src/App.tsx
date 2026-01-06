import { NewAgentForm } from './components/NewAgentForm';
import { AgentList } from './components/AgentList';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>HN Research Agent</h1>
        <p>Harness the collective wisdom of Hacker News with AI-powered deep research on any tech topic</p>
      </header>
      <main className="app-main">
        <NewAgentForm />
        <AgentList />
      </main>
    </div>
  );
}

export default App;
