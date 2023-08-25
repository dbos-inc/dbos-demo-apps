/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import "reflect-metadata";
import Koa from 'koa';
import { Context, Next } from 'koa';
import Router from "@koa/router";
import logger from "koa-logger";
import { bodyParser } from "@koa/bodyparser";

import { DataSource, EntityManager } from "typeorm";

import { MediaItem } from "./entity/Media";
import { Post } from "./entity/Post";
import { GraphType, SocialGraph } from "./entity/Graph";
import { RecvType, SendType, TimelineRecv, TimelineSend } from "./entity/Timeline";
import { UserLogin } from "./entity/UserLogin";
import { UserProfile } from "./entity/UserProfile";

import { Operations, ResponseError, errorWithStatus } from "./Operations";
import { Operon, Required, GetApi, APITypes, RequiredRole,
        OperonContext, OperonTransaction, TransactionContext,
        forEachMethod, OperonDataValidationError,
        ArgSource, ArgSources, LogMask, LogMasks, PostApi,
      } from "operon";

import { OperonTransactionFunction } from "operon";

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

class YKY
{
  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi('/')
  static async hello(_ctx: OperonContext) {
    return {message: "Welcome to YKY (Yakky not Yucky)!"};
  }
  static async helloctx(ctx:Context, next: Next) {
    ctx.body = {message: "Welcome to YKY (Yakky not Yucky)!"};
    return next();
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/recvtimeline')
  @RequiredRole(['user'])
  static async receiveTimeline(ctx: TransactionContext) 
  {
    // TODO #3 - is this extra layer really necessary or can the code be inlined here?

    const manager = ctx.typeormEM as unknown as EntityManager;

    const rtl = await Operations.readRecvTimeline(manager, ctx.authUser, [RecvType.POST], true);  // TODO #4 - Integrate typeORM into transaction context
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id, fromUserId:tle.from_user_id, unread:tle.unread, sendDate: tle.send_date, recvType:tle.recv_type,
          postText: tle.post?.text, postMentions: tle.post?.mentions};
    });

    return {message: "Read.", timeline:tl};
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/sendtimeline')
  @RequiredRole(['user'])
  static async sendTimeline(ctx: TransactionContext)
  {
    // TODO: User id and modes
    const userid = ctx.authUser;
    const manager = ctx.typeormEM as unknown as EntityManager;

    const rtl = await Operations.readSendTimeline(manager, userid, userid, [SendType.PM, SendType.POST, SendType.REPOST], true);
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id,  fromUserId:tle.user_id, sendDate: tle.send_date, sendType:tle.send_type,
          postText: tle.post?.text, postMentions: tle.post?.mentions};
    });

    return {message: "Read.", timeline: tl};
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/finduser')
  @RequiredRole(['user'])
  static async findUser(ctx: TransactionContext, @Required findUserName: string) {
    const manager = ctx.typeormEM as unknown as EntityManager;
    const [user, _prof, _gsrc, _gdst] = await Operations.findUser(manager,
      ctx.authUser, findUserName, false, false);
    if (!user) {
      return {message: "No user by that name."};
    }
    else {
      return {message:"User Found.", uid : user.id, name : user.user_name};
    }
  }

  @OperonTransaction({readOnly: true})
  @GetApi("/post/:id")
  @RequiredRole(['user'])
  static async getPost(ctx: TransactionContext, @Required @ArgSource(ArgSources.URL) id: string) {
    // TODO Validate user permissions

    const manager = ctx.typeormEM as unknown as EntityManager;
    const post = await Operations.getPost(manager, ctx.authUser, id);
    if (post) {
      return { message: 'Retrieved.', post:post };
    } else {
      return { message: 'No such post.' };
    }
  }  

  @OperonTransaction({readOnly: true})
  @PostApi("/login")
  @RequiredRole([]) // Don't need any roles to log in
  static async doLogin(ctx: TransactionContext, @Required username: string, @Required @LogMask(LogMasks.HASH) password: string) {
    const manager = ctx.typeormEM as unknown as EntityManager;
    const user = await Operations.logInUser(manager, username, password);
    return { message: 'Successful login.', id:user.id };
  }

  // OK, so the thought here is a browser might call this
  //  and, there is a nonzero chance that it could get resubmit.
  // What do we do then?  It's trying to use a transaction to
  //  protect itself, but it will raise an error.  Should we just
  //  say hey, it's fine, if it all matches?
  // Can this be generalized?
  @PostApi("/register")
  @RequiredRole([]) // No role needed to register
  static async doRegister(ctx: OperonContext, @Required firstName: string, @Required lastName: string,
     @Required username: string, @Required @LogMask(LogMasks.HASH) password: string)
  {
    const user = await operon.transaction(Operations.createUser, {parentCtx: ctx},
       firstName, lastName, username, password);

    return { message: 'User created.', id:user.id };
  }

  @OperonTransaction()
  @PostApi("/follow")
  @RequiredRole(['user'])
  static async doFollow(ctx: TransactionContext, @Required followUid: string) {
    const manager = ctx.typeormEM as unknown as EntityManager;
    const curStatus = await Operations.getGraphStatus(manager, ctx.authUser, followUid);
    await Operations.setGraphStatus(manager, ctx.authUser, followUid, curStatus == GraphType.FRIEND ? GraphType.FOLLOW_FRIEND : GraphType.FOLLOW);
    // TODO: That UID wasn't validated - maybe the DB should validate it

    return {message: "Followed."};
  }

  @OperonTransaction()
  @PostApi("/composepost")
  @RequiredRole(['user'])
  static async doCompose(ctx: TransactionContext, @Required postText: string) {
    const manager = ctx.typeormEM as unknown as EntityManager;
    await Operations.makePost(manager, ctx.authUser, postText);
    return {message: "Posted."};  
  }
}

// Initialize Operon.
export const operon = new Operon({
  poolConfig: {
    user: process.env.POSTGRES_USERNAME,
    database: process.env.POSTGRES_DBNAME,
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.POSTGRES_PORT),
    host: process.env.POSTGRES_HOST,
  },
  telemetryExporters: undefined,
  system_database: 'opsys',
  observability_database: undefined
});

export const kapp = new Koa();

// Start Koa server.
kapp.use(logger());
kapp.use(bodyParser());
//kapp.use(cors());

const router = new Router();

// For now, do it ourselves, but it could be part of the framework...
forEachMethod((m) => {
  if (m.txnConfig) {
    operon.registerTransaction(m.replacementFunction as OperonTransactionFunction<unknown[], unknown>, m.txnConfig);
  }
  if (m.apiURL) {
    const rf = async(ctx: Koa.Context, next:Koa.Next) => {
      // CB: This is an example; it needs to be pluggable
      const { userid } = ctx.request.query;
      const uid = userid?.toString();
      let curRoles = [] as string[];

      // TODO: We really need to validate something, generally it would be a token
      //  Currently the backend is "taking the front-end's word for it"

      if (m.requiredRole.length > 0) {
        if (!uid) {
          const err = errorWithStatus("Not logged in.", 401);
          throw err;
        }
        else {
          curRoles = ['user'];
        }

        let authorized = false;
        const set = new Set(curRoles);
        for (const str of m.requiredRole) {
          if (set.has(str)) {
            authorized = true;
          }
        }
        if (!authorized) {
          const err = errorWithStatus(`User does not have a role with permission to call ${m.name}`, 401);
          throw err;
        }
      }
            
      const c: OperonContext = new OperonContext();
      c.request = ctx.request;
      c.response = ctx.response;
      c.authUser = uid || '';
      c.authRoles = curRoles;

      // Get the arguments
      const args: unknown[] = [];
      m.args.forEach((marg, idx) => {
        if (idx == 0) {
          return; // The context
        }
        if ((m.apiType == APITypes.GET && marg.argSource === ArgSources.DEFAULT)
            || marg.argSource === ArgSources.QUERY)
        {
          // Validating the arg occurs later...
          args.push(ctx.request.query[marg.name]);
        }
        else if ((m.apiType == APITypes.POST && marg.argSource === ArgSources.DEFAULT)
            || marg.argSource === ArgSources.BODY)
        {
          // Validating the arg occurs later...
          if (!ctx.request.body) {
            throw new OperonDataValidationError(`Function ${m.name} requires a method body`);
          }
          args.push(ctx.request.body[marg.name]);
        }
        else if (marg.argSource === ArgSources.URL) {
          // TODO: This should be the default if the name appears in the URL?
          args.push(ctx.params[marg.name]);
        }
      });

      let rv;
      try {
        if (m.txnConfig) {
          // Wait, does it just need the name?!
          rv = await operon.transaction(m.replacementFunction as OperonTransactionFunction<unknown[], unknown>, { parentCtx : c }, ...args);
        }
        else {
          rv = await m.invoke(undefined, [c, ...args]);
        }
        ctx.response.status = 200;
        ctx.response.body = rv;
        await next();
      }
      catch (e) {
        if (e instanceof OperonDataValidationError) {
          ctx.response.status = 400;
          ctx.body = {message: e.message};
          await next();
          return;
        }
        if (e instanceof Error) {
          ctx.response.status = ((e as ResponseError)?.status || 400);
          ctx.body = {message: e.message};
          await next();
          return;
        }
        else {
          // What else
          throw e;
        }
      }
    };
    if (m.apiType === APITypes.GET) {
      router.get(m.apiURL, rf);
    }
    if (m.apiType === APITypes.POST) {
      router.post(m.apiURL, rf);
    }
  }
});

// Example of how to do a route directly in Koa
router.get("/koa", async (ctx, next) => {
  return YKY.helloctx(ctx, next);
});

kapp.use(router.routes()).use(router.allowedMethods());
