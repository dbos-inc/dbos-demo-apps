'use client';

import React from 'react';
import useSWR from 'swr';

//{postId: tle.post_id, fromUserId:tle.from_user_id, unread:tle.unread, sendDate: tle.send_date, recvType:tle.recv_type,
//    postText: tle.post?.text, postMentions: tle.post?.mentions}

interface RecvItem {
    postId: string;
    postText: string;
}

interface Props {
  userid: string;
}

const fetcher = (url: string) => fetch(url, {
  method: 'POST', headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
}).then((res) => res.json());

const RecvTimelineCR: React.FC<Props> = ({ userid }) => {
  let rquserid = userid;
  if (!rquserid) {
    rquserid = 'default';
  }

  const { data, error, isLoading } = useSWR(`/fetchrtl`,
    fetcher
  );

  if (error) { return "An error has occurred."; }
  if (isLoading) { return "Loading..."; }


  const messageList = data.timeline as RecvItem[];
  return (
    <div className="flex flex-col flex-grow items-center justify-center px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Received Messages and Posts</h1>
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

export default RecvTimelineCR;
