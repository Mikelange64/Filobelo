"""Application logging: one place that decides what log lines look like and
where they go.

HOW IT WORKS (the short version)
--------------------------------
* `setup_logging()` is called once, at the top of app/main.py. It configures
  Python's standard `logging` module - there is no extra dependency.
* Everything is written to the terminal (stderr). Nothing is written to a log
  file by the app. In production systemd runs uvicorn and journald captures
  whatever it prints, so you read logs with:

      journalctl -u <your-service-name> -f              # follow live
      journalctl -u <your-service-name> --since "1 hour ago"
      journalctl -u <your-service-name> | grep req=3f9a1c2b   # one request

* Every line looks like this:

      2026-11-13 14:02:11,512 INFO    [req=3f9a1c2b user=5] app.request: GET /api/workspaces -> 200 in 12.4ms ip=203.0.113.9

  timestamp, level, [request id + logged-in user id], logger name, message.
  "req=- user=-" means the line was not written while handling a request
  (startup, for example), or the request was not authenticated.

* The request id is a random 8-character tag generated for each incoming
  request. Every line logged while handling that request carries the same tag,
  and the client receives it in the `X-Request-ID` response header. So when
  someone reports a failure, the header value from their browser's network tab
  finds every related line with a single grep.

CHANGING THE LEVEL
------------------
Set LOG_LEVEL in backend/.env (DEBUG, INFO, WARNING, ERROR) and restart the
service. The default is INFO. LOG_LEVEL only affects this app's own loggers
("app.*"). Third-party libraries stay at WARNING on purpose: at DEBUG the
OpenAI/httpx/boto libraries print request bodies and headers, which would put
message content and credentials into the log.

ADDING A LOG LINE SOMEWHERE
---------------------------
    import logging
    logger = logging.getLogger(__name__)          # once, at module top
    logger.info("Thing happened thing_id=%s", thing.id)

Use %s placeholders (not f-strings) and never log passwords, tokens,
Authorization headers, message/note text or file contents. Prefer ids.
Use %r for text typed by a user: it escapes newlines, so nobody can forge
extra log lines by putting a line break in, say, the login field.
"""

import logging
import logging.config
import time
import uuid
from contextvars import ContextVar

from starlette.datastructures import MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings

REQUEST_ID_HEADER = "X-Request-ID"

# Requests under these paths are logged at DEBUG instead of INFO (so they are
# hidden at the default level) as long as they succeed. Uptime checks and
# static assets would otherwise drown out everything else. A failing one
# (4xx/5xx) is still logged normally.
QUIET_PATH_PREFIXES = ("/health", "/static")

_VALID_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}

LOG_FORMAT = (
    "%(asctime)s %(levelname)-7s [req=%(request_id)s user=%(user_id)s] "
    "%(name)s: %(message)s"
)


# ======================================================================================================================
# PER-REQUEST CONTEXT
# ======================================================================================================================

# A ContextVar is a variable with a separate value per request being handled,
# even when several run at the same time. It holds a small dict rather than
# two plain values. That dates from when the routes were sync functions, which
# FastAPI runs in a worker thread with a *copy* of the context: a plain value
# set inside the route (the user id, once auth has run) was set on the copy
# and lost, while mutating a shared dict is visible from both sides. The
# routes are async now and run in the request's own context, so the dict is
# no longer strictly needed; it is kept because it also stays correct for
# anything that does run in a worker thread (run_in_threadpool).
_request_context: ContextVar[dict | None] = ContextVar("request_context", default=None)


def get_request_id() -> str:
    ctx = _request_context.get()
    return ctx["request_id"] if ctx else "-"


def set_user_id(user_id: int) -> None:
    """Record who the current request is authenticated as. Called from
    app.auth.get_current_user, which has already loaded the user - so this
    costs nothing extra (no DB query is ever made just for logging)."""
    ctx = _request_context.get()
    if ctx is not None:
        ctx["user_id"] = user_id


class RequestContextFilter(logging.Filter):
    """Stamps every log record with the current request id and user id so the
    format string above can print them. Attached to the output handler, which
    means it also applies to lines from uvicorn and other libraries."""

    def filter(self, record: logging.LogRecord) -> bool:
        ctx = _request_context.get()
        record.request_id = ctx["request_id"] if ctx else "-"
        user_id = ctx["user_id"] if ctx else None
        record.user_id = user_id if user_id is not None else "-"
        return True  # never drops a record, only annotates it


# ======================================================================================================================
# CONFIGURATION
# ======================================================================================================================


def setup_logging() -> None:
    level = settings.log_level.upper()
    bad_level = level not in _VALID_LEVELS
    if bad_level:
        # A typo in .env should not stop the site from starting.
        level = "INFO"

    logging.config.dictConfig(
        {
            "version": 1,
            # Keep loggers that other modules created before this ran.
            "disable_existing_loggers": False,
            "filters": {
                "request_context": {"()": RequestContextFilter},
            },
            "formatters": {
                "default": {"format": LOG_FORMAT},
            },
            "handlers": {
                # The single output: the terminal. journald picks it up in
                # production. No log files, so nothing to rotate or clean up.
                "console": {
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stderr",
                    "formatter": "default",
                    "filters": ["request_context"],
                },
            },
            # Root = every library that is not listed below. WARNING and up only.
            "root": {"level": "WARNING", "handlers": ["console"]},
            "loggers": {
                # This application's own code (every module under app/).
                "app": {"level": level},
            },
        }
    )
    take_over_uvicorn_loggers()

    logger = logging.getLogger(__name__)
    if bad_level:
        logger.warning(
            "LOG_LEVEL=%r is not a valid level, using INFO instead",
            settings.log_level,
        )
    logger.info("Logging configured level=%s", level)


def take_over_uvicorn_loggers() -> None:
    """Make the web server's own log lines use the format above, and silence
    its per-request access line.

    uvicorn (and the `fastapi run` command that wraps it) install their own
    handlers and format. This removes those handlers and lets the records
    "propagate" up to the console handler configured in setup_logging().

    ACCESS LOG: uvicorn's own per-request line ("uvicorn.access") is the one
    that is SILENCED. The "app.request" line written by
    RequestLoggingMiddleware below replaces it - it adds the duration, the
    request id and the user id. Keeping both would print every request twice.

    This is called twice on purpose: from setup_logging(), and again from the
    app's startup hook in main.py. `fastapi run` imports the app first and
    only then applies its own logging setup, which would undo this; the
    startup hook runs after that and re-applies it. The one visible leftover
    is that the first couple of lines at boot ("Started server process",
    "Waiting for application startup") still appear in fastapi's own style.
    """
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


# ======================================================================================================================
# REQUEST LOGGING MIDDLEWARE
# ======================================================================================================================

request_logger = logging.getLogger("app.request")


class RequestLoggingMiddleware:
    """Wraps every HTTP request. It:

    1. generates the request id and makes it available to all log lines;
    2. adds the `X-Request-ID` header to the response;
    3. writes one summary line when the request finishes:
       method, path, status, duration, client ip;
    4. catches any exception nothing else handled, logs it with its traceback
       and answers with the app's usual error shape, {"message": ...}, and a
       500 - so the client never sees a traceback.

    Only the path is logged, never the query string (search terms and the
    like can contain email addresses) and never headers or bodies.

    The client ip comes from uvicorn. Behind nginx it is the real visitor
    address only if nginx sends X-Forwarded-For (`proxy_set_header
    X-Forwarded-For $proxy_add_x_forwarded_for;`); otherwise it will always
    read 127.0.0.1.

    This is written as a plain ASGI middleware (a class with __call__) rather
    than with @app.middleware("http") because that decorator's machinery gets
    in the way of both the per-request context and catching exceptions.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":  # e.g. the startup/shutdown "lifespan" events
            await self.app(scope, receive, send)
            return

        # Always generated here; a client-supplied X-Request-ID is ignored so
        # callers cannot write arbitrary text into the log.
        request_id = uuid.uuid4().hex[:8]
        ctx = {"request_id": request_id, "user_id": None}
        token = _request_context.set(ctx)

        method = scope["method"]
        path = scope["path"]
        client = scope.get("client")
        client_ip = client[0] if client else "-"
        start = time.perf_counter()
        status_code = 500
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            try:
                await self.app(scope, receive, send_with_request_id)
            except Exception:
                # Reaching here means a bug or an outage the route did not
                # anticipate. (HTTPException never gets here: FastAPI turns
                # those into responses further in.)
                request_logger.exception(
                    "Unhandled exception during %s %s", method, path
                )
                if response_started:
                    # Part of a response already went out; a second one
                    # cannot be sent. Let the server close the connection.
                    raise
                status_code = 500
                response = JSONResponse(
                    status_code=500,
                    content={"message": "Internal server error"},
                )
                await response(scope, receive, send_with_request_id)
        finally:
            duration_ms = (time.perf_counter() - start) * 1000

            if status_code >= 500:
                level = logging.ERROR
            elif status_code < 400 and path.startswith(QUIET_PATH_PREFIXES):
                level = logging.DEBUG
            else:
                level = logging.INFO

            request_logger.log(
                level,
                "%s %s -> %s in %.1fms ip=%s",
                method,
                path,
                status_code,
                duration_ms,
                client_ip,
            )
            _request_context.reset(token)
