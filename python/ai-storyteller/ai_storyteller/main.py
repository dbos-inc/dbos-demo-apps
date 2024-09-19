# DBOS AI storyteller: A simple FastAPI app that uses LlamaIndex to generate a story and can be deployed to DBOS Cloud.

# First, let's do imports and create FastAPI and DBOS instances.
from fastapi.responses import HTMLResponse
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

from fastapi import FastAPI
from dbos import DBOS, SetWorkflowID

app = FastAPI()
DBOS(fastapi=app)

# Then, let's initialize the index and query engine by loading "paul_graham_essay.txt" from the data/ folder.
documents = SimpleDirectoryReader("data").load_data()
index = VectorStoreIndex.from_documents(documents)

query_engine = index.as_query_engine()

# After that, let's define three steps, each representing a part of the story.
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

# Finally, let's define a route that generates a story based on the version number.
@app.get("/story/{version}")
@DBOS.workflow()
def get_story(version: str):
  with SetWorkflowID(version):
    return story_workflow()

# Let's define a route that returns a simple HTML page with instructions on how to generate a story.
@app.get("/")
def readme() -> HTMLResponse:
  readme = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>Welcome to DBOS!</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="font-sans text-gray-800 p-6 max-w-2xl mx-auto">
        <h1 class="text-xl font-semibold mb-4">Welcome to DBOS!</h1>
        <p class="mb-4">
            Visit the route <code class="bg-gray-100 px-1 rounded">/story/{version}</code> to generate a version of the story!<br>
            For example, visit <code class="bg-gray-100 px-1 rounded"><a href="/story/v1" class="text-blue-600 hover:underline">/story/v1</a></code><br>
            The story remains the same for the same version number.
            <br>
        </p>
        <p>
            To learn more about DBOS, check out the <a href="https://docs.dbos.dev" class="text-blue-600 hover:underline">docs</a> and <a href="https://docs.dbos.dev/examples" class="text-blue-600 hover:underline">examples</a>.
        </p>
    </body>
    </html>
    """
  return HTMLResponse(readme)