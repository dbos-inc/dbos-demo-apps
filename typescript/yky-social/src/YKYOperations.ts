import bcryptjs from 'bcryptjs';

import { EntityManager, In } from 'typeorm';

import { GraphType, SocialGraph } from "./entity/Graph";
import { Post, PostType } from './entity/Post';
import { TimelineRecv, TimelineSend, SendType, RecvType } from "./entity/Timeline";
import { UserLogin } from "./entity/UserLogin";
import { UserProfile } from './entity/UserProfile';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost, PresignedPost } from '@aws-sdk/s3-presigned-post';

import { getS3, getS3Client } from './app';

import { DBOS, SkipLogging } from '@dbos-inc/dbos-sdk';
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

@DBOS.defaultRequiredRole(['user'])
export class Operations
{

@DBOS.transaction()
@DBOS.requiredRole([])
static async createUser(first:string, last:string, uname:string, @SkipLogging hashpass:string) :
   Promise<UserLogin>
{
    const manager = DBOS.typeORMClient as EntityManager;

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

static async logInUser(uname:string, pass:string) :
   Promise<UserLogin>
{
    const manager = DBOS.typeORMClient as EntityManager;

    const userRep = manager.getRepository(UserLogin);
    const existingUser = await userRep.findOneBy({
        user_name: uname,
    });
    if (!existingUser || !await comparePasswords(pass, existingUser.password_hash)) {
      throw errorWithStatus("Incorrect username or password.", 401);
    }

    return existingUser;
}

static async logInUserId(uname:string, pass:string) :
   Promise<string>
{
    const manager = DBOS.typeORMClient as EntityManager;
    const userRep = manager.getRepository(UserLogin);
    const existingUser = await userRep.findOneBy({
        user_name: uname,
    });
    if (!existingUser || !existingUser.id || !await comparePasswords(pass, existingUser.password_hash)) {
      throw errorWithStatus("Incorrect username or password.", 401);
    }

    return existingUser.id;
}

static async getMyProfile(curUid:string) :
   Promise<UserProfile | null>
{
    const manager = DBOS.typeORMClient as EntityManager;
    const upRep = manager.getRepository(UserProfile);
    return upRep.findOneBy({id: curUid});
}

@DBOS.transaction({readOnly: true})
@DBOS.requiredRole([])
static async getMyProfilePhotoKey(curUid:string) :
   Promise<string | null>
{
    const manager = DBOS.typeORMClient as EntityManager;
    const mRep = manager.getRepository(MediaItem);
    DBOS.logger.debug(`Doing profile photo get for ${curUid}`);
    const mi = await mRep.findOneBy({owner_id: curUid, media_usage: MediaUsage.PROFILE});
    if (!mi) {
        DBOS.logger.debug(`Photo get for ${curUid} got nothing`);
        return null;
    }
    DBOS.logger.debug(`Photo get for ${curUid} got ${mi.media_url}`);
    return mi.media_url;
}

static async getPost(_curUid: string, post:string) :
   Promise<Post | null>
{
    const manager = DBOS.typeORMClient as EntityManager;
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
@DBOS.transaction({readOnly: true})
static async findUser(curUid:string, uname:string, getProfile:boolean, getStatus: boolean) :
   Promise<[UserLogin?, UserProfile?, GraphType?, GraphType?]>
{
    const manager = DBOS.typeORMClient as EntityManager;
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

static async getGraphStatus(curUid : string, otherUid : string)
    : Promise<GraphType>
{
    const manager = DBOS.typeORMClient as EntityManager;
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
static async setGraphStatus(curUid : string, otherUid : string, status : GraphType)
    : Promise<void>
{
    const manager = DBOS.typeORMClient as EntityManager;
    const sgRep = manager.getRepository(SocialGraph);
    const ug = new SocialGraph();
    ug.link_type = status;
    ug.src_id = curUid;
    ug.tgt_id = otherUid;

    await sgRep.save(ug);
}

// Compose a post
// Future: If this takes a long time, split it into a workflow
@DBOS.transaction()
static async makePost(txt : string, pdate : Date)
{
    const manager = DBOS.typeORMClient as EntityManager;

    // Create post
    const p = new Post();
    p.text = txt;
    p.author = DBOS.authenticatedUser;
    p.author_orignal = DBOS.authenticatedUser;
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
    st.user_id = DBOS.authenticatedUser;

    const sendRep = manager.getRepository(TimelineSend);
    await sendRep.insert(st);
    return p;
}

// Send a post
@DBOS.transaction()
static async distributePost(p: Post) {
    const manager = DBOS.typeORMClient as EntityManager;

    // Deliver post to followers
    const sgRep = manager.getRepository(SocialGraph);
    const followers : SocialGraph[] = await sgRep.find({
        where: {tgt_id: DBOS.authenticatedUser, link_type: In([GraphType.FOLLOW, GraphType.FOLLOW_FRIEND])}
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
        rt.from_user_id = DBOS.authenticatedUser;

        await recvRep.insert(rt);
    }

    return p;
}

static async makePM(curUid : string, toUid : string, txt : string, mdate: Date) :
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

    const manager = DBOS.typeORMClient as EntityManager;
    const postRep = manager.getRepository(Post);
    await postRep.insert(p);

    // Future: Allow media upload

    // Save to write timeline
    const st = new TimelineSend();
    st.post = p;
    st.post_id = p.id;
    st.send_type = SendType.PM;
    st.send_date = p.post_time;
    st.user_id = curUid;

    const sendRep = manager.getRepository(TimelineSend);
    await sendRep.insert(st);

    // Deliver post to recipient
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
static async readSendTimeline(_curUser : string, timelineUser : string, type : SendType[], getPosts : boolean)
    : Promise<TimelineSend []>
{
    // TODO: Permissions
    const manager = DBOS.typeORMClient as EntityManager;
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

// Read a received-messages timeline
// Future: Support filters / pagination
static async readRecvTimeline(curUser : string, type : RecvType[], getPosts : boolean)
    : Promise<TimelineRecv []>
{
    const manager = DBOS.typeORMClient as EntityManager;
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

@DBOS.step()
static async createS3UploadKey(key: string, bucket: string) : Promise<PresignedPost> {
    const postPresigned = await createPresignedPost(
      getS3(),
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

static async getS3DownloadKey(key: string, bucket: string) {
  const getObjectCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const presignedUrl = await getSignedUrl(getS3Client(), getObjectCommand, { expiresIn: 3600, });

  return presignedUrl;
}

static async ensureS3FileDropped(key: string, bucket: string) {
    try {
        const params = {
            Bucket: bucket,
            Key: key,
        };

        const s3 = getS3();

        await s3.deleteObject(params);
        DBOS.logger.debug(`S3 key ${key} was deleted successfully.`);
    } catch (error) {
        // Generally expected to occur sometimes
        DBOS.logger.info(`S3 key ${key} couldn't be deleted, or was already deleted.`);
    }
}

@DBOS.transaction()
static async writeMediaPost(mid: string, mkey: string) {
    const m = new MediaItem();
    m.media_url = mkey;
    m.media_id = mid;
    m.owner_id = DBOS.authenticatedUser;
    //m.media_type = ? // This may not be important enough to deal with...
    m.media_usage = MediaUsage.POST;
    const manager = DBOS.typeORMClient as EntityManager;
    await manager.save(m);
}

@DBOS.transaction()
static async writeMediaProfilePhoto(mid: string, mkey: string) {
    const m = new MediaItem();
    m.media_url = mkey;
    m.media_id = mid;
    m.owner_id = DBOS.authenticatedUser;

    m.media_usage = MediaUsage.PROFILE;
    const manager = DBOS.typeORMClient as EntityManager;

    // TODO: Should really delete the old keys from AWS...
    const deleted = await manager.delete(MediaItem, {
        owner_id: DBOS.authenticatedUser,
        media_usage: MediaUsage.PROFILE
    });
    DBOS.logger.debug(`Deleted ${deleted.affected} old items`);
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
@DBOS.workflow()
static async mediaUpload(mtype: string, mediaId: string, mediaFile: string, bucket: string)
{
    const mkey = await Operations.createS3UploadKey(mediaFile, bucket);
    await DBOS.setEvent<PresignedPost>("uploadkey", mkey);

    try {
        await DBOS.recv("uploadfinish", 1500); // No upload in 25 minutes, give up?
        if (mtype === 'profile') {
            await Operations.writeMediaProfilePhoto(mediaId, mediaFile);
        }
        else {
            await Operations.writeMediaPost(mediaId, mediaFile);
        }
    }
    catch (e) {
        // No need to make a database record, or, at this point, roll anything back.
        // It might be a good idea to clobber the s3 key in case it arrived but we weren't told.
        //   (The access key duration is less than the time we wait, so it can't be started.)
        // TODO: perhaps put this operation in a step later.
        await Operations.ensureS3FileDropped(mediaFile, bucket);
    }
    return {};
}

}
