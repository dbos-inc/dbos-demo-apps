const WebSocket = require('ws');

function onMessage(message) {
    console.log(`Received: ${message}`);
}

function onError(error) {
    console.error(`Error: ${error.message}`);
}

function onClose(code, reason) {
    console.log(`WebSocket closed with code: ${code}, reason: ${reason}`);
}

function onOpen(ws) {
    console.log("WebSocket connection opened");
    ws.send("Hello Server from TypeScript client!");
}

const wsUrl = process.argv[2] || 'ws://localhost:3000/ws';
console.log(`Connecting to ${wsUrl}`);

const ws = new WebSocket(wsUrl);

ws.on('open', () => onOpen(ws));
ws.on('message', onMessage);
ws.on('error', onError);
ws.on('close', onClose);
