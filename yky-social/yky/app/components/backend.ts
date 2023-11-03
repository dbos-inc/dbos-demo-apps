import { NextResponse, NextRequest } from 'next/server';
import { Configuration, DefaultApi } from '@/app/components/client';
import { ResponseError } from '@/app/components/client';
import { getuserid, hasuserid } from './userid';

export { ResponseError } from '@/app/components/client';

const DBOS_SERVER_URL = process.env.DBOS_SERVER_URL || "http://localhost:3000";

export function getAPIServer() : string {return DBOS_SERVER_URL;}

const config = new Configuration({
    basePath: getAPIServer()
})

export const api = new DefaultApi(config);

export async function placeApiRequest<T>(request: NextRequest, func: (bapi: DefaultApi, req: NextRequest, headers: RequestInit) => Promise<T> ) {
  const hdrs = {}

  Object.assign(hdrs, {'Content-Type': 'application/json'});

  if (hasuserid()) {
    Object.assign(hdrs, {'userid' : getuserid()});
  }
  const ri: RequestInit = {headers: hdrs};

  try {
    return NextResponse.json(await func(api, request, ri));
  }
  catch (err) {
    const e = err as ResponseError;
    return NextResponse.json({}, e.response);
  }
}