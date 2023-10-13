# Operon E-Commerce Demo Apps

Note, this demo requires four separate processes to run: front end and back end for shop and payment. 
Easiest way to do this is via the `E-Commerce` VSCode debug launch configuration.

1. initialize the four projects via `./npm-install.sh`
2. Set the PGPASSWORD environment setting to the password value you would like to use
3. Start and configure the shop and payment databases via `./start_postgres_docker.sh`
    * Note, this script also creates the shop and payment databases as well as runs and runs knex migration via `npm run setup` for each
4. Open four terminal windows in order to launch the front and back ends for both the shop and payment apps
    * For payment-backend and shop-backend, run `npm run start` to build and launch the app
    * For shop-frontend, run `npm run dev` to launch the app
    * for payment-frontend, run `npm run start` to build and launch the app

> Note, if you are using VSCode, there are launch configurations for each app in the demo. 
> You can launch them individually or launch all four at once via the `E-Commerce` configuration

When all four processes are running, navigate to http://localhost:3000

(more to come)



























