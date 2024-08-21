## Earthquake Tracker

This app uses DBOS to stream earthquake data from the USGS into Postgres then displays it using Streamlit.

Check out the source code for the data ingestion in `main.py` and the Streamlit visualization in `streamlit.py`.

To try the app locally, run:

```
pip install -r requirements.txt
dbos start
```

To deploy this app to DBOS Cloud, first install the DBOS Cloud CLI (requires Node):

```
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```
dbos-cloud app deploy
```

You can visit the [DBOS Cloud Console](https://console.dbos.dev/) to see your app's status and logs.