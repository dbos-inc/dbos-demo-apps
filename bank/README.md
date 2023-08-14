# Bank of Operon

This is a simple bank application that uses [Operon](https://github.com/dbos-inc/operon) as the backend framework.
It requires node version 18.

To compile and run the bank backend, enter the `bank-backend/` directory and install dependencies:
```shell
cd bank-backend/
npm install
```

Then, you need to use `npm link` to install the Operon package:
```shell
npm link <operon repo path>
```

If you just created a database, you can configure your database path in the `.env` file and create tables using Prisma:
```shell
# .env sets default database url to: DATABASE_URL="postgresql://bank:bank@localhost:5432/bank?schema=prisma"
npx prisma migrate dev --name init
```

Finally, compile and run the backend:
```shell
npm run build
npm start
```