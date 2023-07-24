import { NextApiRequest, NextApiResponse } from 'next';
import { Pool } from 'pg';
import { sessionOptions } from "@/lib/session";
import bcrypt from 'bcrypt';
import { withIronSessionApiRoute } from "iron-session/next";

// Create Postgres connection
const pool = new Pool({
    user: 'shop',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: 'shop',
    password: 'shop',
    port: 5432,
});

export async function loginRoute(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Method Not Allowed
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    // Fetch the user by username
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Verify password
    const user = result.rows[0];
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // At this point, the user is authenticated.
    req.session.user = username;
    await req.session.save();
    return res.status(200).json({ message: 'User logged in successfully' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export default withIronSessionApiRoute(loginRoute, sessionOptions);