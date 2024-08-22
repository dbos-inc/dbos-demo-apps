from fastapi import FastAPI
from .frontend import router

app = FastAPI()
app.include_router(router)

