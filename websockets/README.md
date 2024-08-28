# Websockets samples

The sample takes the application generated in the DBOS quick start[https://docs.dbos.dev/getting-started/quickstart] and add a websocket end point to it.


## Deploying the service

Follow the instructions in the quickstart[https://docs.dbos.dev/getting-started/quickstart] to deploy the app either to the cloud or run locally.

On successfull deployment, you will see a message

2024-08-28 18:53:52 [info]: Access your application at https://someurl/ 


## Running the client

Running it the first time, you need to install these packages by running

pip3 install websockets
pip3 install websocket-client

This needs to done only once.

export WEBSOCKET_URL=someurl

run the client

python3 wsclient.py   

You will see the following output:
Connecting to wss://manoj-websockets.mj.dev.dbos.dev/ws
WebSocket connection opened
Received: 921152
Received: Hello from server!
Received: 325180
Received: 565480
Received: 768972
Received: 269421
Received: 222553
Received: 222654
Received: 339769
Received: 886174
Received: 737998
.
.

