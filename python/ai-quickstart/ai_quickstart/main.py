from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

from fastapi import FastAPI
from dbos import DBOS, SetWorkflowID

app = FastAPI()
DBOS(fastapi=app)

documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)

query_engine = index.as_query_engine()

@app.get("/")
@DBOS.step()
def get_growup():
  response = query_engine.query("What did the author do growing up?")
  return str(response)

@DBOS.step()
def get_art_school():
  response = query_engine.query("How did the author start YC?")
  return str(response)

@DBOS.step()
def get_yc():
  response = query_engine.query("What happened after YC?")
  return str(response)

@DBOS.workflow()
def story_workflow():
  res1 = "First, " + get_growup()
  res2 = " Then, " + get_art_school()
  res3 = " Finally, " + get_yc()
  return res1 + res2 + res3

@app.get("/story/{version}")
@DBOS.workflow()
def get_story(version: str):
  with SetWorkflowID(version):
    return story_workflow()