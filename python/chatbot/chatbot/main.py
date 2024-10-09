from dbos import DBOS
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import START, MessagesState, StateGraph
from psycopg_pool import ConnectionPool

dbos = DBOS()
DBOS.launch()


def create_langchain():
    model = ChatOpenAI(model="gpt-3.5-turbo")
    workflow = StateGraph(state_schema=MessagesState)
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You talk like a pirate. Answer all questions to the best of your ability.",
            ),
            MessagesPlaceholder(variable_name="messages"),
        ]
    )

    def call_model(state: MessagesState):
        chain = prompt | model
        response = chain.invoke(state)
        return {"messages": response}

    workflow.add_edge(START, "model")
    workflow.add_node("model", call_model)
    db = DBOS.config["database"]
    pool = ConnectionPool(
        f"postgresql://{db["username"]}:{db["password"]}@{db["hostname"]}:{db["port"]}/{db["app_db_name"]}"
    )
    checkpointer = PostgresSaver(pool)
    checkpointer.setup()
    return workflow.compile(checkpointer=checkpointer)


chain = create_langchain()

config = {"configurable": {"thread_id": "default_thread"}}

query = "Hi! I'm Bob."

input_messages = [HumanMessage(query)]
output = chain.invoke({"messages": input_messages}, config)
output["messages"][-1].pretty_print()  # output contains all messages in state

query = "What's my name?"

input_messages = [HumanMessage(query)]
output = chain.invoke({"messages": input_messages}, config)
output["messages"][-1].pretty_print()

DBOS.destroy()
