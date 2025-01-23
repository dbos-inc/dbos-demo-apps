import { ResultsRecord } from '../types/models';

type Props = {
  result: ResultsRecord | null;
  onClose: () => void;
};

export default function ResultsModal({ result, onClose }: Props) {
  if (!result) return null;

  return (
    <div className="modal">
      <div className="modal-content">
        <h3>Task Result</h3>
        <pre>{JSON.stringify(JSON.parse(result.result), null, 2)}</pre>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}