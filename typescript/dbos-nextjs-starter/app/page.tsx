"use client";

import { useState } from "react";
import {
  launchWorkflow as launchWorkflowAction,
  getWorkflowStatus,
} from "./actions";

export default function Home() {
  const [name, setName] = useState("");
  const [workflowID, setWorkflowID] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLaunch() {
    setLoading(true);
    setResult(null);
    setStatus(null);
    setWorkflowID(null);

    const data = await launchWorkflowAction(name);
    setWorkflowID(data.workflowID);
    setStatus("ENQUEUED");
    pollStatus(data.workflowID);
  }

  async function pollStatus(id: string) {
    const interval = setInterval(async () => {
      const data = await getWorkflowStatus(id);
      setStatus(data.status);
      if (data.status === "SUCCESS") {
        setResult(data.result);
        setLoading(false);
        clearInterval(interval);
      } else if (data.status === "ERROR") {
        setResult("Workflow failed");
        setLoading(false);
        clearInterval(interval);
      }
    }, 500);
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-xl flex-col items-center justify-center gap-8 py-32 px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          DBOS + Next.js
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-center">
          Launch a durable DBOS workflow from the browser.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          <input
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 rounded-lg border border-zinc-300 px-4 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button
            onClick={handleLaunch}
            disabled={loading}
            className="h-12 rounded-lg bg-black text-white font-medium transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {loading ? "Running..." : "Launch Workflow"}
          </button>
        </div>

        {workflowID && (
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Workflow ID
            </p>
            <p className="font-mono text-xs break-all text-black dark:text-white">
              {workflowID}
            </p>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Status
            </p>
            <p className="font-medium text-black dark:text-white">{status}</p>
            {result && (
              <>
                <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Result
                </p>
                <p className="font-medium text-black dark:text-white">
                  {result}
                </p>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
