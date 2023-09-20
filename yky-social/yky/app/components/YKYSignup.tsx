"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
  
const YKYSignup: React.FC = () => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [userName, setUserName] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('Please complete the registration form...');
  
    const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  
    const router = useRouter();
  
    const submitData = async (e: React.SyntheticEvent) => {
      e.preventDefault();
      setIsButtonDisabled(true); // Disable the button during form submission
      try {
        const body = { firstName, lastName, username: userName, password };
        const res = await fetch(`/doregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          router.push('/main/login');
        }
        else {
          setMessage(res.text.toString());
        }
        return;
      } catch (error) {
        console.error(error);
      } finally {
        setIsButtonDisabled(false); // Re-enable the button after form submission
      }
    };
  
    const isIncOrButtonDisabled = () => {
       if (isButtonDisabled) return true;
       return (!userName || !password || !firstName || !lastName);
    };
  
    return (
        <div className="-screen flex items-center justify-center">
          <form onSubmit={submitData} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
              <h1>{message}</h1>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="firstname">First Name</label>
                <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  autoFocus
                  id="firstname"
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                  type="text"
                  value={firstName}
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="lastname">Last Name</label>
                <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  id="lastname"
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  type="text"
                 value={lastName}
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">Userame</label>
                <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  id="username"
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Username"
                  type="text"
                  value={userName}
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">Password</label>
                <input className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  id="password"
                  type="password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  value={password}
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  className={
                    (isIncOrButtonDisabled() ? 'bg-gray-500 cursor-not-allowed text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline' 
                                        : 'bg-cyan-700 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline')
                  }
                  type="submit"
                  disabled={isIncOrButtonDisabled()}
                >
                Register
                </button>
                <Link
                  className="inline-block align-baseline font-bold text-sm text-cyan-500 hover:text-cyan-800"
                  href="/main"
                >
                  Cancel
                </Link>
              </div>
          </form>
        </div>
    );
};
  
export default YKYSignup;