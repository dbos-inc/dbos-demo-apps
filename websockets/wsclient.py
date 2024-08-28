import websocket

def on_message(ws, message):
    print(f"Received: {message}")

def on_error(ws, error):
    print(f"Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("WebSocket closed")

def on_open(ws):
    print("WebSocket connection opened")
    # You can send an initial message here if you want
    ws.send("Hello Server from Python client!")

if __name__ == "__main__":
    # websocket.enableTrace(True)
    # ws = websocket.WebSocketApp("ws://localhost:3000/ws",
    ws = websocket.WebSocketApp("wss://manoj-websockets.mj.dev.dbos.dev/ws",
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)

    ws.run_forever()