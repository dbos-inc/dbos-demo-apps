## Bank of Operon -- Backend

This backend re-implements functionalities [here](https://github.com/dbos-inc/reference-demo-apps/tree/main/bank/bank-koa-server) using Operon.

First, install dependencies.
```shell
npm ci
```

If you just created a database, you can configure your database path in the `.env` file and create tables using Prisma:
```shell
# .env sets default database url to: DATABASE_URL="postgresql://bank:bank@localhost:5432/bank?schema=prisma"
npx prisma migrate dev --name init
```

Then compile this app:
```shell
npm run build
```

Finally, start the simple HTTP server:
```shell
npx operon start
```

Now by default, the bank backend should start at `http://localhost:8081`! You can now send HTTP requests to its REST endpoints, or connect it with the frontend.