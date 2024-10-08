from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import START, MessagesState, StateGraph
from dbos import DBOS, get_dbos_database_url

model = ChatOpenAI(model="gpt-3.5-turbo")


# Define a new graph
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


# Define the function that calls the model
def call_model(state: MessagesState):
    chain = prompt | model
    response = chain.invoke(state)
    return {"messages": response}


# Define the (single) node in the graph
workflow.add_edge(START, "model")
workflow.add_node("model", call_model)

# Add memory
# memory = MemorySaver()
with PostgresSaver.from_conn_string("postgresql://postgres:dbos@localhost:5432/chatbot") as checkpointer:
    checkpointer.setup()
    app = workflow.compile(checkpointer=checkpointer)

    config = {"configurable": {"thread_id": "abc123"}}


    query = "Hi! I'm Bob."

    input_messages = [HumanMessage(query)]
    output = app.invoke({"messages": input_messages}, config)
    output["messages"][-1].pretty_print()  # output contains all messages in state

    query = "What's my name?"

    input_messages = [HumanMessage(query)]
    output = app.invoke({"messages": input_messages}, config)
    output["messages"][-1].pretty_print()
