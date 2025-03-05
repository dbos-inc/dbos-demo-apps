# Welcome to DBOS!

This is a template monorepo showcasing how to independently deploy multiple apps to DBOS Cloud. The mono repo contains two packages, both API servers. The guide focuses on using `npm` as the package manager and helps you both develop locally and deploy to DBOS Cloud.

Content:
- How to develop locally
- How to deploy each app to DBOS Cloud
- How to use a lockfile for each application

### Repo structure

We setup the mono repo using [npm workspaces](https://docs.npmjs.com/cli/v8/using-npm/workspaces)

```shell
├── package.json
├── package-lock.json
├── packages
│   ├── program1
│   │   ├── README.md
│   │   ├── dbos-config.yaml
│   │   ├── html
│   │   │   └── app.html
│   │   ├── nodemon.json
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── src
│   │   │   └── main.ts
│   │   └── tsconfig.json
│   └── program2
│       ├── README.md
│       ├── dbos-config.yaml
│       ├── html
│       │   └── app.html
│       ├── nodemon.json
│       ├── package-lock.json
│       ├── package.json
│       ├── src
│       │   └── main.ts
│       └── tsconfig.json
└── start_postgres_docker.js
```

### Monorepo package.json scripts

```json
"scripts": {
    "build": "npm run build --workspaces",
    "build:program1": "npm run build --workspace=program1",
    "build:program2": "npm run build --workspace=program2",

    "start:program1": "npm run start --workspace=program1",
    "start:program2": "npm run start --workspace=program2",

    "dev:program1": "npm run dev --workspace=program1",
    "dev:program2": "npm run dev --workspace=program2",

    "prepare-deploy:program1": "npm install --package-lock-only --prefix packages/program1",
    "prepare-deploy:program2": "npm install --package-lock-only --prefix packages/program2",

    "deploy:program1": "cd packages/program1 && npx dbos-cloud app deploy",
    "deploy:program2": "cd packages/program2 && npx dbos-cloud app deploy"
}
```

### Local development

First, make sure you have a postgres database running and exported the correct `PGPASSWORD` environment variable.
Then, you can run:

```shell
npm install
npm run build
npm run start:program1
npm run start:program2
```

To start both programs. `program1` is configured to listen on port 4000, and `program2` on the default port 3000.
 
Note when you do this, `npm install` will hoist dependencies from each package, install them in a global `node_modules` folder at the root of the monorepo and create a top-level `package-lock.json`.

### Deploying to DBOS Cloud

First, install the DBOS Cloud CLI:
```shell
npm i -g @dbos-inc/dbos-cloud
```

Simply run this alias to [dbos-cloud app deploy](https://docs.dbos.dev/cloud-tutorials/application-management):
```shell
npm run deploy:program1
```

To create a lockfile for the application, run
```shell
npm run prepare-deploy:program1
```

You can visit your app(s) at the URL displayed in your terminal after a successful deploy. Alternatively, run `dbos-cloud app status [app name]`.
