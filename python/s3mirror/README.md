# s3mirror

DBOS powered utility for performant, durable and observable transfers between S3 buckets.

Created in collaboration with Bristol Myers Squibb. Read our joint manuscript about this app here:
https://www.biorxiv.org/content/10.1101/2025.06.13.657723v1

## Running the app on your system

Clone this repo.

### 1. Set up Env
Easiest to use venv to create an environment just for the app
```bash
cd s3mirror
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Set up Postgres
If you have Docker on your machine, this is the easiest path:
```bash
dbos postgres start
```
Alternatively, if you have a Postgres DB somewhere, set the variable `DBOS_DATABASE_URL` appropriately. See https://docs.dbos.dev/python/programming-guide

### 3. Start the App
Export the AWS credentials and launch like so

```bash
export AWS_ACCESS_KEY_ID="YOURKEY..."
export AWS_SECRET_ACCESS_KEY="YourSecretKey..."
export AWS_DEFAULT_REGION="us-east-1" #substitute for your case
dbos start
```

### 4. Run a Transfer
In another window, edit the file `start_transfer_example.py` and replace `YOUR_BUCKET_HERE` with the bucket to write to (using the creds exported above). It's currently configured to read from the public Google Genomics bucket, so you don't need to change `src_` settings for a test. 

Then run
```bash
cd s3mirror
source s3sync/.venv/bin/activate # if needed
python3 start_transfer_example.py
```
It will emit a transfer_id. You can send a GET request to 
```
http://0.0.0.0:8000/transfer_status/TRANSFER_ID
```
To track the transfer.

### 5. Notes
The transfer will proceed durably. If you `CTRL+C` the app and restart, it will resume where it left off - downloading only files that have not finished. The status of all past transfers is also stored durably. The `transfer_status` page continues to work as long as Postgres retains data about that specific transfer.

The `rate` field output by transfer_status is in GB/s. 

To cancel a transfer, sent an empty POST request to `/cancel/TRANSFER_ID`

The script `clear_dst.sh` cleans a bucket. Edit it to add your bucket name instead of `YOUR_BUCKET_HERE`. Use it carefully as it deletes all the data in the specified path.

## Running in DBOS Cloud

If you haven't already, sign up at https://console.dbos.dev

### 1. Install the DBOS Cloud CLI

```bash
# Install Node 22
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm

nvm install 22
nvm use 22

# Install dbos-cloud
npm i -g @dbos-inc/dbos-cloud@latest
```

### 2. Log in from the App Directory

```bash
cd s3mirror
dbos-cloud login
```
Follow the instructions

### 3. Deploy App

The AWS keys are passed to the app at deploy time. Like so:

```bash
dbos-cloud app register -d your-database-name
dbos-cloud app env create -s AWS_ACCESS_KEY_ID -v "YOURKEY..."
dbos-cloud app env create -s AWS_SECRET_ACCESS_KEY -v "AWS_SECRET_ACCESS_KEY"
dbos-cloud app env create -s AWS_DEFAULT_REGION -v "us-east-1" #substitute for your case
dbos-cloud app deploy
```
If you need to provide other environment variables, add them to the `env` section of `dbos-config.yaml`. 

This starts a Postgres server for you in the cloud, uploads your app and returns a URL. You can now use this URL as the base in `start_transfer_example.py` to start transfers.

### 4. Cloud Notes

You can use the [Dashboard](https://docs.dbos.dev/cloud-tutorials/monitoring-dashboard) to view app logs. 

You can upgrade to DBOS Pro at https://console.dbos.dev. This will make transfers auto-scale to multiple workers and increase speed by over 4x. 

See also https://docs.dbos.dev/
