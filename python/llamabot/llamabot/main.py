import datetime
import os
import uuid
from typing import Any, Dict, Optional

from dbos import DBOS, SetWorkflowUUID
from fastapi import Body, FastAPI
from fastapi import Request as FastAPIRequest
from llama_index.core import StorageContext, VectorStoreIndex, set_global_handler
from llama_index.core.postprocessor import FixedRecencyPostprocessor
from llama_index.core.prompts import PromptTemplate
from llama_index.core.schema import NodeRelationship, RelatedNodeInfo, TextNode
from llama_index.vector_stores.postgres import PGVectorStore
from slack_bolt import App, BoltRequest
from slack_bolt.adapter.starlette.handler import to_bolt_request
from slack_sdk.web import SlackResponse

app = FastAPI()
dbos = DBOS(fastapi=app)

# Initialize the LlamaIndex components
PREVIOUS_NODE = None
# Logs from LlamaIndex will be printed as the `DEBUG` level.
set_global_handler("simple", logger=DBOS.logger)
db_url = dbos.app_db.engine.url
vector_store = PGVectorStore.from_params(
    database=db_url.database,
    host=db_url.host,
    password=db_url.password,
    port=str(db_url.port),
    user=db_url.username,
    embed_dim=1536,  # openai embedding dimension
    perform_setup=False,  # Already setup through schema migration
)
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex([], storage_context=storage_context)

# Initialize the slack app
slackapp = App(
    token=os.environ.get("SLACK_BOT_TOKEN"),
    signing_secret=os.environ.get("SLACK_SIGNING_SECRET"),
)

# Get my own slack ID
auth_response = slackapp.client.auth_test()
DBOS.logger.info(auth_response)
bot_user_id = auth_response["user_id"]


# Define a post endpoint to handle slack events
@app.post("/")
def slack_challenge(request: FastAPIRequest, body: Dict[str, Any] = Body(...)):  # type: ignore
    if "challenge" in body:
        DBOS.logger.info("Received challenge")
        return {"challenge": body["challenge"]}
    DBOS.logger.debug(f"Incoming event: {body}")
    return slackapp.dispatch(to_bolt_request(request, request._body))


# This handles any incoming message the bot can hear
@slackapp.message()
def handle_message(request: BoltRequest) -> None:
    DBOS.logger.info(f"Received message: {request.body}")
    event_id = request.body["event_id"]
    # Start the workflow and respond to Slack without waiting for the workflow to finish
    # Use the unique event_id to ensure that the workflow runs exactly once for each event
    with SetWorkflowUUID(event_id):
        dbos.start_workflow(message_workflow, request.body["event"])


# This is the main workflow that processes incoming messages
@dbos.workflow()
def message_workflow(message: Dict[str, Any]) -> None:
    global PREVIOUS_NODE
    # if message contains a "blocks" key
    #   then look for a "block" with the type "rich text"
    #       if you find it
    #       then look inside that block for an "elements" key
    #           if you find it
    #               then examine each one of those for an "elements" key
    #               if you find it
    #                   then look inside each "element" for one with type "user"
    #                   if you find it
    #                   and if that user matches the bot_user_id
    #                   then it's a message for the bot
    if message.get("blocks") is not None:
        for block in message["blocks"]:
            if block.get("type") == "rich_text":
                for rich_text_section in block["elements"]:
                    for element in rich_text_section["elements"]:
                        if (
                            element.get("type") == "user"
                            and element.get("user_id") == bot_user_id
                        ):
                            for element in rich_text_section.get("elements"):
                                if element.get("type") == "text":
                                    # the user is asking the bot a question
                                    query: str = element["text"]
                                    response = answer_question(query, message)
                                    post_slack_message(
                                        str(response),
                                        message["channel"],
                                        message.get("thread_ts"),
                                    )
                                    return
    # if it's not a question, it might be a threaded reply
    # if it's a reply to the bot, we treat it as if it were a question
    if message.get("thread_ts") is not None:
        if message.get("parent_user_id") == bot_user_id:
            query = message["text"]
            replies = get_slack_replies(message["channel"], message["thread_ts"])
            response = answer_question(query, message, replies)
            post_slack_message(str(response), message["channel"], message["thread_ts"])
            return

    # if it's not any kind of question, we store it in the index along with all relevant metadata
    user_name = get_user_name(message["user"])

    # format timestamp as YYYY-MM-DD HH:MM:SS
    dt_object = datetime.datetime.fromtimestamp(float(message["ts"]))
    formatted_time = dt_object.strftime("%Y-%m-%d %H:%M:%S")

    # format full message
    text = message["text"]

    # store the message in the index
    insert_node(text, user_name, formatted_time)
    DBOS.logger.info(f"Stored message: {text}")


# Post a message to a slack channel, optionally in a thread
@dbos.communicator()
def post_slack_message(
    message: str, channel: str, thread_ts: Optional[str] = None
) -> None:
    slackapp.client.chat_postMessage(channel=channel, text=message, thread_ts=thread_ts)


# Get all the replies in a Slack thread
@dbos.communicator()
def get_slack_replies(channel: str, thread_ts: str) -> SlackResponse:
    return slackapp.client.conversations_replies(channel=channel, ts=thread_ts)


# Get a Slack user's username from their user id
@dbos.communicator()
def get_user_name(user_id: str) -> str:
    user_info = slackapp.client.users_info(user=user_id)
    user_name: str = user_info["user"]["name"]
    return user_name


# Given a query and a slack message, answer the question with LlamaIndex and return the response
@dbos.communicator()
def answer_question(
    query: str, message: Dict[str, Any], replies: Optional[SlackResponse] = None
) -> Any:
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
        "The person who is asking the question is called '"
        + who_is_asking
        + "'.\n"
        + replies_stanza
        + "\n"
        "You are a helpful AI assistant who has been listening to everything everyone has been saying. \n"
        "Given the most relevant chat messages above, please answer this question: {query_str}\n"
    )
    qa_template = PromptTemplate(template)
    postprocessor = FixedRecencyPostprocessor(
        top_k=20,
        date_key="when",  # the key in the metadata to find the date
    )
    query_engine = index.as_query_engine(
        similarity_top_k=20, node_postprocessors=[postprocessor]
    )
    query_engine.update_prompts({"response_synthesizer:text_qa_template": qa_template})
    return query_engine.query(query)


# Insert a node into LlamaIndex
@dbos.communicator()
def insert_node(text: str, user_name: str, formatted_time: str) -> None:
    global PREVIOUS_NODE
    # create a node and apply metadata
    node = TextNode(
        text=text,
        id_=str(uuid.uuid4()),
        metadata={"who": user_name, "when": formatted_time},  # type: ignore
    )
    if PREVIOUS_NODE is not None:
        node.relationships[NodeRelationship.PREVIOUS] = RelatedNodeInfo(
            node_id=PREVIOUS_NODE.node_id
        )
        PREVIOUS_NODE = node

    index.insert_nodes([node])
