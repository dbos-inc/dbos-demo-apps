'use client';

import Image from 'next/image';
import React, { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useUserLogin } from './YKYContext';

interface Props {
  regurl: string;
}

interface LoginPayload {
  username: string;
  password: string;
}

const LoginPage: React.FC<Props> = ({ regurl }) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const router = useRouter();
  const {currentUser: _currentUser, setCurrentUser} = useUserLogin();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const payload: LoginPayload = { username, password };

    const res = await fetch('/dologin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // TODO error handling
    if (!res.ok) {
       alert("Login failed.");
    }
    else {
      // Now you can use the JWT to authenticate further requests
      // Some might want to store it in localStorage:
      // localStorage.setItem('token', data.token);
      // But we store it in an HTTP header and so no client script
      //  can actually access it.
      const ures = await res.json();
      localStorage.setItem('ykyuid', ures.user.userid);
      localStorage.setItem('ykyuname', ures.user.username);

      setCurrentUser({uid: ures.user.userid, uname: ures.user.username});

      router.push('/main');
    }
  };

  const handleUsernameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Image width={300} height={300} className="mx-auto h-12 w-auto" src="/YKY_Pixels.png" alt="logo" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your YKY account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            No account?{" "}
            <Link href={regurl} className="font-medium text-cyan-700 hover:text-cyan-500">
              Sign Up!
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm"
                placeholder="Username"
                value={username}
                onChange={handleUsernameChange}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={handlePasswordChange}
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-700 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
            >
              Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
