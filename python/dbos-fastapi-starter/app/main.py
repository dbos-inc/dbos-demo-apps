from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from decimal import Decimal, getcontext
from math import factorial

from dbos import DBOS
import time

# Welcome to DBOS!
# This is a template application built with DBOS and FastAPI.

app = FastAPI()
DBOS(fastapi=app)

# This is a simple DBOS workflow with two steps.
# It is served via FastAPI from the /hello endpoint.
# You can use workflows to build crashproof applications.
# Learn more here: https://docs.dbos.dev/python/programming-guide



@DBOS.step()
def calculate_pi_ramanujan(n: int):
    """
    Calculate π up to n digits of precision using Ramanujan's formula:
    1/π = (2√2/9801) * sum(((4k)!*(1103+26390k))/(k!^4 * 396^(4k)))
    """
    getcontext().prec = n + 10  # Add extra precision for accuracy
    
    sum_total = Decimal('0')
    k = 0
    
    while True:
        # Calculate numerator components
        num_a = factorial(4 * k)
        num_b = 1103 + (26390 * k)
        
        # Calculate denominator components
        den_a = factorial(k) ** 4
        den_b = 396 ** (4 * k)
        
        # Calculate term
        term = Decimal(num_a * num_b) / Decimal(den_a * den_b)
        
        # Add to running sum
        sum_total += term
        
        # Check if term is small enough to stop
        if term < Decimal('1e-' + str(n)):
            break
            
        k += 1
    
    # Final calculation
    pi = Decimal('9801') / (Decimal('2').sqrt() * 2 * sum_total)
    
    return pi

@DBOS.workflow()
def calculate_nth_digit_of_pi(n: int) -> None:
    pi = calculate_pi_ramanujan(n)
    nth_digit = int(str(pi)[n])
    DBOS.logger.info(f"The {n}th digit of π is {nth_digit}")


@app.get("/calculate/{n}")
def calculation_endpoint(n: int) -> None:
    DBOS.start_workflow(calculate_nth_digit_of_pi, n)


# This code uses FastAPI to serve an HTML + CSS readme from the root path.


@app.get("/")
def readme() -> HTMLResponse:
    readme = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <title>Welcome to DBOS!</title>
            <link rel="icon" href="https://dbos-blog-posts.s3.us-west-1.amazonaws.com/live-demo/favicon.ico" type="image/x-icon">
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="font-sans text-gray-800 p-6 max-w-2xl mx-auto">
            <h1 class="text-xl font-semibold mb-4">Welcome to DBOS!</h1>
            <p class="mb-4">
                This is a template built with DBOS and FastAPI. Visit <code class="bg-gray-100 px-1 rounded"><a href="/hello" target="_blank" class="text-blue-600 hover:underline">/hello</a></code> to see a "Hello, World!" message.
            </p>
            <p class="mb-4">
                To start building, edit <code class="bg-gray-100 px-1 rounded">app/main.py</code>, commit your changes, then visit the <a href="https://console.dbos.dev/applications" target="_blank" class="text-blue-600 hover:underline">cloud console</a> to redeploy your app.
            </p>
            <p class="mb-4">
                To learn how to build crashproof apps with DBOS, visit the <a href="https://docs.dbos.dev/python/programming-guide" target="_blank" class="text-blue-600 hover:underline">docs</a>!
            </p>
        </body>
        </html>
        """
    return HTMLResponse(readme)
