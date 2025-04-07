from django.http import HttpResponse, JsonResponse
from dbos import DBOS
import sqlalchemy as sa

def index(request):
    return HttpResponse("Hello, world. You're at the polls index.")

def callWorkflow(request, a, b):
    return JsonResponse(workflow(a, b))

@DBOS.workflow()
def workflow(a, b):
    res1 = transaction(a)
    res2 = step(b)
    result = res1 + res2
    return {"result": result}
    
@DBOS.transaction()
def transaction(var):
    rows = DBOS.sql_session.execute(sa.text("SELECT 1")).fetchall()
    return var + str(rows[0][0])

@DBOS.step()
def step(var):
    return var