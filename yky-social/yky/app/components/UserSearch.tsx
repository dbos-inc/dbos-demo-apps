'use client';

import React from 'react';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
//import useSWR from 'swr';

interface UserSearchRes
{
    message : string,
    uid ?: string,
    name ?: string
}

//const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface FBProps {
    uid: string;
    children?: React.ReactNode;
}
  
const FollowButton : React.FC<FBProps> = ({uid, children }) => {
    const router = useRouter();

    const followClick = async () => {
        const body = { action: "follow",  followUid: uid };
        const res = await fetch(`/dograph`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          alert("Follow failed");
        }
        else {
          router.push('/main/userhome');
        }
    };
        
    return (
      <button className="bg-cyan-700 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline" onClick={followClick}>
        {children}
      </button>
    );
};

const SearchPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  //const { data, error, isLoading } = useSWR(`/dousersearch?findUserName=${searchTerm}`, fetcher);
  const [searchResults, setSearchResults] = useState<UserSearchRes[]>([]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();

    // replace with your api call to fetch users
    const response = await fetch(`/dousersearch?findUserName=${searchTerm}`);
    const users: UserSearchRes[] = await response.json();

    setSearchResults(users);
  };

  return (
    <div className="flex flex-col flex-grow items-center justify-center py-2">
      <form
        className="w-full max-w-md mx-auto bg-white p-5 rounded-md shadow-sm"
        onSubmit={handleSearch}
      >
        <div className="flex items-center border-b border-b-2 border-gray-500 py-2">
          <input
            className="appearance-none bg-transparent border-none w-full text-gray-700 mr-3 py-1 px-2 leading-tight focus:outline-none"
            type="text"
            placeholder="Search for user"
            aria-label="Search for user"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <button
            className="bg-cyan-700 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            type="submit"
          >
            Search
          </button>
        </div>
      </form>
      <div className="w-full max-w-md mx-auto mt-4">
        {searchResults.map(user => (
          <div key={user.uid} className="bg-white p-4 rounded-md shadow-sm mt-4 flex justify-between items-center">
            <p className="text-gray-900">{user.name}</p>
            <FollowButton uid={user.uid || "error"}>
            Follow
            </FollowButton>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchPage;
