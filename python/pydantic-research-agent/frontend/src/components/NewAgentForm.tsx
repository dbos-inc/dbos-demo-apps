import { useState } from 'react';
import { startAgent } from '../api';

export function NewAgentForm() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      await startAgent(query);
      setQuery('');
    } catch (err) {
      setError('Failed to start agent. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="new-agent-form">
      <h2>Launch Research Agent</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="query">Research Query:</label>
          <input
            type="text"
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., 'What are the latest developments in AI?', 'Compare React vs Vue in 2024'..."
            disabled={isLoading}
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={isLoading || !query.trim()}>
          {isLoading ? 'Launching...' : 'Launch Agent'}
        </button>
      </form>
    </div>
  );
}
