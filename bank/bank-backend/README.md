## Bank of Operon -- Backend

This backend re-implements functionalities [here](https://github.com/dbos-inc/reference-demo-apps/tree/main/bank/bank-koa-server) using Operon.
You need to use `npm link` to install the Operon package.

```shell
npm link <operon repo path>
```

Then compile this app:
```shell
npm run build
```

Finally, start the simple HTTP server:
```shell
npm start
```

Now by default, the bank backend should start at `http://localhost:8081`! You can now send HTTP requests to its REST endpoints, or connect it with the frontend.