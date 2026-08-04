"""
Groq API client for Qhaphela.

This module is the **only** place the API key is read or used. It is never
returned in a response, never logged, and never sent to the extension. The
extension has no network access to Groq at all -- every call routes through
this backend, which runs on the user's own machine.

Design notes:

- No SDK dependency. The Groq API is OpenAI-compatible JSON over HTTPS, so
  the standard library is enough. One less dependency to audit in a security
  tool, and no risk of an SDK quietly logging the key.
- Every call is bounded: timeout, token cap, and a single retry on transient
  failure only. A hung LLM must never hang the fraud scoring the user is
  actually relying on.
- Errors are mapped to short, user-facing messages. The raw upstream body is
  never surfaced, because it can echo request content back.
"""

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

# ---- Configuration -----------------------------------------------------

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "llama-3.3-70b-versatile"

REQUEST_TIMEOUT = 30      # seconds; the UI shows a spinner, not a frozen page
MAX_RETRIES = 1           # one retry, transient failures only
MAX_OUTPUT_TOKENS = 900

_ENV_LOADED = False


def _load_env() -> None:
    """
    Read .env from the project root into the process environment.

    Deliberately minimal rather than pulling in python-dotenv: fewer
    dependencies in a security tool, and the format we need is trivial.
    Existing environment variables always win, so a deployment can inject
    the key without a file on disk.
    """
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for raw in env_path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())
    _ENV_LOADED = True


def api_key() -> str:
    _load_env()
    return os.environ.get("GROQ_API_KEY", "").strip()


def model_name() -> str:
    _load_env()
    return os.environ.get("GROQ_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def is_configured() -> bool:
    """Whether AI features can run at all. Checked before every AI route."""
    return bool(api_key())


class GroqError(Exception):
    """Raised with a message that is safe to show a user."""


# ---- Output safety -----------------------------------------------------

# Belt and braces: if a key-shaped string ever appeared in a model response
# (echoed back through a crafted prompt, say), it must not reach the user.
_KEY_SHAPED = re.compile(r"\bgsk_[A-Za-z0-9]{20,}\b")


def _scrub(text: str) -> str:
    return _KEY_SHAPED.sub("[REDACTED]", text or "")


# ---- The single network call ------------------------------------------


def complete(
    system: str,
    user: str,
    *,
    temperature: float = 0.3,
    max_tokens: int = MAX_OUTPUT_TOKENS,
    history: list | None = None,
) -> str:
    """
    Send one chat completion to Groq and return the assistant's text.

    `system` holds the instructions. `user` holds content that may be
    untrusted (a job advert, a forwarded message). Callers must wrap
    untrusted content so the model treats it as data -- see ai_assistant.py.

    Raises GroqError with a message suitable for display.
    """
    key = api_key()
    if not key:
        raise GroqError(
            "The AI assistant is not configured. Add GROQ_API_KEY to the .env "
            "file in the project root and restart the service."
        )

    messages = [{"role": "system", "content": system}]
    if history:
        # Cap the turns carried forward: keeps latency and cost predictable,
        # and stops an unbounded conversation from being replayed each time.
        for turn in history[-6:]:
            role = turn.get("role")
            content = (turn.get("content") or "")[:2000]
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user})

    payload = json.dumps(
        {
            "model": model_name(),
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
    ).encode("utf-8")

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        request = urllib.request.Request(
            GROQ_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                # Groq sits behind Cloudflare, which rejects the default
                # urllib agent outright with a 403 (error 1010).
                "User-Agent": "Qhaphela/0.1 (job-fraud-detection)",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
                body = json.loads(response.read())
            choices = body.get("choices") or []
            if not choices:
                raise GroqError("The AI assistant returned an empty response. Please try again.")
            return _scrub(choices[0]["message"]["content"].strip())

        except urllib.error.HTTPError as exc:
            # 429 and 5xx are worth one retry; everything else is terminal.
            if exc.code in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES:
                time.sleep(1.5)
                last_error = exc
                continue
            raise GroqError(_message_for_status(exc.code)) from exc

        except urllib.error.URLError as exc:
            if attempt < MAX_RETRIES:
                time.sleep(1.0)
                last_error = exc
                continue
            raise GroqError(
                "Could not reach the AI service. Check your internet connection and try again."
            ) from exc

        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            raise GroqError("The AI assistant sent a response we could not read.") from exc

    raise GroqError("The AI assistant is unavailable right now. Please try again.") from last_error


def _message_for_status(code: int) -> str:
    """User-facing text for an upstream failure. Never echoes the raw body."""
    if code == 401:
        return "The AI key was rejected. Check GROQ_API_KEY in your .env file."
    if code == 403:
        return "Access to the AI service was refused. The key may have been revoked."
    if code == 429:
        return "The AI assistant is busy (rate limit reached). Wait a moment and try again."
    if code == 413:
        return "That text is too long for the AI assistant. Try a shorter extract."
    if 500 <= code < 600:
        return "The AI service is having problems. Fraud detection still works normally."
    return "The AI assistant could not complete that request."
