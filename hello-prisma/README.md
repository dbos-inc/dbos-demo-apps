## Serverless Hello World Using Prisma

A demo app for Operon.

You need to use `npm install` to install the Operon package.

```shell
npm install
```

Then compile this app:
```shell
npm run build
```

Update operon-config.yaml to point to your database which must
be create prior to running the app
Run this command in the database to create table:
CREATE TABLE IF NOT EXISTS OperonHello (greeting_id SERIAL PRIMARY KEY, greeting TEXT);


Finally, start the simple HTTP server:
```shell
npx operon start
```

It should print the output:
```shell

[Operon Server]: Server is running at http://localhost:3000
```

Now you can open your browser and type `http://localhost:3000/greeting/{name}` and see the output!