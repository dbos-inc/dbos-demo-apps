from confluent_kafka import Producer
import json

# Configuration for the Kafka producer
conf = {
    'bootstrap.servers': 'localhost:9092',
}

# Create Producer instance
producer = Producer(**conf)

# Define a callback function to capture delivery reports (success/failure)
def delivery_report(err, msg):
    if err is not None:
        print(f"Message delivery failed: {err}")
    else:
        print(f"Message delivered to {msg.topic()} [{msg.partition()}]")

# Define the topic
topic = 'alert-responder-topic'

# Define the JSON payload
payload = {
    "alerts": [
        {
            "alert_id": 123464,
            "alert_status": 0,
            "last_update_time": "2024-01-01",
            "message": "Alert!"
        }
    ]
}

# Convert the payload to a JSON string
message = json.dumps(payload)

# Send the message to the Kafka topic
producer.produce(topic, value=message, callback=delivery_report)

# Wait for any outstanding messages to be delivered
producer.flush()

print("Message sent successfully.")
