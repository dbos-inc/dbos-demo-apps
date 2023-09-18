'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useUserLogin } from './YKYContext';
import Link from 'next/link';

const YKYTopNav: React.FC = () => {
  const router = useRouter();
  const {currentUser, setCurrentUser} = useUserLogin();

  const handleLogout = async () => {
    const res = await fetch('/dologin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    setCurrentUser({uname: undefined, uid: undefined});
    if (!res.ok) {
       alert("Failed to log out.");
    }
    else {
      router.push('/main');
    }
  };


  return (
      <nav className="bg-white p-6">
        <div className="flex items-center justify-between flex-wrap">
          <div className="flex items-center flex-shrink-0 text-black mr-6">
            <span className="font-semibold text-xl tracking-tight">YKY</span>
          </div>
          <div className="block lg:hidden">
            <button className="flex items-center px-3 py-2 border rounded text-teal-200 border-teal-400 hover:text-white hover:border-white">
              <svg className="fill-current h-3 w-3" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><title>Menu</title><path d="M0 3h20v2H0V3zm0 6h20v2H0V9zm0 6h20v2H0v15z"/></svg>
            </button>
          </div>
          <div className="w-full block flex-grow lg:flex lg:items-center lg:w-auto">
            {currentUser.uname ? (
            <div className="text-sm lg:flex-grow">
              <Link href="/main/userhome" className="block mt-4 lg:inline-block lg:mt-0 text-cyan-700 hover:text-cyan-400 mr-4">
                My Page
              </Link>
              <Link href="/main/usersearch" className="block mt-4 lg:inline-block lg:mt-0 text-cyan-700 hover:text-cyan-400 mr-4">
                Find Friends
              </Link>
              <Link href="/main/inbox" className="block mt-4 lg:inline-block lg:mt-0 text-cyan-700 hover:text-cyan-400 mr-4">
                For Me
              </Link>
              <Link href="/main/outbox" className="block mt-4 lg:inline-block lg:mt-0 text-cyan-700 hover:text-cyan-400 mr-4">
                Sent
              </Link>
            </div>
            ) : <div className="text-sm lg:flex-grow"/>
            }
            <div>
            {!currentUser.uname ?
              <button className="inline-block text-sm px-4 py-2 leading-none border rounded text-black border-black hover:border-transparent hover:text-cyan-500 hover:bg-white hover:border-gray-500 mt-4 lg:mt-0 ml-2" onClick={() => router.push('/main/login')}>Login</button>
              :
              <button className="inline-block text-sm px-4 py-2 leading-none border rounded text-black border-black hover:border-transparent hover:text-cyan-500 hover:bg-white hover:border-gray-500 mt-4 lg:mt-0 ml-2" onClick={handleLogout}>Logout</button>
            }
            </div>
          </div>
        </div>
      </nav>
  );
};

export default YKYTopNav;