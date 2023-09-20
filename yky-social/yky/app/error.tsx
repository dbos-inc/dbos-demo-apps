"use client";

import Image from 'next/image';

function ykyErrorSplash() {
    return (<Image src="/YKY.png" width={500} height={500} alt="Error Splash" />);
}

export default function ErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center justify-center">
        <div className="m-4 p-4 bg-cyan-200">
          {ykyErrorSplash()}
        </div>
        <div className="m-4 p-4 bg-red-200 text-red-900 border border-red-900 rounded">
          <div className="flex items-center">
            <svg className="h-6 w-6 mr-2 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M10 2C5.58 2 2 5.58 2 10s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
            </svg>
            <div>
              Error.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
