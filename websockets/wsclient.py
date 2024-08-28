import websocket
import os
import sys

def on_message(ws, message):
    print(f"Received: {message}")

def on_error(ws, error):
    print(f"Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("WebSocket closed")

def on_open(ws):
    print("WebSocket connection opened")
    ws.send("Hello Server from Python client!")

if __name__ == "__main__":

    ws_url = sys.argv[1] if len(sys.argv) > 1 else 'ws://localhost:3000/ws'
    # websocket.enableTrace(True) # Uncomment to enable trace
    print(f"Connecting to {ws_url}")
    ws = websocket.WebSocketApp(ws_url,
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)

    ws.run_forever()