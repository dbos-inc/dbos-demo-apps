## Earthquake Tracker

This app uses DBOS to stream earthquake data from the USGS into Postgres then displays it using [Streamlit](https://streamlit.io/).

Check out the source code for the data ingestion in `earthquake_tracker/main.py` and the Streamlit visualization in `earthquake_tracker/streamlit.py`.

### Deploying to the Cloud

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```

This command outputs a URL--visit it to see some earthquakes!
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

Visit [`http://localhost:8000`](http://localhost:8000) to see some earthquakes!