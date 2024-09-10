export const environment = {
  // Put a list of actual bank servers here.
  bankHosts: ['http://localhost:8081', 'http://localhost:8083'],
  authUrl: `http://localhost:8081/realms/dbos/protocol/openid-connect`,
  //bankHosts: ['https://<your bank a>.cloud.dbos.dev', 'https://<your bank b>.cloud.dbos.dev'],
  //authUrl: `https://<your bank a>.cloud.dbos.dev/realms/dbos/protocol/openid-connect`,
  redirectUrl: "http://localhost:8089/"
}
