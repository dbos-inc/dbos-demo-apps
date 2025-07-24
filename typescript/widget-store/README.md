# Widget Store

This app uses DBOS to build an online storefront that's resilient to any failure.
You can interrupt it at any time (we even provide a crash button to facilitate experimentation) and it will recover from exactly where it left off.

## Setup

1. Install dependencies and build the application.

```shell
npm install
npm run build
```

2. Start Postgres in a local Docker container:

```bash
npx dbos postgres start
```

If you already use Postgres, you can set the `DBOS_DATABASE_URL` environment variable to your connection string.

3. Run database migrations:

```shell
npx dbos migrate
```

4. Start your app:

```shell
npm run start
```

Visit [`http://localhost:3000`](http://localhost:3000) to see your app!