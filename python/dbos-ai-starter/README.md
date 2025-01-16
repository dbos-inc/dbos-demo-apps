# Welcome to DBOS!

This is a template app built with DBOS and LlamaIndex.

### Getting Started

To get started building, edit `app/main.py`.
Then, commit your changes and visit the [cloud console](https://console.dbos.dev/applications) to redeploy it from GitHub!

<details>
<summary><strong>Deploying via the DBOS Cloud CLI</strong></summary>

You can also deploy this app via the DBOS Cloud CLI.
Install it with this command (requires Node):

```shell
npm i -g @dbos-inc/dbos-cloud
```

Then, run this command to deploy your app:

```shell
dbos-cloud app deploy
```
</details>

### Developing Locally

To run this app locally, create a virtual environment and install dependencies:

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

This app uses OpenAI, so you need to export your OpenAI API key as an environment variable:

```shell
export OPENAI_API_KEY=<your-key>
```


Then start your app:

```shell
dbos start
```

Visit [`http://localhost:8000`](http://localhost:8000) to see your app!
