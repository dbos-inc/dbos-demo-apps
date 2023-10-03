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

import { Operations, errorWithStatus } from "./Operations";
import {
  Operon, Required, GetApi, RequiredRole,
  OperonTransaction, TransactionContext,
  ArgSource, ArgSources, LogMask, LogMasks, PostApi,
  HandlerContext,
  OperonWorkflow,
  WorkflowContext,
  Authentication,
  OperonHttpServer,
  MiddlewareContext,
  DefaultRequiredRole,
  Error,
} from "@dbos-inc/operon";

import { v4 as uuidv4 } from 'uuid';
import { PresignedPost } from '@aws-sdk/s3-presigned-post';

import { S3Client, S3 } from '@aws-sdk/client-s3';

const s3ClientConfig = {
  region: process.env.AWS_REGION || 'us-east-2', // Replace with your AWS region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY || 'x',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'x',
  }
};

const s3Client = new S3Client(s3ClientConfig);
export function getS3Client() {return s3Client;}
const awsS3 = new S3(s3ClientConfig);
export function getS3() {return awsS3;}

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
  "migrations": [],
  "subscribers": [],
});

// eslint-disable-next-line @typescript-eslint/require-await
async function authMiddleware (ctx: MiddlewareContext) {
  if (ctx.requiredRole.length > 0) {
    // TODO: We really need to validate something, generally it would be a token
    //  Currently the backend is "taking the front-end's word for it"
    const { userid } = ctx.koaContext.request.query;
    const uid = userid?.toString();

    if (!uid) {
      const err = new Error.OperonNotAuthorizedError("Not logged in.", 401);
      throw err;
    }
    return {
      authenticatedUser: uid,
      authenticatedRoles: ['user']
    };
  }
}

@Authentication(authMiddleware)
@DefaultRequiredRole(['user'])
export class YKY
{
  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi('/')
  @RequiredRole([])
  static async hello(_ctx: HandlerContext) {
    return {message: "Welcome to YKY (Yakky not Yucky)!"};
  }
  static async helloctx(ctx:Context, next: Next) {
    ctx.body = {message: "Welcome to YKY (Yakky not Yucky)!"};
    return next();
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/recvtimeline')
  static async receiveTimeline(ctx: TransactionContext) 
  {
    const manager = ctx.typeormEM as unknown as EntityManager;

    const rtl = await Operations.readRecvTimeline(manager, ctx.authenticatedUser, [RecvType.POST], true);  // TODO #4 - Integrate typeORM into transaction context
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id, fromUserId:tle.from_user_id, unread:tle.unread, sendDate: tle.send_date, recvType:tle.recv_type,
          postText: tle.post?.text, postMentions: tle.post?.mentions};
    });

    return {message: "Read.", timeline:tl};
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/sendtimeline')
  static async sendTimeline(ctx: TransactionContext)
  {
    // TODO: User id and modes
    const userid = ctx.authenticatedUser;
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
  static async doFindUser(ctx: TransactionContext, @Required findUserName: string) {
    const [user, _prof, _gsrc, _gdst] = await Operations.findUser(ctx,
      ctx.authenticatedUser, findUserName, false, false);
    if (!user) {
      return {message: "No user by that name."};
    }
    else {
      return {message:"User Found.", uid : user.id, name : user.user_name};
    }
  }

  @OperonTransaction({readOnly: true})
  @GetApi("/post/:id")
  static async getPost(ctx: TransactionContext, @Required @ArgSource(ArgSources.URL) id: string) {
    // TODO Validate user permissions

    const manager = ctx.typeormEM as unknown as EntityManager;
    const post = await Operations.getPost(manager, ctx.authenticatedUser, id);
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
  static async doRegister(ctx: HandlerContext, @Required firstName: string, @Required lastName: string,
     @Required username: string, @Required @LogMask(LogMasks.HASH) password: string)
  {
    const user = await ctx.invoke(Operations).createUser(
       firstName, lastName, username, password);

    return { message: 'User created.', id:user.id };
  }

  @OperonTransaction()
  @PostApi("/follow")
  static async doFollow(ctx: TransactionContext, @Required followUid: string) {
    const manager = ctx.typeormEM as unknown as EntityManager;
    const curStatus = await Operations.getGraphStatus(manager, ctx.authenticatedUser, followUid);
    await Operations.setGraphStatus(manager, ctx.authenticatedUser, followUid, curStatus == GraphType.FRIEND ? GraphType.FOLLOW_FRIEND : GraphType.FOLLOW);
    // TODO: That UID wasn't validated - maybe the DB should validate it

    return {message: "Followed."};
  }

  @OperonWorkflow()
  @PostApi("/composepost")
  static async doCompose(ctx: WorkflowContext, @Required postText: string) {
    const post = await ctx.invoke(Operations).makePost(postText);
    // This could be an asynchronous job
    await ctx.invoke(Operations).distributePost(post);
    return {message: "Posted."};
  }

  @GetApi("/getMediaUploadKey")
  @OperonWorkflow()
  static async doKeyUpload(ctx: WorkflowContext, @Required filename: string) {
    const key = `photos/${filename}-${Date.now()}`;
    const bucket = process.env.S3_BUCKET_NAME || 'yky-social-photos';
    const postPresigned = await ctx.invoke(Operations).createS3UploadKey(key, bucket);

    return {message: "Signed URL", url: postPresigned.url, key: key, fields: postPresigned.fields};
  }

  @GetApi("/getMediaDownloadKey")
  static async doKeyDownload(_ctx: HandlerContext, @Required filekey: string) {
    const key = filekey;
    const bucket = process.env.S3_BUCKET_NAME || 'yky-social-photos';
  
    const presignedUrl = await Operations.getS3DownloadKey(key, bucket);
    return { message: "Signed URL", url: presignedUrl, key: key };
  }

  @GetApi("/deleteMedia")
  static async doMediaDelete(ctx: HandlerContext, @Required filekey: string) {
    const key = filekey;
    const bucket = process.env.S3_BUCKET_NAME || 'yky-social-photos';

    // TODO: Validate user and drop from table

    const presignedUrl = await Operations.ensureS3FileDropped(ctx, key, bucket);
    return { message: "Dropped", url: presignedUrl, key: key };
  }

  @GetApi("/startMediaUpload")
  static async doStartMediaUpload(ctx: HandlerContext) {
    const mediaKey = uuidv4();
    const bucket = process.env.S3_BUCKET_NAME || 'yky-social-photos';

    // TODO: Rate limit the user's requests as they start workflows... or we could give the existing workflow if any?

    const fn = `photos/${mediaKey}-${Date.now()}`;
    const wfh = await ctx.invoke(Operations).mediaUpload('profile', mediaKey, fn, bucket);
    const upkey = await ctx.getEvent<PresignedPost>(wfh.getWorkflowUUID(), "uploadkey");
    return {wfHandle: wfh.getWorkflowUUID(), key: upkey, file: fn};
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  @GetApi("/finishMediaUpload")
  static async finishMediaUpload(ctx: HandlerContext, wfid: string) {
    const wfhandle = ctx.retrieveWorkflow(wfid);
    const stat = await wfhandle.getStatus();

    // Validate that the workflow belongs to the user
    if (!stat) {
      errorWithStatus("Upload not in progress", 400);
    }
    if (stat!.authenticatedUser != ctx.authenticatedUser) {
      errorWithStatus("Unable to access workflow", 403);
    }
    // Should we look at status?  What happens if this is a resubmit?
    await ctx.send(wfid, "", "uploadfinish");
    return await wfhandle.getResult();
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
  system_database: 'opsys',
});

export const kapp = new Koa();

// Start Koa server.
kapp.use(logger());
kapp.use(bodyParser());
//kapp.use(cors());

const router = new Router();

export function ykyInit()
{
  OperonHttpServer.registerDecoratedEndpoints(operon, router);
}

// Example of how to do a route directly in Koa
router.get("/koa", async (ctx, next) => {
  return YKY.helloctx(ctx, next);
});

kapp.use(router.routes()).use(router.allowedMethods());
