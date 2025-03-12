# Welcome to DBOS!

This is a template app built with [DBOS](https://dbos.dev) and [Next.js](https://nextjs.org/).

## Getting Started

This template can be used in numerous ways:
- Create a cloud instance of this app with [DBOS Cloud Console](https://console.dbos.dev/launch) GitHub integration and clone the code from GitHub.
- Create a cloud instance of this app with [DBOS Cloud Console](https://console.dbos.dev/launch) and download the code via the console.
- Create a local instance of this app with [`npx @dbos-inc/create`](https://docs.dbos.dev/typescript/reference/tools/cli#npx-dbos-inccreate)
- Use another method, such as `git clone`, to obtain a local copy of the files

### Using GitHub Integration With DBOS Cloud

If you created an app using DBOS Cloud with GitHub integration, simply check out your project and edit `src/dbos/operations.ts`.
Then, commit your changes and visit the [cloud console](https://console.dbos.dev/applications) to redeploy it from GitHub!

### Using The DBOS Cloud CLI For Deployment

If you created an app using DBOS Cloud without GitHub integration, download the code from the cloud console.  Otherwise, use [@dbos-inc/create](https://docs.dbos.dev/typescript/reference/tools/cli#npx-dbos-inccreate) to create an app based on this template code.

You can then edit the code (start with `src/dbos/operations.ts`), and then deploy this app via the DBOS Cloud CLI.

If you have not already installed `@dbos-inc/dbos-cloud`, install it globally with this command:

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

### Running Locally During Development

To develop and run this app locally, install dependencies and start your app:

```shell
npm install
npm run build
npm run start
```

Alternatively, run it in dev mode:

```shell
npm install
npm run dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app!
