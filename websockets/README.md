# Websockets samples

The sample takes the application generated in the DBOS quick start[https://docs.dbos.dev/getting-started/quickstart] and adds a websocket endpoint to it.

## Code

### Server

The method `sendToClient` in `src/operations.ts` accepts the websocket connection request and continuously
sends a random number to the client every second


### Client

wslient.js and wsclient.py are the client scripts that requests a websocket connection. They will stay alive and continue
to receive data from the server.


## Deploying the service

Follow the instructions in the quickstart[https://docs.dbos.dev/getting-started/quickstart] to deploy the app either to the cloud or run locally.

On successful deployment, you will see a message

```
2024-08-28 18:53:52 [info]: Access your application at https://yourdomain/ 
```

## Running the client

### Javascript client

The websocket url takes the form wss://yourdomain/ws
let us call is wsurl

run the client

```
node wsclient.js wsurl   

You will see the following output:
Connecting to wss://yourdomain/ws
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

```
### Python client
Running it the first time, you need to install these packages by running

pip3 install websockets
pip3 install websocket-client

This needs to done only once.

The websocket url takes the form wss://yourdomain/ws
let us call is wsurl

run the client

```
python3 wsclient.py wsurl   

You will see the following output:
Connecting to wss://yourdomain/ws
WebSocket connection opened
Received: 921152
Received: Hello from server!
Received: 325180
Received: 565480
.
.
```
