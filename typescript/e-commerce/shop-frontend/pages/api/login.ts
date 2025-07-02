import { NextApiRequest, NextApiResponse } from 'next';
import { sessionOptions, User } from "@/lib/session";
import { getIronSession } from "iron-session";
import { api } from '@/lib/backend';
import { HttpError, ok } from 'oazapfts';

export default async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession<{user?: User}>(req, res, sessionOptions);
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method Not Allowed
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    await ok(api.login({ username, password }));
    session.user = { username };
    await session.save();
    return res.status(200).json({ message: 'User logged in successfully' });
  } catch (error) {
    if (error instanceof HttpError) {
      console.error(error.message);
      return res.status(error.status).json({ message: error.message })
    } else {
      console.error(error);
      throw error;
    }
  }
}
