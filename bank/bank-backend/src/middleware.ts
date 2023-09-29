import { MiddlewareContext, OperonResponseError } from "@dbos-inc/operon";
import { koaJwtSecret } from "jwks-rsa";
import Koa from "koa";
import jwt from "koa-jwt";
import logger from "koa-logger";

// If we put these middleware functions in router.ts, txnhistory and accountinfo classes will get undefined middlewares due to circular dependencies.

// eslint-disable-next-line @typescript-eslint/require-await
export async function bankAuthMiddleware(ctx: MiddlewareContext) {
  if (ctx.requiredRole.length > 0) {
    console.log("required role: ", ctx.requiredRole);
    if (!ctx.koaContext) {
      throw new OperonResponseError("No Koa context!");
    } else if (!ctx.koaContext.state.user) {
      throw new OperonResponseError("No authenticated user!", 401);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const authenticatedUser: string = ctx.koaContext.state.user["preferred_username"] ?? "";
    console.log("current user: ", authenticatedUser);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const authenticatedRoles: string[] = ctx.koaContext.state.user["realm_access"]["roles"] ?? [];
    console.log("JWT claimed roles: ", authenticatedRoles);
    if (authenticatedRoles.includes("appAdmin")) {
      // appAdmin role has more priviledges than appUser.
      authenticatedRoles.push("appUser");
    }
    console.log("authenticated roles: ", authenticatedRoles);
    return { authenticatedUser: authenticatedUser, authenticatedRoles: authenticatedRoles };
  }
}

// Custom 401 handling if you don't want to expose koa-jwt errors to users
export function customizeHandle(ctx: Koa.Context, next: Koa.Next) {
  return next().catch((err) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (401 === err.status) {
      ctx.status = 401;
      ctx.body = "Protected resource, use Authorization header to get access\n";
    } else {
      throw err;
    }
  });
}

export const bankJwt = jwt({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  // TODO: We have to read the config from env not from a file, because decorators are loaded before Operon, we must have the variables available during the loading time.
  secret: koaJwtSecret({
    jwksUri: `http://${process.env.BANK_HOST || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos/protocol/openid-connect/certs`,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 600000,
  }),
  // audience: 'urn:api/',
  issuer: `http://${process.env.BANK_HOST || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos`,
});

export const koaLogger = logger();