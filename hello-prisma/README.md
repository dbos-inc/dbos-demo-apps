## Serverless Hello World Using Prisma

A demo app for DBOS using the Prisma ORM.

You need to use `npm install` to install the DBOS SDK package.

```shell
npm install
```

Then compile this app:
```shell
npm run build
```

Update dbos-config.yaml to specify your database name. It must have been created prior to running this app.
Run this command to create the database schema:
```shell
npx prisma migrate dev --name init
```


Finally, start the simple HTTP server:
```shell
npx dbos start
```

It should print the output:
```shell

[DBOS Server]: Server is running at http://localhost:3000
```

Now you can open your browser and type `http://localhost:3000/greeting/{name}` and see the output!
