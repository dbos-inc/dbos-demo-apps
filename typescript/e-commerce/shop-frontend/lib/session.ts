// this file is a wrapper with defaults to be used in both API routes and `getServerSideProps` functions
import type { SessionOptions } from "iron-session";

export interface User {
  username: string;
}

export const sessionOptions: SessionOptions = {
  cookieName: process.env.SESSION_COOKIE_NAME as string || "dbos-cookie",
  password: process.env.SESSION_COOKIE_PASSWORD as string || "dbos-secure-password-is-very-long-and-secure",
  // secure: true should be used in production (HTTPS) but can't be used in development (HTTP)
  cookieOptions: {
      secure: false,
  },
};

// This is where we specify the typings of req.session.*
declare module "iron-session" {
  interface IronSessionData {
    user?: User;
  }
}
