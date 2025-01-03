# Greeting Guestbook

This is the completed app described in the [DBOS TypeScript Programming Guide](https://docs.dbos.dev/typescript/programming-guide).

### Running Locally

To run this app locally, you need a Postgres database.
If you have Docker, you can start one with:

```shell
export PGPASSWORD=dbos
node start_postgres_docker.js
```

Then run:

```shell
npm install
npm run build
npx dbos migrate
npm run start
```

or simply:

```shell
npm install
npm run dev
```

Visit [`http://localhost:3000/greeting/dbos`](http://localhost:3000/greeting/dbos) to try out the app!