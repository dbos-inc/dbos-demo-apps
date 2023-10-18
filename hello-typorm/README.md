## Serverless Hello World Using TypeOrm

A demo app for Operon.

You need to use `npm install` to install the Operon package.

```shell
npm install
```

Then compile this app:
```shell
npm run build
```

Update operon-config.yaml to specify your database name. It must have been created prior to running this app.
Create the table this app requires with the following SQL query:

```sql
CREATE TABLE IF NOT EXISTS OperonHello (greeting_id SERIAL PRIMARY KEY, greeting TEXT);
```


Finally, start the simple HTTP server:
```shell
npx operon start
```

It should print the output:
```shell

[Operon Server]: Server is running at http://localhost:3000
```

Now you can open your browser and type `http://localhost:3000/greeting/{name}` and see the output!