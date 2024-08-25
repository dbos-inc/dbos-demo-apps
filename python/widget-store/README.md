# Widget Store

This app uses DBOS to deploy an online storefront that's resilient to any failure.
You can interrupt it at any time while placing an order (we even provide a "crash button" to facilitate experimentation) and it will resume from exactly where it left off.

### Deploying to the Cloud

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command outputs a URL--visit it to see the storefront!
You can also visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.

### Running Locally

To run this app locally, you need a Postgres database.
If you have Docker, you can start one with:

```shell
export PGPASSWORD=dbos
python3 start_postgres_docker.py
```

Then run:

```shell
pip install -r requirements.txt
dbos migrate
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see the storefront!