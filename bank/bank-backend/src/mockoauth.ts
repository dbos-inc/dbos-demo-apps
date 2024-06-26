import jwt from 'jsonwebtoken';

import { GetApi, PostApi, HandlerContext, KoaMiddleware } from "@dbos-inc/dbos-sdk";
import { DBOSError } from '@dbos-inc/dbos-sdk/dist/src/error';
import KoaViews from '@ladjs/koa-views';

const JWT_SECRET = 'your-secret';

// http://localhost:8083/realms/dbos/protocol/openid-connect/auth?response_type=code&&scope=openid&client_id=newClient&redirect_uri=http://localhost:8089/

@KoaMiddleware(KoaViews(`${__dirname}/views`, { extension: 'ejs' }))
export class MockAuth
{
  @GetApi('/realms/:realm/protocol/openid-connect/auth')
  static async mockAuth(ctx: HandlerContext, realm: string, response_type: string, scope: string, client_id: string, redirect_uri: string) {
    ctx.koaContext.type = 'text/html';
    if (realm !== 'dbos' || scope !== 'openid' || response_type !== 'code') {
      throw new DBOSError("Invalid request to mock auth service.");
    }
    await ctx.koaContext.render('mockauth', {client_id, redirect_uri, scope});
  }

  @PostApi('/login')
  static async doLogin(ctx:HandlerContext, username: string, password: string, client_id: string, redirect_uri: string) {
    // In a real application, you would validate the username and password
    if (username === 'user' && password === 'password') {
      const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '1h' });
      ctx.koaContext.redirect(`${redirect_uri}?code=${token}`);
    } else {
      throw new DBOSError('Invalid credentials', 401);
    }
    return Promise.resolve();
  }
}