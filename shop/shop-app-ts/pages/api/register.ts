import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import { backendAddress } from "@/lib/config";

export default async function register(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method Not Allowed
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const bodyParams = { username, password };
    await axios.post(`${backendAddress}/api/register`, bodyParams);
    return res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      console.error(message);
      return res.status(error.response?.status || 500).json({ message });
    } else {
      console.error(error);
      throw error;
    }
  }
}