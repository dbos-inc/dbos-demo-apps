# Welcome to DBOS Task Scheduler!
DBOS Task Scheduler is a full-stack app built with [Next.js](https://nextjs.org/) and [DBOS](https://dbos.dev).  It serves as both a demo for learning DBOS concepts and a template for building your own DBOS-powered Next.js applications.

If you like the idea of a cloud-based task scheduler with a calendar UI, you can easily customize it with your own tasks and deploy it to DBOS Cloud [DBOS Cloud](https://www.dbos.dev/dbos-cloud) for free.

## Why Use Next.js With DBOS?
Combining DBOS Transact with Next.js offers a powerful backend and frontend pairing that is easily deployed to DBOS Cloud.

While DBOS Transact provides durable backend execution, it does not include a user interface.  Next.js is an excellent complement, offering a [React](https://react.dev/)-based UI, [server-side rendering (SSR)](https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering) for performance, and [server actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations) for convenient data fetching and interaction.

Existing Next.js hosting options focus on serverless, CDN-heavy applications.  Running Next.js with DBOS Transact on DBOS Cloud unlocks additional benefits:
- Lightweight durable execution – [Workflows](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial) that run to completion exactly once.
- Background tasks and WebSockets – 
- External systems integration – [Place calls to external services](https://docs.dbos.dev/typescript/tutorials/step-tutorial) with much simpler error recovery.
- Simple, powerful database integration – [Manage database data](https://docs.dbos.dev/typescript/tutorials/transaction-tutorial) with DBOS.
- Cron-style task scheduling – Automate recurring jobs with [built-in scheduling](https://docs.dbos.dev/typescript/tutorials/scheduled-workflows).
- Built-in tracing and replay debugging – [Find workflows in the dashboard](https://docs.dbos.dev/cloud-tutorials/monitoring-dashboard) and [re-run them locally](https://docs.dbos.dev/cloud-tutorials/timetravel-debugging).

# Technologies and Concepts Demonstrated
> 💡 **Tip:** The DBOS Task Scheduler app is somewhat complex, showcasing many features.  For a simpler starting point, see [dbos-nextjs-starter](https://github.com/dbos-inc/dbos-demo-apps/tree/main/typescript/dbos-nextjs-starter).

This app uses the following:
- DBOS Workflows, Transactions, and Steps – Complete actions exactly once, record the results, and send notifications, without worrying about server disruptions
- [Knex](https://knexjs.org/) – Type-safe database access and schema management
- DBOS Scheduled Workflows – Ensure tasks are run as scheduled
- React, with [Material](https://mui.com) and [react-big-calendar](https://github.com/jquense/react-big-calendar) – Present a calendar of tasks and results
- Next.js server actions – Simple interaction between the browser-based client and the server
- Next.js API routes and DBOS HTTP endpoints – Allow access to the server logic from clients other than Next.js
- [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) – Send calendar and result updates to the browser with low latency
- [Jest](https://jestjs.io/) – Unit test backend code

# Running DBOS Task Scheduler

## Running Locally
Once you have a copy of the DBOS Task Scheduler locally, run the following:

```
npm install
npm run dev
```

Note that this requires a Postgres database.  If your local environment is set up with database connection settings, these will be used.  Otherwise, the database wizard will try to start a Postgres docker image, or provision a cloud instance of Postgres for you.

When running under `npm run dev`, any changes to source files will cause the application to reload (if UI components were changed) or restart (if DBOS server components were changed).

### Production Builds

Instead of `npm run dev` it is also possible to run the following sequence of commands to run an optimized "production" build
```
npm install
npm run build
npx dbos migrate
npm run start
```

## Using The App

## Setting Up Email Notifications
The DBOS Task Scheduler app will send notifications using Amazon Simple Email Service (SES).  To use this, set the following environment variables:
- AWS_REGION: The AWS region for SES service
- AWS_ACCESS_KEY_ID: The AWS access key provisioned for SES access
- AWS_SECRET_ACCESS_KEY: The access secret corresponding to AWS_ACCESS_KEY_ID
- REPORT_EMAIL_FROM_ADDRESS: The email address to use as the "from" address for results reports
- REPORT_EMAIL_TO_ADDRESS: The email address to use as the "to" address for results reports

# Code Tour

## DBOS and Database Logic

### Main Workflows
### Scheduling
### Database Schema and Transactions
### Sending Email with Amazon SES

## UI
### UI Components
### Server Actions
### API Routes
### DBOS Routes
### WebSockets
### Next.js Custom Server

## Configuration Files
### `package.json`
#### npm run dev
### `nodemon.json`
#### npm run build / start
### `eslint.config.mjs`
### `tsconfig.json`
### `next.config.ts`
### `dbos-config.yaml`
### `knexfile.ts`
### `tsconfig.json`
### `jest.config.js`
### `.gitignore`

