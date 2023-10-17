import { NextRequest, NextResponse } from 'next/server';

import jwt from "jsonwebtoken";

import { getAPIServer } from '@/app/components/backend';

interface User {
    username: string;
    userid: string;
}

// You should really not use the fallback and perhaps
// throw an error if this value is not set!
const JWT_TOKEN_KEY = process.env.JWT_TOKEN_KEY || "super duper secret key";

const cookieOptions = {
  httpOnly: true,
  maxAge: 2592000,
  path: "/",
  sameSite: "Strict",
  secure: process.env.NODE_ENV === "production",
};

function setCookie(
  res: NextResponse,
  name: string,
  value: string,
  options: Record<string, unknown> = {}
): void {
  const stringValue =
    typeof value === "object" ? `j:${JSON.stringify(value)}` : String(value);

  res.cookies.set(name, String(stringValue), options);
}

// This sets the cookie on a NextApiResponse so we can authenticate
// users on API routes.
function authenticateUser(res: NextResponse, user: User): void {
  if (!user) return;

  const token = jwt.sign({ username: user.username, userid: user.userid }, JWT_TOKEN_KEY, {
    expiresIn: "1d",
  });

  setCookie(res, "auth", token, cookieOptions);
}

// This removes the auth cookie, effectively logging out
// the user.
function clearUser(res: NextResponse): void {
    res.cookies.delete("auth");
}

export async function POST(request: NextRequest) {
  const rqdata = await request.json();

  const res = await fetch(getAPIServer() + '/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rqdata),
  });
 
  if (res.ok) {
    const data = await res.json();
    const user = {userid: data.id, username: rqdata.username};
    const nres = NextResponse.json({ user : user}, {status: res.status});
    authenticateUser(nres, user);
    return nres;
  }
  else {
    // TODO Better message?
    return NextResponse.json({ error: "Error" }, { status:res.status });
  }
}

export function DELETE(_request: NextRequest) {
    const res = NextResponse.json("");
    clearUser(res);
    return res;
}
