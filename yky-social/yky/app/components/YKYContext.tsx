'use client';

import { createContext, useContext, useState } from 'react';

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
      throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
  };
  
export const useUserLogin = (): UserContextType => {
    const context = useContext(CurrentUserContext);
    if (context === undefined) {
      throw new Error('useUserLogin must be used within a ThemeProvider');
    }
    return context;
  };