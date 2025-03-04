# Welcome to DBOS!

This is a template monorepo showcasing how to independently deploy multiple apps to DBOS Cloud. The mono repo contains two packages, both API servers.

### Repo structure

```shell
└── packages
    ├── program1
    │   ├── html
    │   └── src
    └── program2
        ├── html
        └── src
```

### Development mode

### Getting Started

To get started building, edit `src/main.ts`.
Then, commit your changes and visit the [cloud console](https://console.dbos.dev/applications) to redeploy it from GitHub!


<details>
<summary><strong>Deploying via the DBOS Cloud CLI</strong></summary>

You can also deploy this app via the DBOS Cloud CLI.
Install it globally with this command:

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```
</details>

### Developing Locally

First, install dependencies and build your app:

```shell
npm install
npm run build
```

Then, start it:

```shell
npm run start
```

Alternatively, run it in dev mode using `nodemon`:

```shell
npm install
npm run dev
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app!
