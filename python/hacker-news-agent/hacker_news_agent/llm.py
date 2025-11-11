import json
import os
from typing import Any, Dict, List

from dbos import DBOS
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables and initialize OpenAI client
load_dotenv()
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# LLM configuration
DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPERATURE = 0.1
DEFAULT_MAX_TOKENS = 2000


def call_llm(
    messages: List[Dict[str, str]],
    model: str = DEFAULT_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
) -> str:
    """Core LLM API call wrapped as a durable DBOS step.

    The @DBOS.step() decorator makes this function durable - if it fails,
    DBOS will automatically retry it. This is essential for building reliable
    agents that can recover from transient failures.
    """
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise Exception(f"LLM API call failed: {str(e)}")


def clean_json_response(response: str) -> str:
    """Clean LLM response to extract valid JSON.

    LLMs often return JSON wrapped in markdown code blocks.
    This utility function strips that formatting for reliable parsing.
    """
    cleaned = response.strip()

    # Remove markdown code blocks
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()
