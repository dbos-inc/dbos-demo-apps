## Hello World

A demo app for Operon.

Install and build the app:
```shell
npm install
npm run build
```

In this quickstart, we use [knex.js](https://knexjs.org/) to manage database migrations.
Run our provided migration to create a database table:

```bash
npx knex migrate:latest
```

Start your Operon app:
```shell
npx operon start
```

It should print the output:
```shell
> hello-world@0.0.1 start
> node .

[server]: Server is running at http://localhost:3000
```

Now you can open your browser and type `http://localhost:3000/greeting/{name}` and see the output!