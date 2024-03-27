# DBOS Widget Store

## Preliminaries

To set up the demo:

```shell
cd widget-store
npm install @dbos-inc/dbos-cloud@latest
#if this is your first time using cloud, register:
npx dbos-cloud register -u <username>
#else, login
npx dbos-cloud login
npx dbos-cloud db provision <db-name> -U <username> -W <password>
npx dbos-cloud app register -d <db-name>
npx dbos-cloud dashboard launch
```

Routes:
