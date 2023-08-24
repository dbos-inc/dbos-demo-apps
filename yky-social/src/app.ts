/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import "reflect-metadata";
import Koa from 'koa';
import { Request, Response, Context, Next } from 'koa';
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
import { Operon, Required, GetApi, APITypes, OperonContext, OperonTransaction, TransactionContext, forEachMethod, OperonDataValidationError } from "operon";

import { OperonTransactionFunction } from "operon";
import { ArgSource, ArgSources, LogMask, LogMasks, PostApi } from "operon/dist/src/decorators";

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
    const req = (ctx.request as Koa.Request);  // TODO #1 - make this typed (or better, get rid of it).
    const res = (ctx.response as Koa.Response);
  
    const userid = checkUserId(req, res); // TODO #2 - make this declarative

    // TODO #3 - is this extra layer really necessary or can the code be inlined here?
    const rtl = await Operations.readRecvTimeline(userDataSource, userid, [RecvType.POST], true);  // TODO #4 - Integrate typeORM into transaction context
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id, fromUserId:tle.from_user_id, unread:tle.unread, sendDate: tle.send_date, recvType:tle.recv_type,
          postText: tle.post?.text, postMentions: tle.post?.mentions};
    });

    // TODO #5 - would it be better as a return value?
    res.status = (200);
    res.body = {message: "Read.", timeline:tl};
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/sendtimeline')
  static async sendTimeline(ctx: TransactionContext)
  {
    const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);

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

  @OperonTransaction({readOnly: true})
  @GetApi('/finduser')
  static async findUser(ctx: TransactionContext, @Required findUserName: string) {
    const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);
  
    const userid = checkUserId(req, res);

    const [user, _prof, _gsrc, _gdst] = await Operations.findUser(userDataSource, userid, findUserName, false, false);

    if (!user) {
      res.status = 200;
      res.body = {message: "No user by that name."};
    }
    else {
      res.status = 200;
      res.body = {message:"User Found.", uid : user.id, name : user.user_name};
    }
  }

  @OperonTransaction({readOnly: true})
  @GetApi("/post/:id")
  static async getPost(ctx: TransactionContext, @Required @ArgSource(ArgSources.URL) id: string) {
    const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);

    //console.log("Get post "+req.params.id);
    const userid = checkUserId(req, res);

    // TODO Validate user permissions

    const post = await Operations.getPost(userDataSource, userid.toString(), id);
    if (post) {
      res.status = 200;
      res.body = { message: 'Retrieved.', post:post };
    } else {
      res.status = 404;
      res.body = { message: 'No such post.' };
    }
  }  

  @OperonTransaction({readOnly: true})
  @PostApi("/login")
  static async doLogin(ctx: TransactionContext, @Required username: string, @Required @LogMask(LogMasks.HASH) password: string) {
    //const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);
  
    const user = await Operations.logInUser(userDataSource, username, password);
    res.status = 200;
    res.body = { message: 'Successful login.', id:user.id };
  }

  // OK, so the thought here is a browser might call this
  //  and, there is a nonzero chance that it could get resubmit.
  // What do we do then?  It's trying to use a transaction to
  //  protect itself, but it will raise an error.  Should we just
  //  say hey, it's fine, if it all matches?
  // Can this be generalized?
  @OperonTransaction()
  @PostApi("/register")
  static async doRegister(ctx: TransactionContext, @Required firstName: string, @Required lastName: string,
     @Required username: string, @Required @LogMask(LogMasks.HASH) password: string)
  {
    //const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);

    const user = await Operations.createUser(userDataSource,
      firstName, lastName, username, password);

    res.status = 200;
    res.body = { message: 'User created.', id:user.id };
  }

  @OperonTransaction()
  @PostApi("/follow")
  static async doFollow(ctx: TransactionContext, @Required followUid: string) {
    const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);
  
    const userid = checkUserId(req, res);

    const curStatus = await Operations.getGraphStatus(userDataSource, userid, followUid);
    await Operations.setGraphStatus(userDataSource, userid, req.body.followUid, curStatus == GraphType.FRIEND ? GraphType.FOLLOW_FRIEND : GraphType.FOLLOW);
    // TODO: That UID wasn't validated - maybe the DB should validate it
    res.status = (200);
    res.body = {message: "Followed."};
  }

  @OperonTransaction()
  @PostApi("/composepost")
  static async doCompose(ctx: TransactionContext, @Required postText: string) {
    const req = (ctx.request as Koa.Request);
    const res = (ctx.response as Koa.Response);
    
    const userid = checkUserId(req, res);
  
    await Operations.makePost(userDataSource, userid, postText);
    res.status = (200);
    res.body = {message: "Posted."};  
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
      const c: OperonContext = new OperonContext();
      c.request = ctx.request;
      c.response = ctx.response;

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
        await next();
        return rv;
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
