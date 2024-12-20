/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import * as fs from 'fs';
import FormData from 'form-data';
import axios, { AxiosResponse } from 'axios';
import { Readable } from 'stream';

import { describe, expect } from '@jest/globals';
import request from 'supertest';

import { PresignedPost } from '@aws-sdk/s3-presigned-post';

import { DBOS } from '@dbos-inc/dbos-sdk';

export { Operations } from './YKYOperations';

beforeAll(async () => {
  await DBOS.launch();
  await DBOS.launchAppHTTPServer();

  for (const table of [
    "media_item",
    "social_graph",
    "timeline_recv",
    "timeline_send",
    "post",
    "user_login",
    "user_profile",
  ]) {
    await DBOS.executor.queryUserDB(`DELETE FROM ${table} CASCADE;`);
  }
});

afterAll(async () => {
  await DBOS.shutdown();
});

describe('GET (request-like)', () => {
  it('should get', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .get('/');
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Welcome to YKY (Yakky not Yucky)!");
  });
});

describe('POST /register new user wo/ password', () => {
  it('should fail to create a new user with no password', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .post('/register')
      .send({ firstName: 'Jane', lastName: 'Deer', username: "jdeer" });
    expect(response.statusCode).toBe(400);
    //expect(response.body.message).toBe("User created.");
  });
});

describe('POST /register new user', () => {
  it('should create a new user and return 200 status code', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .post('/register')
      .send({ firstName: 'Jane', lastName: 'Deer', username: "jdeer", password: "yyy" });
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("User created.");
  });
});

describe('POST /register new user that already exists', () => {
  it('should fail because user exists and return 400 status code', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .post('/register')
      .send({ firstName: 'Jane', lastName: 'Deer', username: "jdeer", password: "wowowow" });
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("User already exists.");
  });
});

describe('POST /register second new user', () => {
  it('should create a new user and return 200 status code', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .post('/register')
      .send({ firstName: 'Jim', lastName: 'Smith', username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("User created.");
  });
});

describe('POST /login no such user', () => {
  it('should return 400 for wrong user', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .post('/login')
      .send({ username: "apalmer", password: "jjj" });
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Incorrect username or password.");
  });
});

describe('POST /login wrong password', () => {
  it('should return 400 for wrong password', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .post('/login')
      .send({ username: "jsmith", password: "jjjj" });
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Incorrect username or password.");
  });
});

describe('POST /login success', () => {
  it('should return 200 for booyah', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
      .post('/login')
      .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Successful login.");
  });
});

// A more interesting test - part 1 follow someone
describe('Go find a friend, follow', () => {
  it('should log us in', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
    .post('/login')
    .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);

    // Should fail if user name is not specified
    const nounameres = await request(DBOS.getHTTPHandlersCallback())
    .get('/finduser')
    .query({userid:response.body.id});
    expect(nounameres.statusCode).toBe(400);

    const nofindres = await request(DBOS.getHTTPHandlersCallback())
    .get('/finduser')
    .query({userid:response.body.id,
            findUserName: "dollythesheep" });
    expect(nofindres.statusCode).toBe(200);
    expect(nofindres.body.message).toBe("No user by that name.");

    const findres = await request(DBOS.getHTTPHandlersCallback())
    .get('/finduser')
    .query({userid:response.body.id,
            findUserName: "jdeer" });
    expect(findres.body.message).toBe("User Found.");
    expect(findres.statusCode).toBe(200);

    const followres = await request(DBOS.getHTTPHandlersCallback())
    .post('/follow')
    .query({userid:response.body.id})
    .send({ followUid: findres.body.uid });
    expect(followres.statusCode).toBe(200);
    expect(followres.body.message).toBe("Followed.");

    // See empty timeline
    const readtimeline = await request(DBOS.getHTTPHandlersCallback())
    .get('/recvtimeline')
    .query({userid:response.body.id});
    expect(readtimeline.statusCode).toBe(200);
    expect(readtimeline.body.timeline).toHaveLength(0);

    // Lie about user id
    const readtimelinefail = await request(DBOS.getHTTPHandlersCallback())
    .get('/recvtimeline')
    .query({userid:'73d7d75e-0758-4093-8613-d7b73a8199e4'});
    expect(readtimelinefail.statusCode).toBe(403);
  });
});

// Part 2 - Other makes a post - check send timeline
describe('Go do a post', () => {
  it('should log us in and make a post; check if sent', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
    .post('/login')
    .send({ username: "jdeer", password: "yyy" });
    expect(response.statusCode).toBe(200);

    // See empty timeline
    const sendtimeline = await request(DBOS.getHTTPHandlersCallback())
    .get('/sendtimeline')
    .query({userid:response.body.id});
    expect(sendtimeline.statusCode).toBe(200);
    expect(sendtimeline.body.timeline).toHaveLength(0);

    const nofindres = await request(DBOS.getHTTPHandlersCallback())
    .post('/composepost')
    .query({userid:response.body.id})
    .send({postText: "Venison for sale..." });
    expect(nofindres.statusCode).toBe(200);
    expect(nofindres.body.message).toBe("Posted.");

    // See post in timeline
    const readtimeline = await request(DBOS.getHTTPHandlersCallback())
    .get('/sendtimeline')
    .query({userid:response.body.id});
    expect(readtimeline.statusCode).toBe(200);
    expect(readtimeline.body.timeline).toHaveLength(1);
  });
});

// Part 3 - Receive followed post
describe('Go read posts', () => {
  it('should log us in and read posts', async () => {
    const response = await request(DBOS.getHTTPHandlersCallback())
    .post('/login')
    .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);

    // See one post
    const readtimeline = await request(DBOS.getHTTPHandlersCallback())
    .get('/recvtimeline')
    .query({userid:response.body.id});
    expect(readtimeline.statusCode).toBe(200);
    expect(readtimeline.body.timeline).toHaveLength(1);
    expect(readtimeline.body.timeline[0].postText).toBe('Venison for sale...');

    // Retrieve post by id
    const post = await request(DBOS.getHTTPHandlersCallback())
    .get(`/post/${readtimeline.body.timeline[0].postId}`)
    .query({userid:response.body.id});
    expect(post.statusCode).toBe(200);
    expect(post.body.post.text).toBe(readtimeline.body.timeline[0].postText);
  });
});

async function uploadToS3(presignedPostData: PresignedPost, filePath: string) {
  const formData = new FormData();

  // Append all the fields from the presigned post data
  Object.keys(presignedPostData.fields).forEach(key => {
    formData.append(key, presignedPostData.fields[key]);
  });

  // Append the file you want to upload
  const fileStream = fs.createReadStream(filePath);
  formData.append('file', fileStream);

  const _response = await axios.post(presignedPostData.url, formData);
}

async function downloadFromS3(presignedGetUrl: string, outputPath: string) {
  const response: AxiosResponse<Readable> = await axios.get(presignedGetUrl, {
    responseType: 'stream',  // Important to handle large files
  });

  // Use a write stream to save the file to the desired path
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// This is a temporary unit test
//  We would not expose the API, just use as part of a larger workflow
describe('Upload and download media', () => {
  it('should log us in, upload, and download', async () => {
    if (!process.env.AWS_ACCESS_KEY) {
      return; // Ideally, we do a mock.  For now, we're testing real AWS if the env is set...
    }

    const response = await request(DBOS.getHTTPHandlersCallback())
    .post('/login')
    .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);

    const postkey = await request(DBOS.getHTTPHandlersCallback())
    .get('/getMediaUploadKey')
    .query({filename: 'YKY.png', userid:response.body.id});
    expect(postkey.statusCode).toBe(200);

    // Perform the upload
    const filePath = './src/YKY.png';
    await uploadToS3(postkey.body as PresignedPost, filePath);

    // Request the download key
    const getkey = await request(DBOS.getHTTPHandlersCallback())
    .get('/getMediaDownloadKey')
    .query({filekey: postkey.body.key, userid:response.body.id});
    expect(getkey.statusCode).toBe(200);

    // Download
    const presignedGetUrl = (getkey.body.url || 'x') as string;
    const outputPath = '/tmp/YKY.png';
    await downloadFromS3(presignedGetUrl, outputPath);
  });
});

//  Test a larger workflow
describe('Upload media in workflow', () => {
  it('should log us in, upload and record to database', async () => {
    if (!process.env.AWS_ACCESS_KEY) {
      return; // Ideally, we do a mock.  For now, we're testing real AWS if the env is set...
    }

    const response = await request(DBOS.getHTTPHandlersCallback())
    .post('/login')
    .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);

    const postkey = await request(DBOS.getHTTPHandlersCallback())
    .get('/startMediaUpload')
    .query({userid:response.body.id});
    expect(postkey.statusCode).toBe(200);

    // Perform the upload
    const filePath = './src/YKY.png';
    await uploadToS3(postkey.body.key as PresignedPost, filePath);

    // Complete the workflow
    const _finishkey = await request(DBOS.getHTTPHandlersCallback())
    .get('/finishMediaUpload')
    .query({userid:response.body.id, wfid: postkey.body.wfHandle});
    expect(postkey.statusCode).toBe(200);

    // Request the download key
    const getkey = await request(DBOS.getHTTPHandlersCallback())
    .get('/getMediaDownloadKey')
    .query({filekey: postkey.body.file, userid:response.body.id});
    expect(getkey.statusCode).toBe(200);

    // Download
    const presignedGetUrl = (getkey.body.url || 'x') as string;
    const outputPath = '/tmp/YKY.png';
    await downloadFromS3(presignedGetUrl, outputPath);

    // Delete
    const dropres = await request(DBOS.getHTTPHandlersCallback())
    .get('/deleteMedia')
    .query({filekey: postkey.body.file, userid:response.body.id});
    expect(dropres.statusCode).toBe(200);
  });
});
