/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {describe, expect} from '@jest/globals';
import request from 'supertest';
import { app } from './app';
import { userDataSource } from './app';

beforeAll(async () => {
  await userDataSource.initialize();
});

afterAll(async () => {
  await userDataSource.dropDatabase();
  await userDataSource.destroy();
});

describe('POST /register new user wo/ password', () => {
  it('should fail to create a new user with no password', async () => {
    const response = await request(app)
      .post('/register')
      .send({ firstName: 'Jane', lastName: 'Deer', username: "jdeer" });
    expect(response.statusCode).toBe(400);
    //expect(response.body.message).toBe("User created.");
  });
});

describe('POST /register new user', () => {
  it('should create a new user and return 200 status code', async () => {
    const response = await request(app)
      .post('/register')
      .send({ firstName: 'Jane', lastName: 'Deer', username: "jdeer", password: "yyy" });
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("User created.");
  });
});

describe('POST /register new user that already exists', () => {
  it('should fail because user exists and return 400 status code', async () => {
    const response = await request(app)
      .post('/register')
      .send({ firstName: 'Jane', lastName: 'Deer', username: "jdeer", password: "wowowow" });
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("User already exists.");
  });
});

describe('POST /register second new user', () => {
  it('should create a new user and return 200 status code', async () => {
    const response = await request(app)
      .post('/register')
      .send({ firstName: 'Jim', lastName: 'Smith', username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("User created.");
  });
});

describe('POST /login no such user', () => {
  it('should return 400 for wrong user', async () => {
    const response = await request(app)
      .post('/login')
      .send({ username: "apalmer", password: "jjj" });
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Incorrect username or password.");
  });
});

describe('POST /login wrong password', () => {
  it('should return 400 for wrong password', async () => {
    const response = await request(app)
      .post('/login')
      .send({ username: "jsmith", password: "jjjj" });
    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Incorrect username or password.");
  });
});

describe('POST /login success', () => {
  it('should return 200 for booyah', async () => {
    const response = await request(app)
      .post('/login')
      .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Successful login.");
  });
});

// A more interesting test - part 1 follow someone
describe('Go find a friend, follow', () => {
  it('should log us in', async () => {
    const response = await request(app)
    .post('/login')
    .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);

    const nofindres = await request(app)
    .get('/finduser')
    .query({userid:response.body.id})
    .query({findUserName: "dollythesheep" });
    expect(nofindres.statusCode).toBe(200);
    expect(nofindres.body.message).toBe("No user by that name.");

    const findres = await request(app)
    .get('/finduser')
    .query({userid:response.body.id})
    .query({findUserName: "jdeer" });
    expect(findres.statusCode).toBe(200);
    expect(findres.body.message).toBe("User Found.");

    const followres = await request(app)
    .post('/follow')
    .query({userid:response.body.id})
    .send({ followUid: findres.body.uid });
    expect(followres.statusCode).toBe(200);
    expect(followres.body.message).toBe("Followed.");

    // See empty timeline
    const readtimeline = await request(app)
    .get('/recvtimeline')
    .query({userid:response.body.id});
    expect(readtimeline.statusCode).toBe(200);
    expect(readtimeline.body.timeline).toHaveLength(0);
  });
});

// Part 2 - Other makes a post - check send timeline
describe('Go do a post', () => {
  it('should log us in and make a post; check if sent', async () => {
    const response = await request(app)
    .post('/login')
    .send({ username: "jdeer", password: "yyy" });
    expect(response.statusCode).toBe(200);

    // See empty timeline
    const sendtimeline = await request(app)
    .get('/sendtimeline')
    .query({userid:response.body.id});
    expect(sendtimeline.statusCode).toBe(200);
    expect(sendtimeline.body.timeline).toHaveLength(0);

    const nofindres = await request(app)
    .post('/composepost')
    .query({userid:response.body.id})
    .send({postText: "Venison for sale..." });
    expect(nofindres.statusCode).toBe(200);
    expect(nofindres.body.message).toBe("Posted.");

    // See post in timeline
    const readtimeline = await request(app)
    .get('/sendtimeline')
    .query({userid:response.body.id});
    expect(readtimeline.statusCode).toBe(200);
    expect(readtimeline.body.timeline).toHaveLength(1);
  });
});

// Part 3 - Receive followed post
describe('Go read posts', () => {
  it('should log us in and read posts', async () => {
    const response = await request(app)
    .post('/login')
    .send({ username: "jsmith", password: "jjj" });
    expect(response.statusCode).toBe(200);

    // See one post
    const readtimeline = await request(app)
    .get('/recvtimeline')
    .query({userid:response.body.id});
    expect(readtimeline.statusCode).toBe(200);
    expect(readtimeline.body.timeline).toHaveLength(1);
    expect(readtimeline.body.timeline[0].postText).toBe('Venison for sale...');
  });
});