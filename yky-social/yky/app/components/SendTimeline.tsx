//import React, { useEffect, useState } from 'react';
import React from 'react';
import { getuserid } from './userid';
import { getAPIServer } from './backend';

//{postId: tle.post_id,  fromUserId:tle.user_id, sendDate: tle.send_date, sendType:tle.send_type,
//    postText: tle.post?.text, postMentions: tle.post?.mentions}
 
interface SendItem {
    postId: string;
    postText: string;
}

interface Props {
  userid: string;
}

const SendTimeline: React.FC<Props> = async ({ userid }) => {
    //const [messageList, setMessageList] = useState<SendItem[]>([]);

    /*
    useEffect(() => {
        const fetchMessages = async () => {
          try {
            const response = await fetch(`/fetchstl?userid=${userid}`);
            const data = await response.json();
            setMessageList(data);
          } catch (error) {
            console.error('Error fetching messages:', error);
          }
        };
    
        fetchMessages();
      }, [userid]);
    */

    const luserid = getuserid();
    let rquserid = userid;
    if (!rquserid || rquserid === 'default') {
      rquserid = luserid;
    }
  
    try {
        const response = await fetch(getAPIServer() + '/sendtimeline'+'?' + new URLSearchParams({
            userid: luserid,
            rqtimeline: rquserid,
          }),
        { // TODO Should  be HTTPS obvs
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
    
        const data = await response.json();

        const messageList = data.timeline as SendItem[];
        //console.log (data);
        //console.log (messageList);

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
    }
    catch (error) {
        console.error('Error fetching messages:', error);
        return (<h1>Error!</h1>);
    }
};

export default SendTimeline;
