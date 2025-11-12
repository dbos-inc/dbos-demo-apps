import { useState } from 'react';
import { startAgent } from '../api';

interface NewAgentFormProps {
  onAgentStarted: () => void;
}

export function NewAgentForm({ onAgentStarted }: NewAgentFormProps) {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      await startAgent(topic);
      setTopic('');
      onAgentStarted();
    } catch (err) {
      setError('Failed to start agent. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="new-agent-form">
      <h2>Launch New Research Agent</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="topic">Research Topic:</label>
          <input
            type="text"
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic to research..."
            disabled={isLoading}
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={isLoading || !topic.trim()}>
          {isLoading ? 'Launching...' : 'Launch Agent'}
        </button>
      </form>
    </div>
  );
}
