from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from fastapi import FastAPI
from dbos import DBOS

app = FastAPI()
DBOS(fastapi=app)

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()

@app.get("/")
def get_answer():
    response = query_engine.query("What did the author do growing up?")
    return str(response)