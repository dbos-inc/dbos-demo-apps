import os
import time
from dataclasses import asdict
from pathlib import Path
from string import Template
from typing import Annotated, Optional

from dbos import DBOS, DBOSConfig
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from psycopg_pool import ConnectionPool
from pydantic import BaseModel
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from sqlalchemy import text
from typing_extensions import TypedDict

from .schema import OrderStatus, Purchase, purchases

# Get the directory containing the script
script_dir = os.path.dirname(os.path.abspath(__file__))
html_dir = os.path.join(os.path.dirname(script_dir), "html")

app = FastAPI()
config: DBOSConfig = {
    "name": "reliable-refunds-langchain",
    "database_url": os.environ.get('DBOS_DATABASE_URL'),
}
DBOS(fastapi=app, config=config)

APPROVAL_TIMEOUT_SEC = 60 * 60 * 24 * 7  # One week timeout for manual review

sg_api_key = os.environ.get("SENDGRID_API_KEY")
assert sg_api_key, "Error: SENDGRID_API_KEY is not set"

from_email = os.environ.get("SENDGRID_FROM_EMAIL")
assert from_email, "Error: SENDGRID_FROM_EMAIL is not set"

admin_email = os.environ.get("ADMIN_EMAIL", None)
assert admin_email, "Error: ADMIN_EMAIL is not set"

callback_domain = os.environ.get("DBOS_APP_HOSTNAME", "http://localhost:8000")


# This tool lets the agent look up the details of an order given its ID.
@DBOS.transaction()
def get_purchase_by_id(order_id: int) -> Optional[Purchase]:
    DBOS.logger.info(f"Looking up purchase by order_id {order_id}")
    query = purchases.select().where(purchases.c.order_id == order_id)
    result = DBOS.sql_session.execute(query)
    row = result.first()
    return Purchase.from_row(row) if row is not None else None


# Define a wrapper function to make the output JSON serializable.
@tool
def tool_get_purchase_by_id(order_id: int) -> str:
    """Look up a purchase by its order id."""
    return asdict(get_purchase_by_id(order_id))


# This tool processes a refund for an order. If the order exceeds a cost threshold,
# it escalates to manual review.
@tool
@DBOS.workflow()
def process_refund(order_id: int):
    """Process a refund for an order given an order ID."""
    purchase = get_purchase_by_id(order_id)
    if purchase is None:
        DBOS.logger.error(f"Refunding invalid order {order_id}")
        return "We're unable to process your refund. Please check your input and try again."
    DBOS.logger.info(f"Processing refund for purchase {purchase}")
    if purchase.price > 1000:
        update_purchase_status(purchase.order_id, OrderStatus.PENDING_REFUND.value)
        DBOS.start_workflow(approval_workflow, purchase)
        return f"Because order_id {purchase.order_id} exceeds our cost threshold, your refund request must undergo manual review. Please check your order status later."
    else:
        update_purchase_status(purchase.order_id, OrderStatus.REFUNDED)
        return f"Your refund for order_id {purchase.order_id} has been approved."


# This workflow manages manual review. It sends an email to a reviewer, then waits up to a week
# for the reviewer to approve or deny the refund request.
@DBOS.workflow()
def approval_workflow(purchase: Purchase):
    send_email(purchase)
    status = DBOS.recv(timeout_seconds=APPROVAL_TIMEOUT_SEC)
    if status == "approve":
        DBOS.logger.info("Refund approved :)")
        update_purchase_status(purchase.order_id, OrderStatus.REFUNDED)
        return "Approved"
    else:
        DBOS.logger.info("Refund rejected :/")
        update_purchase_status(purchase.order_id, OrderStatus.REFUND_REJECTED)
        return "Rejected"


# This function sends an email to a manual reviewer. The email contains links that send notifications
# to the approval workflow to approve or deny a refund.
@DBOS.step()
def send_email(purchase: Purchase):
    content = f"{callback_domain}/approval/{DBOS.workflow_id}"
    msg = Template(Path(os.path.join(html_dir, "email.html")).read_text()).substitute(
        purchaseid=purchase.order_id,
        purchaseitem=purchase.item,
        orderdate=purchase.order_date,
        price=purchase.price,
        content=content,
        datetime=time.strftime("%Y-%m-%d %H:%M:%S %Z"),
    )

    message = Mail(
        from_email=from_email,
        to_emails=admin_email,
        subject="Refund Validation",
        html_content=msg,
    )
    email_client = SendGridAPIClient(sg_api_key)
    email_client.send(message)
    DBOS.logger.info(f"Message sent from {from_email} to {admin_email}")


# This function updates the status of a purchase.
@DBOS.transaction()
def update_purchase_status(order_id: int, status: OrderStatus):
    query = (
        purchases.update()
        .where(purchases.c.order_id == order_id)
        .values(order_status=status)
    )
    DBOS.sql_session.execute(query)


# Define the state for LangGraph
class State(TypedDict):
    messages: Annotated[list, add_messages]


# Set up LangGraph to answer refund requests. The agent uses two tools: one to look up order status, the other to process refunds.
# We'll configure LangChain to store checkpoints in Postgres so it persists across app restarts.
def create_agent():
    llm = ChatOpenAI(model="gpt-3.5-turbo")
    tools = [tool_get_purchase_by_id, process_refund]
    llm_with_tools = llm.bind_tools(tools)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a helpful refund agent. You always speak in fluent, natural, conversational language. You can look up order status and process refunds.",
            ),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )

    # This is our refund agent. It follows these instructions to process refunds.
    # It uses two tools: one to look up order status, one to actually process refunds.
    agent = prompt | llm_with_tools

    # Create a state machine using the graph builder
    graph_builder = StateGraph(State)

    def chatbot(state: State):
        return {"messages": [agent.invoke(state["messages"])]}

    graph_builder.add_node("chatbot", chatbot)
    tool_node = ToolNode(tools=tools)
    graph_builder.add_node("tools", tool_node)
    graph_builder.add_conditional_edges(
        "chatbot",
        tools_condition,
    )
    # Any time a tool is called, we return to the chatbot to decide the next step
    graph_builder.add_edge("tools", "chatbot")
    graph_builder.add_edge(START, "chatbot")

    # Create a checkpointer LangChain can use to store message history in Postgres.
    db = DBOS.config["database"]
    connection_string = f"postgresql://{db['username']}:{db['password']}@{db['hostname']}:{db['port']}/{db['app_db_name']}"
    pool = ConnectionPool(connection_string)
    checkpointer = PostgresSaver(pool)

    graph = graph_builder.compile(checkpointer=checkpointer)

    return graph


class ChatSchema(BaseModel):
    message: str


# Currently supports only one chat thread
chat_config = {"configurable": {"thread_id": "1"}}
compiled_agent = create_agent()


# The main entry for the chat workflow
@app.post("/chat")
def chat_workflow(chat: ChatSchema):
    # Invoke the agent DAG with the user's message
    events = compiled_agent.stream(
        {"messages": [HumanMessage(chat.message)]},
        config=chat_config,
        stream_mode="values",
    )
    # Filter the response messages for the frontend
    response_messages = []
    for event in events:
        if "messages" in event:
            latest_msg = event["messages"][-1]
            if isinstance(latest_msg, AIMessage) and latest_msg.content:
                response_messages.append(
                    {"isUser": False, "content": latest_msg.content}
                )
    return response_messages


@app.get("/history")
def history_endpoint():
    # Retrieve the messages from the chat history and parse them for the frontend
    chats = compiled_agent.checkpointer.list(config=chat_config, limit=1000)
    message_list = []
    for chat in chats:
        writes = chat.metadata.get("writes")
        if writes is not None:
            record = writes.get("chatbot") or writes.get(START)
            if record is not None:
                messages = record.get("messages")
                if messages is not None:
                    for message in messages:
                        if isinstance(message, HumanMessage) and message.content:
                            message_list.append(
                                {"isUser": True, "content": message.content}
                            )
                        elif isinstance(message, AIMessage) and message.content:
                            message_list.append(
                                {"isUser": False, "content": message.content}
                            )
    # The list is reversed so the most recent messages appear at the bottom
    message_list.reverse()
    return message_list


@app.get("/approval/{workflow_id}/{status}")
def approval_endpoint(workflow_id: str, status: str):
    DBOS.send(workflow_id, status)
    msg = Template(Path(os.path.join(html_dir, "confirm.html")).read_text()).substitute(
        result=status,
        wfid=workflow_id,
    )
    return HTMLResponse(msg)


@app.post("/reset")
@DBOS.transaction()
def reset():
    DBOS.sql_session.execute(
        purchases.update().values(order_status=OrderStatus.PURCHASED.value)
    )
    DBOS.sql_session.execute(text("TRUNCATE TABLE checkpoints"))
    DBOS.sql_session.execute(text("TRUNCATE TABLE checkpoint_blobs"))
    DBOS.sql_session.execute(text("TRUNCATE TABLE checkpoint_writes"))


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


@app.post("/crash")
def crash():
    os._exit(1)
