'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const PostForm: React.FC = () => {
  const [postContent, setPostContent] = useState<string>('');

  const [isButtonDisabled, setIsButtonDisabled] = useState(false);

  const router = useRouter();

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPostContent(event.target.value);
  };

  const isIncOrButtonDisabled = () => {
    if (isButtonDisabled) return true;
    return (!postContent);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // Here you can handle the form submission, such as sending a POST request to your API
    setIsButtonDisabled(true); // Disable the button during form submission

    try {
      const body = { postText: postContent };
      const res = await fetch(`/dopost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.push('/main/outbox');
      }
      else {
        // TODO: Report error
        //setMessage(res.text.toString());
      }
      return;
    } catch (error) {
      // TODO check error handling and how to tell user
      console.error(error);
    } finally {
      setIsButtonDisabled(false); // Re-enable the button after form submission
    }

    console.log(`Post content: ${postContent}`);
    setPostContent('');
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl m-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className="w-full px-3 py-2 text-gray-700 border rounded-lg focus:outline-none"
          rows={5}
          value={postContent}
          onChange={handleInputChange}
          placeholder="What's happening?"
        />
        <div className="flex justify-end">
          <button type="submit"
            className={
                (isIncOrButtonDisabled() ? 'bg-gray-500 cursor-not-allowed text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline' 
                                    : 'bg-cyan-700 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline')
            }
            disabled={isIncOrButtonDisabled()}
          >
          Post
          </button>
        </div>
      </form>
    </div>
  );
};

export default PostForm;