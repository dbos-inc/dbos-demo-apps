from django.http import HttpResponse, JsonResponse
from dbos import DBOS
import sqlalchemy as sa

def index(request):
    return HttpResponse("Hello, world. You're at the polls index.")

def callWorkflow(request, a, b):
    return JsonResponse(workflow(a, b))


@DBOS.step()
def step_one(a):
    print("Step one completed!", a)

@DBOS.step()
def step_two(b):
    print("Step two completed!", b)

@DBOS.workflow()
def workflow(a, b):
    step_one(a)
    step_two(b)
    return {"result": "success"}