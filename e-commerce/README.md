# Operon E-Commerce Demo Apps

Note, this demo requires four separate processes to run: front end and back end for shop and payment. 
Easiest way to do this is via the `E-Commerce` VSCode debug launch configuration.

1. initialize the four projects via `./npm-install.sh`
2. Set the PGPASSWORD environment setting to the password value you would like to use
3. Start and configure the shop and payment databases via `./start_postgres_docker.sh`
4. Launch the needed processes via the `E-Commerce` VSCode debug launch configuration
5. Navigate to http://localhost:3000

(more to come)



























