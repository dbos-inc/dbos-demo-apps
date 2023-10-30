import { Configuration, DefaultApi } from '@/app/components/client'

const DBOS_SERVER_URL = process.env.DBOS_SERVER_URL || "http://localhost:3000";

export function getAPIServer() : string {return DBOS_SERVER_URL;}

const config = new Configuration({
    basePath: getAPIServer()
})

export const api = new DefaultApi(config);
