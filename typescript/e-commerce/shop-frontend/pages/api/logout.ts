import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import { NextApiRequest, NextApiResponse } from "next";

export default async function logoutRoute(req: NextApiRequest, res: NextApiResponse) {
  const session = await getIronSession(req, res, sessionOptions);
  session.destroy();
  return res.status(200).json({ message: 'Logged out!' });
}