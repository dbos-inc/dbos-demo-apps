To set up Postgres (creating a `shop` user and database), run:

```shell
    scripts/init_postgres.sh
```

To install the Operon package, use `npm link`:

```shell
npm link <operon repo path>
```

The backend requires the `STRIPE_API_KEY` environment variable to be set to a valid Stripe API key.
If using a Stripe webhook, it must be running and `STRIPE_WEBHOOK_SECRET` must be set to its secret.
To launch the backend server, run:

```shell
    cd backend-operon
    npm run build && npm start
```

To launch the frontend server, run:
```shell
    cd shop-app-ts
    npm run dev
```

The site is hosted on `localhost:3000`.