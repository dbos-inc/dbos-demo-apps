import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { api, getHeaders } from '@/app/components/backend';

export default async function Page({
    params,
  } : {
    params: { id: string },
  })
{
  try {
    const hdrs = getHeaders();
    const data = await api.getPost({id: params.id}, {headers: hdrs});

    return (
      <div className="p-4 bg-white shadow-lg rounded-md">
        <div className="flex items-center justify-between mb-2">
              <div className="text-xl font-bold text-gray-900">{data.post.authorUser.user_name}</div>
              <div className="text-sm text-gray-500">{formatDistanceToNow(new Date(data.post.post_time), {addSuffix: true})}</div>
          </div>
          <div className="mb-2 text-gray-700">{data.post.text}</div>
      </div>
    );
  }
  catch (e) {
    return (
      <h1>Post does not exist.</h1>
    );
  }
}