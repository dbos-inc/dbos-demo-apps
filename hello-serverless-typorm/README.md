## Serverless Hello World Using TypeOrm

A demo app for Operon.

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
npx operon start
```

It should print the output:
```shell

[Operon Server]: Server is running at http://localhost:3000
```

Now you can open your browser and type `http://localhost:3000/greeting/{name}` and see the output!