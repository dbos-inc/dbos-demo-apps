/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/*
export function safeThrow(
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<(req: Request, res: Response, next: NextFunction) => Promise<any>>) {
    const fun = descriptor.value;
    descriptor.value = async function () {
        try {
            await fun.apply(this, arguments);
        } catch (err) {
            arguments[2](err);
        }
    };
}

@safeThrow
private async get(req: Request, res: Response, next: NextFunction) {
  throw { status: 404, message: 'Not supported' }
}
*/

/*
  // Error object used in error handling middleware function
  class AppError extends Error{
      statusCode: number;

      constructor(statusCode: number, message: string) {
        super(message);
    
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = Error.name;
        this.statusCode = statusCode;
        Error.captureStackTrace(this);
      }
  }
 */

import "reflect-metadata";
import Koa from 'koa';
import {Request, Response, Context, Next} from 'koa';
import Router from "@koa/router";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";

import { DataSource } from "typeorm";

import { MediaItem } from "./entity/Media";
import { Post } from "./entity/Post";
import { GraphType, SocialGraph } from "./entity/Graph";
import { RecvType, SendType, TimelineRecv, TimelineSend } from "./entity/Timeline";
import { UserLogin } from "./entity/UserLogin";
import { UserProfile } from "./entity/UserProfile";

import { Operations, ResponseError, errorWithStatus } from "./Operations";
import { GetApi, APITypes, OperonTransaction, TransactionContext, forEachMethod } from "operon";
import { OperonContext } from "operon/dist/src/context";

export const userDataSource = new DataSource({
  "type": "postgres",
  "host": process.env.POSTGRES_HOST,
  "port": Number(process.env.POSTGRES_PORT),
  "username": process.env.POSTGRES_USERNAME,
  "password": process.env.POSTGRES_PASSWORD,
  "database": process.env.POSTGRES_DBNAME,
  "synchronize": true,
  "logging": false,
  "entities": [
    MediaItem,
    Post,
    SocialGraph,
    UserLogin,
    UserProfile,
    TimelineSend,
    TimelineRecv,
  ],
  "migrations": [
     "./migration/**/*.ts"
  ],
  "subscribers": [
     "./subscriber/**/*.ts"
  ],
});

function checkUserId(req : Request, _res : Response) : string {
  const {userid} = req.query;
  if (!userid?.toString()) {
    const err = errorWithStatus("Not logged in.", 401);
    throw err;
  }
  return userid.toString();
}

function handleException(e: unknown, res : Response): void {
  console.log(e);
  if (e instanceof Error) {
    res.status = ((e as ResponseError)?.status || 400);
    res.body = {message: e.message};
  }
  else {
    res.status = 400;
    res.body = {message: "Unknown error occurred."};
  }
}

class YKY
{
  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi('/')
  static async hello(ctx: OperonContext) {
    const res = (ctx.response as Koa.Response);

    res.body = {message: "Welcome to YKY (Yakky not Yucky)!"};
    // TODO is it supposed to be like Koa?
    return;
  }
  static async helloctx(ctx:Context, next: Next) {
    ctx.body = {message: "Welcome to YKY (Yakky not Yucky)!"};
    return next();
    // TODO is it supposed to be like Koa?
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/recvtimeline')
  static async receiveTimeline(ctx: TransactionContext) 
  {
    const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);
  
    try
    {
      const userid = checkUserId(req, res);
  
      // TODO: User id and modes
  
      const rtl = await Operations.readRecvTimeline(userDataSource, userid, [RecvType.POST], true);
      const tl = rtl.map((tle) => {
        return {postId: tle.post_id, fromUserId:tle.from_user_id, unread:tle.unread, sendDate: tle.send_date, recvType:tle.recv_type,
           postText: tle.post?.text, postMentions: tle.post?.mentions};
      });
      
      res.status = (200);
      res.body = {message: "Read.", timeline:tl};
    }
    catch(e) {
      handleException(e, res);
    }
  }
}

// Start Koa server.
export const kapp = new Koa();
kapp.use(logger());
kapp.use(bodyParser());
//kapp.use(cors());

const router = new Router();

// For now, do it ourselves, but it could be part of the framework...
forEachMethod((m) => {
  if (m.apiURL) {
    if (m.apiType === APITypes.GET) {
      router.get(m.apiURL, async(ctx, next) => {
        const c: OperonContext = new OperonContext();
        c.request = ctx.request;
        c.response = ctx.response;
        const rv = await m.invoke(undefined, [c]);
        await next();
        return rv;
      });
    }
  }
});

// Do we have need to do a special Koa route?
router.get("/koa", async (ctx, next) => {
  return YKY.helloctx(ctx, next);
});

// OK, so the thought here is a browser might call this
//  and, there is a nonzero chance that it could get resubmit.
// What do we do then?  It's trying to use a transaction to
//  protect itself, but it will raise an error.  Should we just
//  say hey, it's fine, if it all matches?
// Can this be generalized?
router.post("/register", async (ctx, next) => {
    const req = ctx.request;
    const res = ctx.response;
    console.log("Register: "+req.body.username+"-"+req.body.password);

    try {
      const user = await Operations.createUser(userDataSource,
        req.body.firstName, req.body.lastName, req.body.username, req.body.password);

      res.status = 200;
      res.body = { message: 'User created.', id:user.id };
    }
    catch(e)
    {
      handleException(e, res);
    }

    await next();
});

/*
// Retrieve all users
// TODO: respect block lists, etc
app.get("/users", async (req, res) => {
    const userRepository = userDataSource.getRepository(UserLogin);
    const users = await userRepository.find();
    res.json(users);
});
*/

router.post("/login", async (ctx, next) => {
  const req = ctx.request;
  const res = ctx.response;

  try {
    const user = await Operations.logInUser(userDataSource, req.body.username, req.body.password);
    res.status = 200;
    res.body = {message: 'Successful login.', id:user.id};
  }
  catch(e) {
    handleException(e, res);
  }
  await next();
});

router.get("/finduser", async (ctx, next) => {
  const req = ctx.request;
  const res = ctx.response;

  try {
    const userid = checkUserId(req, res);

    const {findUserName} = req.query;
    if (!findUserName?.toString()) {
      throw errorWithStatus("Parameter missing.", 400);
    }

    const [user, _prof, _gsrc, _gdst] = await Operations.findUser(userDataSource, userid, findUserName.toString(), false, false);

    if (!user) {
      res.status = 200;
      res.body = {message: "No user by that name."};
    }
    else {
      res.status = 200;
      res.body = {message:"User Found.", uid : user.id, name : user.user_name};
    }
  }
  catch(e) {
    handleException(e, res);
  }

  await next();
});

router.get("/post/:id", async (ctx, next) => {
  const req = ctx.request;
  const res = ctx.response;

  //console.log("Get post "+req.params.id);
  try
  {
    const userid = checkUserId(req, res);

    // TODO Validate user permissions

    const post = await Operations.getPost(userDataSource, userid.toString(), ctx.params.id);
    if (post) {
      res.status = 200;
      res.body = {message: 'Retrieved.', post:post};
    } else {
      res.status = 404;
      res.body = {message: 'No such post.'};
    }
  }
  catch(e) {
    handleException(e, res);
  }

  await next();
});

router.post("/follow", async (ctx, next) => {
  const req = ctx.request;
  const res = ctx.response;

  try
  {
    const userid = checkUserId(req, res);

    const curStatus = await Operations.getGraphStatus(userDataSource, userid, req.body.follwUid);
    await Operations.setGraphStatus(userDataSource, userid, req.body.followUid, curStatus == GraphType.FRIEND ? GraphType.FOLLOW_FRIEND : GraphType.FOLLOW);
    // TODO: That UID wasn't validated - maybe the DB should validate it
    res.status = (200);
    res.body = {message: "Followed."};
  }
  catch(e) {
    handleException(e, res);
  }

  await next();
});

router.post("/composepost", async (ctx, next) => {
  const req = ctx.request;
  const res = ctx.response;
  
  try
  {
    const userid = checkUserId(req, res);
    if (!req.body.postText) {
      res.status = (400);
      res.body = {message: "Post text is required"};
      return;
    }

    await Operations.makePost(userDataSource, userid, req.body.postText);
    res.status = (200);
    res.body = {message: "Posted."};
  }
  catch(e) {
    handleException(e, res);
  }

  await next();
});

router.get("/sendtimeline", async (ctx, next) => {
  const req = ctx.request;
  const res = ctx.response;

  try
  {
    // TODO: User id and modes
    const userid = checkUserId(req, res);

    const rtl = await Operations.readSendTimeline(userDataSource, userid, userid, [SendType.PM, SendType.POST, SendType.REPOST], true);
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id,  fromUserId:tle.user_id, sendDate: tle.send_date, sendType:tle.send_type,
         postText: tle.post?.text, postMentions: tle.post?.mentions};
    });

    res.status = (200);
    res.body = ({message: "Read.", timeline: tl});
  }
  catch(e) {
    handleException(e, res);
  }

  await next();
});

/*
  // Custom 401 handling if you don't want to expose koa-jwt errors to users
  app.use(function(ctx, next){
    return next().catch((err) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (401 === err.status) {
        ctx.status = 401;
        ctx.body = 'Protected resource, use Authorization header to get access\n';
      } else {
        throw err;
      }
    });
  });

  app.use(jwt({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    secret: koaJwtSecret({
      jwksUri: `http://${operon.config.poolConfig.host || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000
    }),
    // audience: 'urn:api/',
    issuer: `http://${operon.config.poolConfig.host || "localhost"}:${process.env.AUTH_PORT || "8083"}/realms/dbos`
  }));

  const authorizedRolesRoutes = {
    'appUser': [
      '/',
    ],
    'appAdmin': [
      '/api/admin_greeting',
    ]
  };

  // Authorization MW
  app.use(async (ctx, next) => {
    // First, retrieve the claimed roles from the token
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const token = ctx.state.user;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    if (!has(token, 'realm_access.roles')) {
      ctx.status = 401;
      ctx.body = 'User has no claimed role';
      console.log('User has no claimed role');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const roleClaims = get(token, 'realm_access.roles');

    // Hardcode a priority logic: appAdmin > appUser > public
    let authorizedRoutes: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    if (roleClaims.includes('appAdmin')) {
      authorizedRoutes = authorizedRoutes.concat(authorizedRolesRoutes['appAdmin']);
      authorizedRoutes = authorizedRoutes.concat(authorizedRolesRoutes['appUser']);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    } else if (roleClaims.includes('appUser')) {
      authorizedRoutes = authorizedRoutes.concat(authorizedRolesRoutes['appUser']);
    }

    // Now check that the target path is authorized
    const targetPath: string = ctx.request.path;
    if (!targetPath.includes("list_accounts") && !targetPath.includes("transaction_history") && !authorizedRoutes.includes(targetPath)) {
      ctx.status = 401;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ctx.body = `User ${token.preferred_username} is not authorized to access ${targetPath}`;
      console.log(token);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(`User ${token.preferred_username} is not authorized to access ${targetPath}`);
      return;
    }
    return next();
  });

}
*/

kapp.use(router.routes()).use(router.allowedMethods());
