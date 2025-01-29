import json
import os
import time
from pathlib import Path
from string import Template
from typing import Optional

from dbos import DBOS
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

from typing import Annotated

from typing_extensions import TypedDict

from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langgraph.prebuilt import ToolNode, tools_condition
from psycopg_pool import ConnectionPool
from langgraph.checkpoint.postgres import PostgresSaver
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from .schema import OrderStatus, Purchase, chat_history, purchases

# Get the directory containing the script
script_dir = os.path.dirname(os.path.abspath(__file__))
html_dir = os.path.join(os.path.dirname(script_dir), "html")

# TODO: different user can have different thread_id
chat_config = {"configurable": {"thread_id": "1"}}

app = FastAPI()
DBOS(fastapi=app)

APPROVAL_TIMEOUT_SEC = 60 * 60 * 24 * 7  # One week

sg_api_key = os.environ.get("SENDGRID_API_KEY", None)
if sg_api_key is None:
    raise Exception("Error: SENDGRID_API_KEY is not set")

from_email = os.environ.get("SENDGRID_FROM_EMAIL", None)
if from_email is None:
    raise Exception("Error: SENDGRID_FROM_EMAIL is not set")

admin_email = os.environ.get("ADMIN_EMAIL", None)
if admin_email is None:
    raise Exception("Error: ADMIN_EMAIL is not set")

callback_domain = os.environ.get("CALLBACK_DOMAIN", None)
if callback_domain is None:
    raise Exception("Error: CALLBACK_DOMAIN is not set")


# This tool lets the agent look up the details of an order given its ID.

@DBOS.transaction()
def get_purchase_by_id(order_id: int) -> Optional[Purchase]:
    print(f"Looking up purchase {order_id}")
    query = purchases.select().where(purchases.c.order_id == order_id)
    result = DBOS.sql_session.execute(query)
    row = result.first()
    return Purchase.from_row(row) if row is not None else None

# We need to define a wrapper to serialize the output of the tool.
@tool
def tool_get_purchase_by_id(order_id: int) -> str:
    """Look up a purchase by its order id."""
    return str(get_purchase_by_id(order_id))

# This tool processes a refund for an order. If the order exceeds a cost threshold,
# it escalates to manual review.
@tool
@DBOS.workflow()
def process_refund(order_id: int):
    """Process a refund for an order given an order ID."""
    print(f"Processing refund for order {order_id}")
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



class ChatSchema(BaseModel):
    message: str


@DBOS.transaction()
def insert_chat(message: dict):
    DBOS.sql_session.execute(
        chat_history.insert().values(message_json=json.dumps(message))
    )


@app.get("/history")
def history_endpoint():
    messages = get_chats()
    return [
        {"content": m["content"], "isUser": m["role"] == "user"}
        for m in messages
        if m["content"] and m["role"] != "tool"
    ]


@DBOS.transaction()
def get_chats():
    stmt = chat_history.select().order_by(chat_history.c.created_at.asc())
    result = DBOS.sql_session.execute(stmt)
    return [json.loads(row.message_json) for row in result]


@app.get("/")
def frontend():
    with open(os.path.join("html", "app.html")) as file:
        html = file.read()
    return HTMLResponse(html)


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
    DBOS.sql_session.execute(chat_history.delete())
    DBOS.sql_session.execute(
        purchases.update().values(order_status=OrderStatus.PURCHASED.value)
    )
    initial_chat = {
        "role": "assistant",
        "content": "Hi there! Do you need help refunding an order?",
    }
    insert_stmt = chat_history.insert().values(message_json=json.dumps(initial_chat))
    DBOS.sql_session.execute(insert_stmt)


@app.post("/crash")
def crash():
    os._exit(1)

# Define the state for the LangChain graph
class State(TypedDict):
    messages: Annotated[list, add_messages]

def create_agent():
    llm = ChatOpenAI(model="gpt-3.5-turbo")
    tools = [tool_get_purchase_by_id, process_refund]
    llm_with_tools = llm.bind_tools(tools)

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a helpful refund agent. You always speak in fluent, natural, conversational language.",
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

compiled_agent = create_agent()

@app.post("/chat")
def chat_workflow(chat: ChatSchema):
    message = {"role": "user", "content": chat.message}
    events = compiled_agent.stream({"messages": [{"role": "user", "content": chat.message}]}, config=chat_config, stream_mode="values")
    response_messages = []
    for event in events:
        if "messages" in event:
            msg = event["messages"][-1]
            print(type(event["messages"][-1]))
            if isinstance(event["messages"][-1], AIMessage):
                message = {"role": "assistant", "content": msg.content}
                response_messages.append(message)
            elif isinstance(event["messages"][-1], HumanMessage):
                message = {"role": "user", "content": msg.content}
            elif isinstance(event["messages"][-1], ToolMessage):
                message = {"role": "tool", "content": msg.content}
            insert_chat(message)
    return [
        {"content": m["content"], "isUser": m["role"] == "user"}
        for m in response_messages
        if m["content"] and m["role"] != "tool"
    ]
