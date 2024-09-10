'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type CurUserLogin = {
    uid : string | undefined;
    uname : string | undefined;
};

export type ThemeContextType = {
    currentTheme : string;
    setCurrentTheme: React.Dispatch<React.SetStateAction<string>>;
};

export type UserContextType = {
    currentUser : CurUserLogin;
    setCurrentUser: React.Dispatch<React.SetStateAction<CurUserLogin>>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const CurrentUserContext = createContext<UserContextType | undefined>(undefined);

export default function YKYContextProviders({
    children, // will be a page or nested layout
  }: {
    children: React.ReactNode
  })
{
    const [currentUser, setCurrentUser] = useState<CurUserLogin>({uid:undefined, uname:undefined});
    const [currentTheme, setCurrentTheme] = useState<string>("");

    useEffect(() => {
      setCurrentUser({uid:localStorage.getItem('ykyuid') || undefined, uname:localStorage.getItem('ykyuname') || undefined});

      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'ykyuid') {
          setCurrentUser({uid: e.newValue || undefined, uname: currentUser.uname});
        }
        if (e.key === 'ykyuname') {
          setCurrentUser({uid: currentUser.uid || undefined, uname: e.newValue || undefined});
        }
      };
    
      window.addEventListener('storage', handleStorageChange);
    
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }, []);

    return (
      <ThemeContext.Provider value={{currentTheme, setCurrentTheme}}>
        <CurrentUserContext.Provider
          value={{
            currentUser,
            setCurrentUser
          }}
        >
          {children}
        </CurrentUserContext.Provider>
      </ThemeContext.Provider>
    );
}

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
      throw new Error('useTheme must be used within a ThemeContext');
    }
    return context;
  };
  
export const useUserLogin = (): UserContextType => {
    const context = useContext(CurrentUserContext);
    if (context === undefined) {
      throw new Error('useUserLogin must be used within a CurrentUserContext');
    }
    return context;
  };