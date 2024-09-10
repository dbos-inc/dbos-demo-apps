# DBOS Social Demo App (YKY)

This demo shows a [DBOS](https://github.com/dbos-inc/dbos-transact) backend system coupled with a next.js frontend.

It simulates a simple social network, and demonstrates:
* Use of DBOS workflows, transactions, and communicators
* [TypeORM](https://typeorm.io) integration
* Amazon S3 integration (for profile photos)
* Authentication and authorization using an app-managed database table

## Create Database

This demo assumes there is a PostgreSQL database running on localhost on port 5432 (configurable, see below).
To set up Postgres (creating a `socialts` user and database) with a local database, run:
```shell
yky-social/scripts/init_pgdb.sh
```
This script will ask you multiple times for the PostgreSQL password, unless it is already stored in the PGPASSWORD environment variable.

Alternatively, set up the database with Docker:
```
POSTGRES_HOST=localhost POSTGRES_PORT=5444 POSTGRES_USERNAME=socialts POSTGRES_PASSWORD=socialts POSTGRES_DATABASE=socialts scripts/start_postgres_docker.sh
```

## Compile and Run the Backend

### Backend Environment Variables 

Launch a window to run the YKY backend.
The backend allows the following environment variables (which should match the database configured above):

* POSTGRES\_HOST=localhost
* POSTGRES\_PORT=5444
* POSTGRES\_USERNAME=socialts
* POSTGRES\_PASSWORD=socialts
* POSTGRES\_DATABASE=socialts

By default, the backend will run on port 3000, but this can be changed with the `-p` option or in the `dbos-config.yaml` file.

Additionally, to allow media storage, S3 access keys must be placed in the environment or in `dbos-config.yaml`:
* AWS\_REGION
* AWS\_ACCESS\_KEY
* AWS\_SECRET\_ACCESS\_KEY
* S3\_BUCKET\_NAME (Unkless your bucket is called `yky-social-photos`)

There are many ways to set up the S3 bucket, including the following:

Block all public access.

Create an IAM user with access keys.

Grant that user the following permissions (replace `yky-social-photos` with your bucket name):
```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "VisualEditor0",
			"Effect": "Allow",
			"Action": [
				"s3:ListStorageLensConfigurations",
				"s3:ListAccessPointsForObjectLambda",
				"s3:GetAccessPoint",
				"s3:PutAccountPublicAccessBlock",
				"s3:GetAccountPublicAccessBlock",
				"s3:ListAllMyBuckets",
				"s3:ListAccessPoints",
				"s3:PutAccessPointPublicAccessBlock",
				"s3:ListJobs",
				"s3:PutStorageLensConfiguration",
				"s3:ListMultiRegionAccessPoints",
				"s3:CreateJob"
			],
			"Resource": "*"
		},
		{
			"Sid": "VisualEditor1",
			"Effect": "Allow",
			"Action": "s3:*",
			"Resource": [
				"arn:aws:s3:::yky-social-photos",
				"arn:aws:s3:::yky-social-photos/*"
			]
		}
	]
}
```

Use the following CORS policy:
```json
[
    {
        "AllowedHeaders": [
            "*"
        ],
        "AllowedMethods": [
            "PUT",
            "POST",
            "GET"
        ],
        "AllowedOrigins": [
            "*"
        ],
        "ExposeHeaders": []
    }
]
```

### Build and Run Backend

Change to the `yky-social` directory, install dependencies, and build the backend:

```shell
npm install
npm run build
```

Once the backend code is ready, start the backend (this will automatically create the database schema in the dev environment):

```shell
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5444
export POSTGRES_USERNAME=socialts
export POSTGRES_PASSWORD=socialts
export POSTGRES_DATABASE=socialts

export AWS_REGION=us-east-2
export S3_BUCKET_NAME=<bucket>
export AWS_ACCESS_KEY=<key>
export AWS_SECRET_ACCESS_KEY=<secret>

npx dbos start -p 3000
```

## Run YKY FrontEnd

To launch the frontend server, open a third terminal window and run:

```shell
    cd yky-social/yky
    npm install
    npm run dev
```

The YKY front end website is hosted on `localhost:3001` by default, so open a browser to http://localhost:3001 to see the app.
