# Llamabot: A Retrieval-Augmented GenAI Slackbot

# This app uses DBOS to deploy a Slackbot that uses LlamaIndex to answer questions and store messages in a chat history to a Postgres database.
# We use FastAPI to handle incoming requests and Slack Bolt to handle Slack events.
# Inspired by this app from LlamaIndex: https://github.com/run-llama/llamabot

# First, let's do imports and create FastAPI and DBOS apps.

import datetime
import os
import uuid
from typing import Any, Dict, Optional

from dbos import DBOS, Queue, SetWorkflowID, load_config
from fastapi import Body, FastAPI
from fastapi import Request as FastAPIRequest
from llama_index.core import StorageContext, VectorStoreIndex, set_global_handler
from llama_index.core.postprocessor import FixedRecencyPostprocessor
from llama_index.core.prompts import PromptTemplate
from llama_index.core.schema import TextNode
from llama_index.llms.openai import OpenAI
from llama_index.vector_stores.postgres import PGVectorStore
from slack_bolt import App, BoltRequest
from slack_bolt.adapter.starlette.handler import to_bolt_request
from slack_sdk.web import SlackResponse

app = FastAPI()
DBOS(fastapi=app)

# Define a queue to limit processing incoming messages to 10 per minute.
# This is to prevent the bot from being overwhelmed by a large number of messages.
# We also set the concurrency to 1 to ensure that messages are responded in the order they are received.
work_queue = Queue("llamabot_queue", limiter={"limit": 300, "period": 60}, concurrency=1)

# Then, let's initialize LlamaIndex to use the app's Postgres database as the vector store.
# Note that we don't set up the schema and tables because we've already done that in the schema migration step.
set_global_handler("simple", logger=DBOS.logger)  # Logs from LlamaIndex will be printed as the `DEBUG` level.
dbos_config = load_config()
vector_store = PGVectorStore.from_params(
    database=dbos_config["database"]["app_db_name"],
    host=dbos_config["database"]["hostname"],
    password=dbos_config["database"]["password"],
    port=str(dbos_config["database"]["port"]),
    user=dbos_config["database"]["username"],
    perform_setup=False,  # Already setup through schema migration
)
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex([], storage_context=storage_context)

# After that, let's initialize a Slack Bolt app that handles incoming events from Slack.
slackapp = App(
    token=os.environ.get("SLACK_BOT_TOKEN"),
    signing_secret=os.environ.get("SLACK_SIGNING_SECRET"),
    logger=DBOS.logger,
)

# Get this bot's own Slack ID
auth_response = slackapp.client.auth_test()
bot_user_id = auth_response["user_id"]


# Next, let's define a POST endpoint in FastAPI to handle incoming slack requests
@app.post("/")
def slack_challenge(request: FastAPIRequest, body: Dict[str, Any] = Body(...)):  # type: ignore
    if "challenge" in body:
        # Respond to the Slack challenge request
        DBOS.logger.info("Received challenge")
        return {"challenge": body["challenge"]}
    # Dispatch other incoming requests to the Slack Bolt app
    return slackapp.dispatch(to_bolt_request(request, request._body))


# Next, let's write a Slack Bolt event handler to listen to any incoming Slack messages the bot can hear.
# By default, it filters out messages from the bot itself.
@slackapp.message()
def handle_message(request: BoltRequest) -> None:
    DBOS.logger.info(f"Received message: {request.body}")
    event_id = request.body["event_id"]
    # Use the unique event_id as an idempotency key to guarantee each message is processed exactly-once
    with SetWorkflowID(event_id):
        # Enqueue the event processing workflow then respond to Slack.
        # We can't wait for the workflow to finish because Slack expects the
        # endpoint to reply within 3 seconds.
        work_queue.enqueue(message_workflow, request.body["event"])


# Now, let's write the main workflow function that processes incoming messages.
@DBOS.workflow()
def message_workflow(message: Dict[str, Any]) -> None:
    # Check if the message mentions the bot (@ the bot). If so, it is a question for the bot, and we answer the question and post the response back to the channel.
    # If the message contains a "blocks" key
    #   then look for a "block" with the type "rich text"
    #       if you find it, then look inside that block for an "elements" key
    #               then examine each one of those for an "elements" key
    #                   then look inside each "element" for one with type "user"
    #                   if that user matches the bot_user_id
    #                   then it's a message for the bot
    if message.get("blocks") is not None:
        for block in message["blocks"]:
            if block.get("type") == "rich_text":
                for rich_text_section in block["elements"]:
                    for element in rich_text_section["elements"]:
                        if element.get("type") == "user" and element.get("user_id") == bot_user_id:
                            for element in rich_text_section.get("elements"):
                                if element.get("type") == "text":
                                    # The user is asking the bot a question
                                    query: str = element["text"]
                                    response = answer_question(query, message)
                                    post_slack_message(
                                        str(response),
                                        message["channel"],
                                        message.get("thread_ts"),
                                    )
                                    return
    # If the message doesn't mention the bot, it might be a threaded reply
    # If it's a reply to the bot, we treat it as if it were a question
    if message.get("thread_ts") is not None:
        if message.get("parent_user_id") == bot_user_id:
            query = message["text"]
            replies = get_slack_replies(message["channel"], message["thread_ts"])
            response = answer_question(query, message, replies)
            post_slack_message(str(response), message["channel"], message["thread_ts"])
            return

    # Otherwise, if it's not any kind of question, we store it in the index along with all relevant metadata
    user_name = get_user_name(message["user"])

    # Format timestamp as YYYY-MM-DD HH:MM:SS
    dt_object = datetime.datetime.fromtimestamp(float(message["ts"]))
    formatted_time = dt_object.strftime("%Y-%m-%d %H:%M:%S")

    # Format full message
    text = message["text"]

    # Store the message in LlamaIndex
    insert_node(text, user_name, formatted_time)
    DBOS.logger.info(f"Stored message: {text}")


# Let's define some helper functions to interact with Slack.


# Post a message to a slack channel, optionally in a thread
@DBOS.step()
def post_slack_message(message: str, channel: str, thread_ts: Optional[str] = None) -> None:
    slackapp.client.chat_postMessage(channel=channel, text=message, thread_ts=thread_ts)


# Get all the replies in a Slack thread
@DBOS.step()
def get_slack_replies(channel: str, thread_ts: str) -> SlackResponse:
    return slackapp.client.conversations_replies(channel=channel, ts=thread_ts)


# Get a Slack user's username from their user id
@DBOS.step()
def get_user_name(user_id: str) -> str:
    user_info = slackapp.client.users_info(user=user_id)
    user_name: str = user_info["user"]["name"]
    return user_name


# Let's define some helper functions to answer the question and store chat histories.


# Given a user's question and a slack message, answer the question with LlamaIndex and return the response
@DBOS.step()
def answer_question(query: str, message: Dict[str, Any], replies: Optional[SlackResponse] = None) -> Any:
    who_is_asking = get_user_name(message["user"])
    replies_stanza = ""
    if replies is not None:
        replies_stanza = "In addition to the context above, the question you're about to answer has been discussed in the following chain of replies:\n"
        for reply in replies["messages"]:
            replies_stanza += get_user_name(reply["user"]) + ": " + reply["text"] + "\n"
    template = (
        "Your context is a series of chat messages. Each one is tagged with 'who:' \n"
        "indicating who was speaking and 'when:' indicating when they said it, \n"
        "followed by a line break and then what they said. There can be up to 20 chat messages.\n"
        "The messages are sorted by recency, so the most recent one is first in the list.\n"
        "The most recent messages should take precedence over older ones.\n"
        "---------------------\n"
        "{context_str}"
        "\n---------------------\n"
        "The person who is asking the question is called '" + who_is_asking + "'.\n" + replies_stanza + "\n"
        "You are a helpful AI assistant who has been listening to everything everyone has been saying. \n"
        "Given the most relevant chat messages above, please answer this question: {query_str}\n"
    )
    qa_template = PromptTemplate(template)
    postprocessor = FixedRecencyPostprocessor(
        top_k=20,
        date_key="when",  # the key in the metadata to find the date
    )
    query_engine = index.as_query_engine(
        llm=OpenAI(model="gpt-4o-mini"),  # Use gpt-4o-mini model from OpenAI
        similarity_top_k=20,
        node_postprocessors=[postprocessor],
    )
    query_engine.update_prompts({"response_synthesizer:text_qa_template": qa_template})
    return query_engine.query(query)


# Insert a Slack message as a node into LlamaIndex


@DBOS.step()
def insert_node(text: str, user_name: str, formatted_time: str) -> None:
    # create a node and apply metadata
    node = TextNode(
        text=text,
        id_=str(uuid.uuid4()),
        metadata={"who": user_name, "when": formatted_time},  # type: ignore
    )
    index.insert_nodes([node])


# To deploy this app to the cloud and get a public URL, run `dbos-cloud app deploy`
