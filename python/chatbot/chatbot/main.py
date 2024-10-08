from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model="gpt-3.5-turbo")


bob = model.invoke([HumanMessage(content="Hi! I'm Bob")])
print(bob)
