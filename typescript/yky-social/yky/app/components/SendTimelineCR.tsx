'use client';

import React from 'react';
import useSWR from 'swr';

interface SendItem {
    postId: string;
    postText: string;
}

interface Props {
  userid: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SendTimelineCR: React.FC<Props> = ({ userid }) => {
  let rquserid = userid;
  if (!rquserid) {
    rquserid = 'default';
  }

  const { data, error, isLoading } = useSWR(`/fetchstl?rqtimeline=${userid}`,
    fetcher
  );

  if (error) return "An error has occurred.";
  if (isLoading) return "Loading...";


  const messageList = data.timeline as SendItem[];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Sent Messages and Posts</h1>
      <ul className="space-y-4">
        {messageList.map((message) => (
          <li key={message.postId} className="bg-white p-4 rounded shadow">
            <p>{message.postText}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SendTimelineCR;
