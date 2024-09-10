import jwt from 'jsonwebtoken';

import { GetApi, PostApi, HandlerContext, KoaMiddleware } from "@dbos-inc/dbos-sdk";
import { DBOSError } from '@dbos-inc/dbos-sdk/dist/src/error';
import KoaViews from '@ladjs/koa-views';

const JWT_SECRET = process.env['MOCK_OAUTH_SECRET'] || 'your-secret-goes-here';

// http://localhost:8083/realms/dbos/protocol/openid-connect/auth?response_type=code&&scope=openid&client_id=newClient&redirect_uri=http://localhost:8089/

@KoaMiddleware(KoaViews(`${__dirname}/../src/views`, { extension: 'ejs' }))
export class MockAuth
{
  // Render the login page
  @GetApi('/realms/:realm/protocol/openid-connect/auth')
  static async mockAuth(ctx: HandlerContext, realm: string, response_type: string, scope: string, client_id: string, redirect_uri: string) {
    ctx.koaContext.type = 'text/html';
    if (realm !== 'dbos' || scope !== 'openid' || response_type !== 'code') {
      throw new DBOSError("Invalid request to mock auth service.");
    }
    await ctx.koaContext.render('mockauth', {client_id, redirect_uri});
  }

  // Handle login submission
  @PostApi('/login')
  static async doLogin(ctx:HandlerContext, username: string, password: string, client_id: string, redirect_uri: string) {
    // In a real application, you would validate the username and password
    if (username === 'Alice' && password === 'password') {
      //const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '1h' });
      const code = 1;
      ctx.koaContext.redirect(`${redirect_uri}?code=${code}`);
    } else if (username === 'Bob' && password === 'password') {
      const code = 2;
      ctx.koaContext.redirect(`${redirect_uri}?code=${code}`);
    } else if (username === 'Carol' && password === 'password') {
      const code = 100;
      ctx.koaContext.redirect(`${redirect_uri}?code=${code}`);
    } else {
      throw new DBOSError('Invalid credentials', 401);
    }
    return Promise.resolve();
  }

  // Handle token exchange
  @PostApi('/realms/:realm/protocol/openid-connect/token')
  static async getToken(ctx: HandlerContext, code: number){
    let username = "";
    let roles = ["appUser"];
    if (code === 1) {
      username = "Alice";
    }
    else if (code === 2) {
      username = "Bob";
    }
    else if (code === 100) {
      username = "Carol";
      roles = ["appAdmin"];
    }
    else {
      throw new DBOSError("Invalid Authorization Code", 400);
    }
    const accessToken = jwt.sign({ sub: username, preferred_username: username, realm_access: { roles: roles }, type: 'access' }, JWT_SECRET, { expiresIn: '1h' });
    const idToken = jwt.sign({ sub: username, preferred_username: username, realm_access: { roles: roles }, type: 'id' }, JWT_SECRET, { expiresIn: '1h' });
    return Promise.resolve({
      access_token: accessToken,
      id_token: idToken,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }

  // Handle logout; should be POST but GET also OK since we do nothing
  @GetApi('/realms/:realm/protocol/openid-connect/logout')
  @PostApi('/realms/:realm/protocol/openid-connect/logout')
  static async doLogout(_ctx: HandlerContext) {
    return Promise.resolve("Logged Out");
  }
}
