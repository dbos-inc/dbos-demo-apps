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

import { getS3Client } from './app';

import {
 OperonContext,
 OperonCommunicator,
 CommunicatorContext,
 OperonTransaction,
 TransactionContext,
 SkipLogging,
 RequiredRole,
 DefaultRequiredRole,
} from '@dbos-inc/operon';
import { Traced } from '@dbos-inc/operon';

export interface ResponseError extends Error {
    status?: number;
}
export function errorWithStatus(msg: string, st: number) : ResponseError
{
    const err = new Error(msg) as ResponseError;
    err.status = st;
    return err;
}

async function hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcryptjs.hash(password, saltRounds);
}

async function comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
  const isMatch = await bcryptjs.compare(password, hashedPassword);
  return isMatch;
}

@DefaultRequiredRole(['user'])
export class Operations
{

@OperonTransaction()
@RequiredRole([])
static async createUser(ctx: TransactionContext, first:string, last:string, uname:string, pass:string) :
   Promise<UserLogin>
{
    const manager = ctx.typeormEM as unknown as EntityManager;

    if (!first || !last || !uname || !pass) {
        throw errorWithStatus(`Invalid user name or password: ${first}, ${last}, ${uname}, ${pass}`, 400);
    }

    const user = new UserLogin();
    user.first_name = first;
    user.last_name = last;
    user.user_name = uname;

    try
    {
       user.password_hash = await hashPassword(pass);
    }
    catch (e)
    {
        throw errorWithStatus("Password hash failed", 400);
    }

    // TODO: Validation of these things; do something if it is wrong
    const existingUser = await manager.findOneBy(UserLogin, {
        user_name: user.user_name,
    });
    if (existingUser) {
        throw errorWithStatus("User already exists.", 400);
    }
    return await manager.save(user);
}

static async logInUser(manager:EntityManager, uname:string, pass:string) :
   Promise<UserLogin>
{
    const userRep = manager.getRepository(UserLogin);
    const existingUser = await userRep.findOneBy({
        user_name: uname,
    });
    if (!existingUser || !await comparePasswords(pass, existingUser.password_hash)) {
      throw errorWithStatus("Incorrect username or password.", 401);
    }

    return existingUser;
}

static async logInUserId(manager:EntityManager, uname:string, pass:string) :
   Promise<string>
{
    const userRep = manager.getRepository(UserLogin);
    const existingUser = await userRep.findOneBy({
        user_name: uname,
    });
    if (!existingUser || !existingUser.id || !await comparePasswords(pass, existingUser.password_hash)) {
      throw errorWithStatus("Incorrect username or password.", 401);
    }

    return existingUser.id;
}

static async getMyProfile(manager:EntityManager, curUid:string) :
   Promise<UserProfile | null>
{
    const upRep = manager.getRepository(UserProfile);
    return upRep.findOneBy({id: curUid});
}

static async getPost(manager:EntityManager, _curUid: string, post:string) :
   Promise<Post | null>
{
    const pRep = manager.getRepository(Post);
    const res = pRep.findOne({
        where: {id: post},
        relations: {
            authorUser: true,
        }});
    return res;
}

//
// Returns other user's login, profile (if requested), our listing for his status, and his for us
@Traced
static async findUser(ctx: TransactionContext, curUid:string, uname:string, getProfile:boolean, getStatus: boolean) :
   Promise<[UserLogin?, UserProfile?, GraphType?, GraphType?]> 
{
    const manager = ctx.typeormEM as unknown as EntityManager;
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
    if (rGraph && rGraph.link_type == GraphType.BLOCK) {
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
        
        // TODO: If we're not friends, may strip part of this out based on preferences
        if (up) {
            profile = up;
        }
    }

    return [otherUser, profile, sgtype, tgtype];
}

static async getGraphStatus(manager: EntityManager, curUid : string, otherUid : string)
    : Promise<GraphType>
{
    const sgRep = manager.getRepository(SocialGraph);
    const rGraph = await sgRep.findOneBy({
        src_id: curUid, tgt_id: otherUid
    });
    if (rGraph) {
        return rGraph.link_type;
    }

    return GraphType.NONE;
}

// Set graph status
static async setGraphStatus(manager: EntityManager, curUid : string, otherUid : string, status : GraphType)
    : Promise<void>
{
    const sgRep = manager.getRepository(SocialGraph);
    const ug = new SocialGraph();
    ug.link_type = status;
    ug.src_id = curUid;
    ug.tgt_id = otherUid;

    // TODO: If we wanted to update; we might also do reverse logic
    //const rGraph = await sgRep.findOneBy({
    //    src_id: curUser, tgt_id: otherUser
    //});

    await sgRep.save(ug);  // Save is 2 round trips?  Investigate...
}

// Compose a post
@OperonTransaction()
static async makePost(ctx: TransactionContext, txt : string)
{
    const manager = ctx.typeormEM as unknown as EntityManager;

    // Create post
    const p = new Post();
    p.text = txt;
    p.author = ctx.authenticatedUser;
    p.author_orignal = ctx.authenticatedUser;
    p.media = [];
    p.mentions = [];
    p.post_time = new Date();
    p.post_type = PostType.POST;

    const postRep = manager.getRepository(Post);
    await postRep.insert(p);

    // TODO: Decompose to allow media upload

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
@OperonTransaction()
static async distributePost(ctx: TransactionContext, p: Post) {
    const manager = ctx.typeormEM as unknown as EntityManager;

    // Deliver post to followers - TODO cross shard; TODO block list
    const sgRep = manager.getRepository(SocialGraph);
    const followers : SocialGraph[] = await sgRep.find({
        where: {tgt_id: ctx.authenticatedUser, link_type: In([GraphType.FOLLOW, GraphType.FOLLOW_FRIEND])}
    });
    const recvRep = manager.getRepository(TimelineRecv);
    // TODO: Cut round trips; could be messages, could be insert+select...
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

// TODO: Deliver a post
static async makePM(manager: EntityManager, curUid : string, toUid : string, txt : string) :
    Promise<void>
{
    // Create post
    const p = new Post();
    p.text = txt;
    p.author = curUid;
    p.author_orignal = curUid;
    p.media = [];
    p.mentions = [toUid];
    p.post_time = new Date();
    p.post_type = PostType.PM;

    const postRep = manager.getRepository(Post);
    await postRep.insert(p);

    // TODO: Decompose to allow media upload

    // Save to write timeline
    const st = new TimelineSend();
    st.post = p;
    st.post_id = p.id;
    st.send_type = SendType.PM;
    st.send_date = p.post_time;
    st.user_id = curUid;

    const sendRep = manager.getRepository(TimelineSend);
    await sendRep.insert(st);

    // Deliver post to recipient - TODO cross shard; TODO block list
    const recvRep = manager.getRepository(TimelineRecv);
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
static async readSendTimeline(manager: EntityManager, _curUser : string, timelineUser : string, type : SendType[], getPosts : boolean)
    : Promise<TimelineSend []>
{
    // TODO: Permissions
    const tsRep = manager.getRepository(TimelineSend);
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

// TODO: Read a recv timeline
// TODO: other filters
static async readRecvTimeline(manager: EntityManager, curUser : string, type : RecvType[], getPosts : boolean)
    : Promise<TimelineRecv []>
{
    const trRep = manager.getRepository(TimelineRecv);
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

@OperonCommunicator()
static async createS3UploadKey(ctx: CommunicatorContext, key: string, bucket: string) : Promise<PresignedPost> {
    const postPresigned = await createPresignedPost(
      getS3Client(),
      {
        Conditions: [
          ["content-length-range", 1, 10000000],
        ],
        Bucket: bucket,
        Key: key,
        Expires: 3600,
        Fields: {
          'Content-Type': 'image/*',
        }
      }
    );
    return postPresigned;
}

@OperonCommunicator()
static async getS3DownloadKey(_ctx: CommunicatorContext, key: string, bucket: string) {
  const getObjectCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const presignedUrl = await getSignedUrl(getS3Client(), getObjectCommand, { expiresIn: 3600, });

  return presignedUrl;
}

}
