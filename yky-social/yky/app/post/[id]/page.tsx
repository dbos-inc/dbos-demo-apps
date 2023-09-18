import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export default async function Page({
    params,
    //searchParams
  } : {
      params: { id: string },
      //searchParams: { [key: string]: string | string[] | undefined }
  })
{
  const userid = getuserid();

  const res = await fetch(getAPIServer() + '/post/'+params.id+'?' + new URLSearchParams({
    userid: userid,
  }),
  {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  
  if (res.ok) {
      const data = await res.json();
      /*
      return (
          <div className="p-4 bg-white shadow-lg rounded-md">
          <div className="flex items-center mb-2">
              <div className="text-xl font-bold text-gray-900">{sender}</div>
          </div>
          <div className="mb-2 text-gray-700">{message}</div>      
          {images && images.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                  {images.map((image, index) => (
                      <img key={index} src={image} alt="message" className="object-cover w-full rounded-md" />
                  ))}
              </div>
          )}
      </div>
      );
                <div className="text-sm text-gray-500">{formatDistanceToNow(data.post.post_time, { addSuffix: true })}</div>
      */
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
  return (
    <h1>Post does not exist </h1>
  );
}