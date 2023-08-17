// this file is a wrapper with defaults to be used in both API routes and `getServerSideProps` functions
import type { IronSessionOptions } from "iron-session";
import { unsealData } from "iron-session";
import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

export const sessionOptions: IronSessionOptions = {
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
    user?: String;
  }
}

/**
 * Can be called in page/layout server component.
 * @param cookies ReadonlyRequestCookies
 * @returns SessionUser or null
 */
export async function getRequestCookie(
  cookies: ReadonlyRequestCookies
): Promise<String | null> {
  const cookieName = process.env.SESSION_COOKIE_NAME as string || "dbos-cookie";
  const found = cookies.get(cookieName);

  if (!found) return null;

  const { user } = await unsealData(found.value, {
    password: process.env.SESSION_COOKIE_PASSWORD as string || "dbos-secure-password-is-very-long-and-secure",
  });

  return user as unknown as String;
}