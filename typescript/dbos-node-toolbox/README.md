# DBOS Toolbox

This app contains example code for many DBOS features, including workflows, steps, queues, scheduled workflows, and transactions.
You can use it as a template when starting a new DBOS app&mdash;start by editing `src/main.ts`.

To learn more about how to program with DBOS, check out the [DBOS programming guide](https://docs.dbos.dev/typescript/programming-guide).

### Running Locally

To start this app locally, run:

```shell
npm install
npx knex migrate:latest
npm run dev
```

Visit http://localhost:3000/ to see your app!