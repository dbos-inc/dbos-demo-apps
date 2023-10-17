/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import "reflect-metadata";
import { Context, Next } from 'koa';

import { EntityManager } from "typeorm";

import { MediaItem } from "./entity/Media";
import { Post } from "./entity/Post";
import { GraphType, SocialGraph } from "./entity/Graph";
import { RecvType, SendType, TimelineRecv, TimelineSend } from "./entity/Timeline";
import { UserLogin } from "./entity/UserLogin";
import { UserProfile } from "./entity/UserProfile";

import { Operations, errorWithStatus } from "./YKYOperations";
import {
  ArgRequired, GetApi, RequiredRole,
  OperonTransaction, TransactionContext,
  ArgSource, ArgSources, LogMask, LogMasks, PostApi,
  HandlerContext,
  OperonWorkflow,
  OperonContext,
  WorkflowContext,
  Authentication,
  MiddlewareContext,
  DefaultRequiredRole,
  Error,
  OrmEntities,
} from "@dbos-inc/operon";

import { v4 as uuidv4 } from 'uuid';
import { PresignedPost } from '@aws-sdk/s3-presigned-post';

import { S3Client, S3 } from '@aws-sdk/client-s3';

function getS3Config(ctx: OperonContext) {
  let s3r = ctx.getConfig('aws_s3_region') as string;
  if (!s3r) {
    s3r = process.env.AWS_REGION || 'us-east-2';
  }
  let s3k = ctx.getConfig('aws_s3_access_key') as string;
  if (!s3k) {
    s3k = process.env.AWS_ACCESS_KEY || 'x';
  }
  let s3s = ctx.getConfig('aws_s3_access_secret') as string;
  if (!s3s) {
    s3s = process.env.AWS_SECRET_ACCESS_KEY || 'x';
  }
  return {
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY || 'x',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'x',
    }
  };
}

let s3Client: S3Client | undefined = undefined;
let awsS3: S3 | undefined = undefined;
export function getS3Client(ctx: OperonContext) {
  if (s3Client) return s3Client;
  s3Client = new S3Client(getS3Config(ctx));
  return s3Client;
}
export function getS3(ctx: OperonContext) {
  if (awsS3) return awsS3;
  awsS3 = new S3(getS3Config(ctx));
  return awsS3;
}

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
@OrmEntities([
  MediaItem,
  Post,
  SocialGraph,
  UserLogin,
  UserProfile,
  TimelineSend,
  TimelineRecv,
])
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
  static async receiveTimeline(ctx: TransactionContext<EntityManager>) 
  {
    const rtl = await Operations.readRecvTimeline(ctx, ctx.authenticatedUser, [RecvType.POST], true);
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id, fromUserId:tle.from_user_id, unread:tle.unread, sendDate: tle.send_date, recvType:tle.recv_type,
          postText: tle.post?.text, postMentions: tle.post?.mentions};
    });

    return {message: "Read.", timeline:tl};
  }

  @OperonTransaction({readOnly: true})
  @GetApi('/sendtimeline')
  static async sendTimeline(ctx: TransactionContext<EntityManager>)
  {
    const userid = ctx.authenticatedUser;

    const rtl = await Operations.readSendTimeline(ctx, userid, userid, [SendType.PM, SendType.POST, SendType.REPOST], true);
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id,  fromUserId:tle.user_id, sendDate: tle.send_date, sendType:tle.send_type,
          postText: tle.post?.text, postMentions: tle.post?.mentions};
    });

    return {message: "Read.", timeline: tl};
  }

  @GetApi('/finduser')
  static async doFindUser(ctx: HandlerContext, findUserName: string) {
    const [user, _prof, _gsrc, _gdst] = await ctx.invoke(Operations).findUser(
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
  static async getPost(ctx: TransactionContext<EntityManager>, @ArgRequired @ArgSource(ArgSources.URL) id: string) {
    // Future: Validate user relationship to poster for non-public posts; not blocked from seeing the post

    const post = await Operations.getPost(ctx, ctx.authenticatedUser, id);
    if (post) {
      return { message: 'Retrieved.', post:post };
    } else {
      return { message: 'No such post.' };
    }
  }

  @OperonTransaction({readOnly: true})
  @PostApi("/login")
  @RequiredRole([]) // Don't need any roles to log in
  static async doLogin(ctx: TransactionContext<EntityManager>, @ArgRequired username: string, @ArgRequired @LogMask(LogMasks.HASH) password: string) {
    const user = await Operations.logInUser(ctx, username, password);
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
  static async doRegister(ctx: HandlerContext, firstName: string, lastName: string,
     username: string, @LogMask(LogMasks.HASH) password: string)
  {
    const user = await ctx.invoke(Operations).createUser(
       firstName, lastName, username, password);

    return { message: 'User created.', id:user.id };
  }

  @OperonTransaction()
  @PostApi("/follow")
  static async doFollow(ctx: TransactionContext<EntityManager>, followUid: string) {
    const curStatus = await Operations.getGraphStatus(ctx, ctx.authenticatedUser, followUid);
    await Operations.setGraphStatus(ctx, ctx.authenticatedUser, followUid, curStatus == GraphType.FRIEND ? GraphType.FOLLOW_FRIEND : GraphType.FOLLOW);
    // TODO: That UID wasn't validated - maybe the DB should validate it

    return {message: "Followed."};
  }

  @OperonWorkflow()
  @PostApi("/composepost")
  static async doCompose(ctx: WorkflowContext, @ArgRequired postText: string) {
    const post = await ctx.invoke(Operations).makePost(postText);
    // This could be an asynchronous job
    await ctx.invoke(Operations).distributePost(post);
    return {message: "Posted."};
  }

  @GetApi("/getMediaUploadKey")
  @OperonWorkflow()
  static async doKeyUpload(ctx: WorkflowContext, filename: string) {
    const key = `photos/${filename}-${Date.now()}`;
    const bucket = ctx.getConfig('S3_BUCKET_NAME') as string || 'yky-social-photos';
    const postPresigned = await ctx.invoke(Operations).createS3UploadKey(key, bucket);

    return {message: "Signed URL", url: postPresigned.url, key: key, fields: postPresigned.fields};
  }

  @GetApi("/getMediaDownloadKey")
  static async doKeyDownload(ctx: HandlerContext, filekey: string) {
    const key = filekey;
    const bucket = ctx.getConfig('S3_BUCKET_NAME') as string || 'yky-social-photos';
  
    const presignedUrl = await Operations.getS3DownloadKey(ctx, key, bucket);
    return { message: "Signed URL", url: presignedUrl, key: key };
  }

  @GetApi("/deleteMedia")
  static async doMediaDelete(ctx: HandlerContext, filekey: string) {
    const key = filekey;
    const bucket = ctx.getConfig('S3_BUCKET_NAME') as string || 'yky-social-photos';

    // TODO: Validate user and drop from table

    const presignedUrl = await Operations.ensureS3FileDropped(ctx, key, bucket);
    return { message: "Dropped", url: presignedUrl, key: key };
  }

  @GetApi("/startMediaUpload")
  static async doStartMediaUpload(ctx: HandlerContext) {
    const mediaKey = uuidv4();
    const bucket = ctx.getConfig('S3_BUCKET_NAME') as string || 'yky-social-photos';

    // Future: Rate limit the user's requests as they start workflows...
    //   Or give the user the existing workflow, if any

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

  @GetApi("/getProfilePhoto")
  static async getProfilePhoto(ctx: HandlerContext) {
    const filekey = await ctx.invoke(Operations).getMyProfilePhotoKey(ctx.authenticatedUser);
    if (filekey === null) return {};

    const bucket = ctx.getConfig('S3_BUCKET_NAME') as string || 'yky-social-photos';
  
    const presignedUrl = await Operations.getS3DownloadKey(ctx, filekey, bucket);
    ctx.logger.debug("Giving URL "+presignedUrl);
    return { message: "Signed URL", url: presignedUrl, key: filekey };
  }
}

