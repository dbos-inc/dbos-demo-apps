import { NextApiRequest, NextApiResponse } from 'next';
import { api } from '@/lib/backend';
import { HttpError, ok } from 'oazapfts';

export default async function register(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method Not Allowed
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    await ok(api.register( { username, password } ));
    return res.status(201).json({ message: 'User created successfully' });
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
