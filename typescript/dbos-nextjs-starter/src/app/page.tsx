"use client";

import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { crash, lastStep, startBackgroundTask } from '@/actions/background';

export default function Page() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const currentIdRef = useRef<string | null>(currentId);

  // Periodically check the progress of the background task
  useEffect(() => {
    currentIdRef.current = currentId; // Keep the ref updated with the current value
  }, [currentId]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlId = urlParams.get('id');
    if (urlId && urlId.length > 0) {
      setCurrentId(urlId);
    }

    const checkProgress = async () => {
      if (!currentIdRef.current) return;
  
      try {
        const step = await lastStep(currentIdRef.current);
        setStatus(`Your background task has completed <b>${step} of 10</b> steps`);
        if (step === '10') {
          setCurrentId(null);
        }
        setReconnecting(false);
      } catch (error) {
        console.error('Error checking progress:', error);
        setReconnecting(true);
      }
    };

    const interval = setInterval(checkProgress, 2000);
    return () => clearInterval(interval);
  }, []);

  const generateRandomString = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((x) => chars[x % chars.length])
      .join('');
  };

  const startBackgroundJob = async () => {
    const randomString = generateRandomString();
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('id', randomString);
    window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);

    setCurrentId(randomString);
    try {
      await startBackgroundTask(randomString, 10);
    } catch (error) {
      console.error('Error starting background task:', error);
    }
    setStatus('Starting task...');
  };

  const crashApp = async () => {
    await crash();
    setReconnecting(true);
  };

  return (
    <>
      <Head>
        <title>Welcome to DBOS!</title>
      </Head>
      <main className="font-sans text-gray-800 p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold mb-4">Welcome to DBOS!</h1>
        {reconnecting && (
          <div
            id="reconnecting"
            className="mb-4 bg-yellow-100 p-2 rounded-md text-center flex items-center justify-center gap-2"
          >
              <svg className="animate-spin h-5 w-5 text-yellow-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-yellow-700">Reconnecting...</span>
          </div>
        )}
        <p className="mb-4">
          DBOS helps you build applications that are <strong>resilient to any failure</strong>—no matter how many
          times you crash this app, your background task will always recover from its last completed step in about ten
          seconds.
        </p>
        <div className="flex gap-4 mb-4">
          <button
            onClick={startBackgroundJob}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded shadow transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Launch a reliable background task
          </button>
          <button
            onClick={crashApp}
            disabled={!currentId}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded shadow transition duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:bg-red-600"
          >
            Crash the application
          </button>
        </div>
        <p id="status" className="mb-4 text-gray-600" dangerouslySetInnerHTML={{ __html: status }}></p>
        <p className="mb-4">
          After finishing a background task, visit{' '}
          <a
            href="https://console.dbos.dev/traces"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            https://console.dbos.dev/traces
          </a>{' '}
          to see its traces.
        </p>
        <p className="mb-4">
          To start building your own crashproof application, access your source code from the{' '}
          <a
            href="https://console.dbos.dev/applications/dbos-nextjs-starter"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            cloud console
          </a>
          , edit <code className="bg-gray-100 px-1 rounded">src/dbos/operations.ts</code>, then redeploy your app.
        </p>
        <p className="mb-4">
          To learn how to build crashproof apps with DBOS, check out the{' '}
          <a
            href="https://docs.dbos.dev/typescript/programming-guide"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            programming guide
          </a>
          !
        </p>
      </main>
    </>
  );
}
