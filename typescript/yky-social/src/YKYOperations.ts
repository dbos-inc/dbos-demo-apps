import bcryptjs from 'bcryptjs';

import { EntityManager, In } from 'typeorm';

//import { MediaItem } from "./entity/Media";
import { GraphType, SocialGraph } from "./entity/Graph";
import { Post, PostType } from './entity/Post';
import { TimelineRecv, TimelineSend, SendType, RecvType } from "./entity/Timeline";
import { UserLogin } from "./entity/UserLogin";
import { UserProfile } from './entity/UserProfile';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost, PresignedPost } from '@aws-sdk/s3-presigned-post';

import { getS3, getS3Client } from './app';

import {
 DBOSContext,
 Communicator,
 CommunicatorContext,
 Transaction,
 TransactionContext,
 SkipLogging,
 RequiredRole,
 DefaultRequiredRole,
 Workflow,
 WorkflowContext,
} from '@dbos-inc/dbos-sdk';
import { MediaItem, MediaUsage } from './entity/Media';

export interface ResponseError extends Error {
    status?: number;
}
export function errorWithStatus(msg: string, st: number) : ResponseError
{
    const err = new Error(msg) as ResponseError;
    err.status = st;
    return err;
}

async function comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
  const isMatch = await bcryptjs.compare(password, hashedPassword);
  return isMatch;
}

type ORMTC = TransactionContext<EntityManager>;

@DefaultRequiredRole(['user'])
export class Operations
{

@Transaction()
@RequiredRole([])
static async createUser(ctx: ORMTC, first:string, last:string, uname:string, @SkipLogging hashpass:string) :
   Promise<UserLogin>
{
    const manager = ctx.client;

    if (!first || !last || !uname || !hashpass) {
        throw errorWithStatus(`Invalid user name or password: ${first}, ${last}, ${uname}, ${hashpass}`, 400);
    }

    const user = new UserLogin();
    user.first_name = first;
    user.last_name = last;
    user.user_name = uname;

    user.password_hash = hashpass;

    const existingUser = await manager.findOneBy(UserLogin, {
        user_name: user.user_name,
    });
    if (existingUser) {
        throw errorWithStatus("User already exists.", 400);
    }
    return await manager.save(user);
}

static async logInUser(ctx: ORMTC, uname:string, pass:string) :
   Promise<UserLogin>
{
    const userRep = ctx.client.getRepository(UserLogin);
    const existingUser = await userRep.findOneBy({
        user_name: uname,
    });
    if (!existingUser || !await comparePasswords(pass, existingUser.password_hash)) {
      throw errorWithStatus("Incorrect username or password.", 401);
    }

    return existingUser;
}

static async logInUserId(ctx: ORMTC, uname:string, pass:string) :
   Promise<string>
{
    const userRep = ctx.client.getRepository(UserLogin);
    const existingUser = await userRep.findOneBy({
        user_name: uname,
    });
    if (!existingUser || !existingUser.id || !await comparePasswords(pass, existingUser.password_hash)) {
      throw errorWithStatus("Incorrect username or password.", 401);
    }

    return existingUser.id;
}

static async getMyProfile(ctx: ORMTC, curUid:string) :
   Promise<UserProfile | null>
{
    const upRep = ctx.client.getRepository(UserProfile);
    return upRep.findOneBy({id: curUid});
}

@Transaction({readOnly: true})
@RequiredRole([])
static async getMyProfilePhotoKey(ctx: ORMTC, curUid:string) :
   Promise<string | null>
{
    const mRep = ctx.client.getRepository(MediaItem);
    ctx.logger.debug(`Doing profile photo get for ${curUid}`);
    const mi = await mRep.findOneBy({owner_id: curUid, media_usage: MediaUsage.PROFILE});
    if (!mi) {
        ctx.logger.debug(`Photo get for ${curUid} got nothing`);
        return null;
    }
    ctx.logger.debug(`Photo get for ${curUid} got ${mi.media_url}`);
    return mi.media_url;
}

static async getPost(ctx: ORMTC, _curUid: string, post:string) :
   Promise<Post | null>
{
    const pRep = ctx.client.getRepository(Post);
    const res = pRep.findOne({
        where: {id: post},
        relations: {
            authorUser: true,
        }});
    return res;
}

//
// Returns other user's login, profile (if requested), our listing for his status, and his for us
@Transaction({readOnly: true})
static async findUser(ctx: ORMTC, curUid:string, uname:string, getProfile:boolean, getStatus: boolean) :
   Promise<[UserLogin?, UserProfile?, GraphType?, GraphType?]>
{
    const manager = ctx.client;
    const userRep = manager.getRepository(UserLogin);
    const otherUser = await userRep.findOneBy({
        user_name: uname,
    });
    if (!otherUser) {
        return [undefined, undefined, undefined, undefined];
    }

    // Check to see if we're blocked
    const sgRep = manager.getRepository(SocialGraph);
    const rGraph = await sgRep.findOneBy({
        src_id: otherUser.id, tgt_id: curUid
    });
    if (rGraph && rGraph.link_type === GraphType.BLOCK) {
        return [undefined, undefined, undefined, undefined];
    }

    let sgtype : GraphType = GraphType.NONE;
    let tgtype : GraphType = GraphType.NONE;
    if (rGraph) {
        tgtype = rGraph.link_type;
    }

    if (getStatus) {
        const graph = await sgRep.findOneBy({
            tgt_id: otherUser.id, src_id: curUid
        });
        if (graph) {
            sgtype = graph.link_type;
        }
    }

    let profile : UserProfile | undefined = undefined;

    if (getProfile) {
        const upRep = manager.getRepository(UserProfile);
        const up = await upRep.findOneBy({id: otherUser.id});

        // Future: If we're not friends, we could strip part of this out based on public/private preferences
        if (up) {
            profile = up;
        }
    }

    return [otherUser, profile, sgtype, tgtype];
}

static async getGraphStatus(ctx: ORMTC, curUid : string, otherUid : string)
    : Promise<GraphType>
{
    const sgRep = ctx.client.getRepository(SocialGraph);
    const rGraph = await sgRep.findOneBy({
        src_id: curUid, tgt_id: otherUid
    });
    if (rGraph) {
        return rGraph.link_type;
    }

    return GraphType.NONE;
}

// Set graph status
static async setGraphStatus(ctx: ORMTC, curUid : string, otherUid : string, status : GraphType)
    : Promise<void>
{
    const sgRep = ctx.client.getRepository(SocialGraph);
    const ug = new SocialGraph();
    ug.link_type = status;
    ug.src_id = curUid;
    ug.tgt_id = otherUid;

    await sgRep.save(ug);
}

// Compose a post
// Future: If this takes a long time, split it into a workflow
@Transaction()
static async makePost(ctx: ORMTC, txt : string, pdate : Date)
{
    const manager = ctx.client;

    // Create post
    const p = new Post();
    p.text = txt;
    p.author = ctx.authenticatedUser;
    p.author_orignal = ctx.authenticatedUser;
    p.media = [];
    p.mentions = [];
    p.post_time = pdate; // This could be done in conjunction w/ the datbase
    p.post_type = PostType.POST;

    const postRep = manager.getRepository(Post);
    await postRep.insert(p);

    // Future: Support images in posts

    // Save to write timeline
    const st = new TimelineSend();
    st.post = p;
    st.post_id = p.id;
    st.send_type = SendType.POST;
    st.send_date = p.post_time;
    st.user_id = ctx.authenticatedUser;

    const sendRep = manager.getRepository(TimelineSend);
    await sendRep.insert(st);
    return p;
}

// Send a post
@Transaction()
static async distributePost(ctx: ORMTC, p: Post) {
    const manager = ctx.client;

    // Deliver post to followers
    const sgRep = manager.getRepository(SocialGraph);
    const followers : SocialGraph[] = await sgRep.find({
        where: {tgt_id: ctx.authenticatedUser, link_type: In([GraphType.FOLLOW, GraphType.FOLLOW_FRIEND])}
    });
    const recvRep = manager.getRepository(TimelineRecv);

    for (const follower of followers) {
        const rt = new TimelineRecv();
        rt.post = p;
        rt.post_id = p.id;
        rt.recv_type = RecvType.POST;
        rt.send_date = p.post_time;
        rt.unread = true;
        rt.user_id = follower.src_id;
        rt.from_user_id = ctx.authenticatedUser;

        await recvRep.insert(rt);
    }

    return p;
}

static async makePM(ctx: ORMTC, curUid : string, toUid : string, txt : string, mdate: Date) :
    Promise<void>
{
    // Create post
    const p = new Post();
    p.text = txt;
    p.author = curUid;
    p.author_orignal = curUid;
    p.media = [];
    p.mentions = [toUid];
    p.post_time = mdate;
    p.post_type = PostType.PM;

    const postRep = ctx.client.getRepository(Post);
    await postRep.insert(p);

    // Future: Allow media upload

    // Save to write timeline
    const st = new TimelineSend();
    st.post = p;
    st.post_id = p.id;
    st.send_type = SendType.PM;
    st.send_date = p.post_time;
    st.user_id = curUid;

    const sendRep = ctx.client.getRepository(TimelineSend);
    await sendRep.insert(st);

    // Deliver post to recipient
    const recvRep = ctx.client.getRepository(TimelineRecv);
    const rt = new TimelineRecv();
    rt.post = p;
    rt.post_id = p.id;
    rt.recv_type = RecvType.PM;
    rt.send_date = p.post_time;
    rt.unread = true;
    rt.user_id = toUid;
    rt.from_user_id = curUid;

    await recvRep.save(rt);
}

//  Read a send timeline
static async readSendTimeline(ctx: ORMTC, _curUser : string, timelineUser : string, type : SendType[], getPosts : boolean)
    : Promise<TimelineSend []>
{
    // TODO: Permissions
    const tsRep = ctx.client.getRepository(TimelineSend);
    return tsRep.find({
        where: {
            user_id: timelineUser,
            send_type : In(type),
        },
        relations: {
            post: getPosts,
        },
        order: {
            send_date : "DESC",
        }
    });
}

// Read a received-messages timeline
// Future: Support filters / pagination
static async readRecvTimeline(ctx: ORMTC, curUser : string, type : RecvType[], getPosts : boolean)
    : Promise<TimelineRecv []>
{
    const trRep = ctx.client.getRepository(TimelineRecv);
    return trRep.find({
        where: {
            user_id: curUser,
            recv_type : In(type),
        },
        relations: {
            post: getPosts,
        },
    });
}

@Communicator()
static async createS3UploadKey(ctx: CommunicatorContext, key: string, bucket: string) : Promise<PresignedPost> {
    const postPresigned = await createPresignedPost(
      getS3(ctx),
      {
        Conditions: [
          ["content-length-range", 1, 10000000],
        ],
        Bucket: bucket,
        Key: key,
        Expires: 1200, // 20 minutes to do it, we'll abort the effort in 25 (see below)
        Fields: {
          'Content-Type': 'image/*',
        }
      }
    );
    return postPresigned;
}

static async getS3DownloadKey(ctx: DBOSContext, key: string, bucket: string) {
  const getObjectCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const presignedUrl = await getSignedUrl(getS3Client(ctx), getObjectCommand, { expiresIn: 3600, });

  return presignedUrl;
}

static async ensureS3FileDropped(ctx: DBOSContext, key: string, bucket: string) {
    try {
        const params = {
            Bucket: bucket,
            Key: key,
        };

        const s3 = getS3(ctx);

        await s3.deleteObject(params);
        ctx.logger.debug(`S3 key ${key} was deleted successfully.`);
    } catch (error) {
        // Generally expected to occur sometimes
        ctx.logger.info(`S3 key ${key} couldn't be deleted, or was already deleted.`);
    }
}

@Transaction()
static async writeMediaPost(ctx: ORMTC, mid: string, mkey: string) {
    const m = new MediaItem();
    m.media_url = mkey;
    m.media_id = mid;
    m.owner_id = ctx.authenticatedUser;
    //m.media_type = ? // This may not be important enough to deal with...
    m.media_usage = MediaUsage.POST;
    const manager = ctx.client;
    await manager.save(m);
}

@Transaction()
static async writeMediaProfilePhoto(ctx: ORMTC, mid: string, mkey: string) {
    const m = new MediaItem();
    m.media_url = mkey;
    m.media_id = mid;
    m.owner_id = ctx.authenticatedUser;

    m.media_usage = MediaUsage.PROFILE;
    const manager = ctx.client;

    // TODO: Should really delete the old keys from AWS...
    const deleted = await manager.delete(MediaItem, {
        owner_id: ctx.authenticatedUser,
        media_usage: MediaUsage.PROFILE
    });
    ctx.logger.debug(`Deleted ${deleted.affected} old items`);
    await manager.save(m);
}

/*
 * We can entrust workflow to remember to do compensating actions.
 * Our steps:
 *   Give the client a workflow handle.  They will make a call that sends a message to this to bump it along
 *   With that, we will bundle a presigned upload URL
 *   We then wait for notification that this was accomplished.
 *     If it fails for any reason, the workflow can just terminate.  Its database record is the record.
 */
@Workflow()
static async mediaUpload(ctx: WorkflowContext, mtype: string, mediaId: string, mediaFile: string, bucket: string)
{
    const mkey = await ctx.invoke(Operations).createS3UploadKey(mediaFile, bucket);
    await ctx.setEvent<PresignedPost>("uploadkey", mkey);

    try {
        await ctx.recv("uploadfinish", 1500); // No upload in 25 minutes, give up?
        if (mtype === 'profile') {
            await ctx.invoke(Operations).writeMediaProfilePhoto(mediaId, mediaFile);
        }
        else {
            await ctx.invoke(Operations).writeMediaPost(mediaId, mediaFile);
        }
    }
    catch (e) {
        // No need to make a database record, or, at this point, roll anything back.
        // It might be a good idea to clobber the s3 key in case it arrived but we weren't told.
        //   (The access key duration is less than the time we wait, so it can't be started.)
        // TODO: perhaps put this operation in a communicator later.
        await Operations.ensureS3FileDropped(ctx, mediaFile, bucket);
    }
    return {};
}

}
