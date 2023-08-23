## Hello World with Provenance

A demo app for Operon that showcases our provenance and tracing system.

Please make sure the Operon repository is located at `../../operon`.

Then compile this app:
```shell
npm install
npm run build
```

Finally, start the simple HTTP server:
```shell
npm start
```

It should print the output:
```shell
> hello-world-provenance@0.0.1 start
> node .

[server]: Server is running at http://localhost:3000
```

Now you can open your browser and type `http://localhost:3000/greeting/{name}` and see the output!

To check provenance, please use `psql` to connect to your Postgres backend and switch to `hello_observability` database that contains all provenance logs and traces.
```
> psql -h localhost -U postgres
postgres=# \c hello_observability
hello_observability=# \dt
                List of relations
 Schema |         Name         | Type  |  Owner
--------+----------------------+-------+----------
 public | provenance_logs      | table | postgres
 public | signal_hellofunction | table | postgres
 public | signal_helloworkflow | table | postgres
(3 rows)
```

You can explore those tables to view our provenance logs and traces!