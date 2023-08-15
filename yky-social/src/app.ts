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
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';

import { DataSource } from "typeorm";

import { MediaItem } from "./entity/Media";
import { Post } from "./entity/Post";
import { GraphType, SocialGraph } from "./entity/Graph";
import { RecvType, SendType, TimelineRecv, TimelineSend } from "./entity/Timeline";
import { UserLogin } from "./entity/UserLogin";
import { UserProfile } from "./entity/UserProfile";

import { Operations, ResponseError, errorWithStatus } from "./Operations";

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

export const app = express();
app.use(bodyParser.json());

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
    res.status((e as ResponseError)?.status || 400).json({message: e.message});
  }
  else {
    res.status(400).json({message: "Unknown error occurred."});
  }
}

// Home route
app.get("/", (req, res) => {
    res.send("Welcome to YKY (Yakky not Yucky)!");
});

// OK, so the thought here is a browser might call this
//  and, there is a nonzero chance that it could get resubmit.
// What do we do then?  It's trying to use a transaction to
//  protect itself, but it will raise an error.  Should we just
//  say hey, it's fine, if it all matches?
// Can this be generalized?
app.post("/register", (req, res, _next) => {
    console.log("Register: "+req.body.username+"-"+req.body.password);
    Operations.createUser(userDataSource,
           req.body.firstName, req.body.lastName, req.body.username, req.body.password)
    .then((user) => {
      res.status(200).json({ message: 'User created.', id:user.id });
    })
    .catch((e) =>
    {
      handleException(e, res);
    });
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

app.post("/login", (req, res, _next) => {
    Operations.logInUser(userDataSource, req.body.username, req.body.password)
    .then((user) =>
    {
      res.status(200).json({message: 'Successful login.', id:user.id});
    })
    .catch((e) => {
      handleException(e, res);
    });
});

app.get("/finduser", (req, res, _next) => {
  const userid = checkUserId(req, res);

  const {findUserName} = req.query;
  if (!findUserName?.toString()) {
    throw errorWithStatus("Parameter missing.", 400);
  }

  Operations.findUser(userDataSource, userid, findUserName.toString(), false, false)
  .then(([user, _prof, _gsrc, _gdst]) => {
    if (!user) {
      res.status(200).json({message: "No user by that name."});
    }
    else {
      res.status(200).json({message:"User Found.", uid : user.id, name : user.user_name});
    }
  })
  .catch( (e) => {
    handleException(e, res);
  });
});

app.get("/post/:id", (req, res, _next) => {
  //console.log("Get post "+req.params.id);
  const userid = checkUserId(req, res);

  // TODO Validate user permissions

  Operations.getPost(userDataSource, userid.toString(), req.params.id)
  .then((post) => {
    if (post) {
      res.status(200).json({message: 'Retrieved.', post:post});
    } else {
      res.status(404).json({message: 'No such post.'});
    }
  })
  .catch((e) => {
    handleException(e, res);
  });
});

app.post("/follow", (req, res, _next) => {
  const userid = checkUserId(req, res);

  Operations.getGraphStatus(userDataSource, userid, req.body.follwUid)
  .then((curStatus) => { return Operations.setGraphStatus(userDataSource, userid, req.body.followUid, curStatus == GraphType.FRIEND ? GraphType.FOLLOW_FRIEND : GraphType.FOLLOW); })
  .then(() => {
    // TODO: That UID wasn't validated - maybe the DB should validate it
    res.status(200).json({message: "Followed."});
  })
  .catch((e) => {
    handleException(e, res);
  });
});

app.post("/composepost", (req, res, _next) => {
  const userid = checkUserId(req, res);
  if (!req.body.postText) {
    res.status(400).send({message: "Post text is required"});
    return;
  }

  Operations.makePost(userDataSource, userid, req.body.postText)
  .then(() => {
    res.status(200).json({message: "Posted."});
  })
  .catch((e) => {
    handleException(e, res);
  });
});

app.get("/recvtimeline", (req, res, _next) => {
  const userid = checkUserId(req, res);

  // TODO: User id and modes

  Operations.readRecvTimeline(userDataSource, userid, [RecvType.POST], true)
  .then( (rtl) => {
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id, fromUserId:tle.from_user_id, unread:tle.unread, sendDate: tle.send_date, recvType:tle.recv_type,
         postText: tle.post?.text, postMentions: tle.post?.mentions};
    });
    return tl;
  })
  .then((tl) => {
    res.status(200).json({message: "Read.", timeline:tl});
  })
  .catch((e) => {
    handleException(e, res);
  });
});

app.get("/sendtimeline", (req, res, _next) => {
  // TODO: User id and modes
  const userid = checkUserId(req, res);

  Operations.readSendTimeline(userDataSource, userid, userid, [SendType.PM, SendType.POST, SendType.REPOST], true)
  .then((rtl) => {
    const tl = rtl.map((tle) => {
      return {postId: tle.post_id,  fromUserId:tle.user_id, sendDate: tle.send_date, sendType:tle.send_type,
         postText: tle.post?.text, postMentions: tle.post?.mentions};
    });
    return tl;
  })
  .then((tl) => {
    res.status(200).json({message: "Read.", timeline: tl});
  })
  .catch((e) => {
    handleException(e, res);
  });
});
