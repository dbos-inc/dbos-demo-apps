const DBOS_SERVER_URL = process.env.DBOS_SERVER_URL || "http://localhost:3000";

export function getAPIServer() : string {return DBOS_SERVER_URL;}