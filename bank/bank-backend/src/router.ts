import Router from "@koa/router";
import axios from "axios";
import { bankname, operon, bankport } from "./main";
import { createAccount, listAccounts } from "./workflows/accountinfo.workflows";
import { AccountInfo } from "src/sql/schema";

export const router = new Router();

const REMOTEDB_PREFIX : string = "remoteDB-";

router.get("/api/greeting", async(ctx, next) => {
  ctx.body = {msg: `Hello from DBOS Operon ${bankname}!`};
  await next();
});

// List accounts.
router.get("/api/list_accounts/:ownerName", async(ctx, next) => {
  const name: string = ctx.params.ownerName;
  try {
      ctx.body = await operon.workflow(listAccounts, {}, name);
      ctx.status = 200;
  } catch (err) {
      console.error(err);
      ctx.body = "Error! cannot list accounts for: " + name;
      ctx.status = 500;
  }
  await next();
});

// Create account.
router.post("/api/create_account", async(ctx, next) => {
  const data = <AccountInfo>ctx.request.body;
  if ((data.balance === undefined) ||
      (data.ownerName === undefined) ||
      (data.type === undefined)) {
      ctx.body = "Invalid input: " + JSON.stringify(data);
      ctx.status = 403;
      ctx.message = "invalid input!";
      await next();
      return;
  }
  try {
      ctx.body = await operon.workflow(createAccount, {}, data);
      ctx.status = 201;
  } catch (err) {
      console.log(err);
      ctx.body = "Error! cannot create the account!";
      ctx.status = 500;
  }
  await next();
});