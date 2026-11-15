import logging
from contextlib import asynccontextmanager
from pathlib import Path

# Logging is configured before anything else is imported, so that log lines
# written while the rest of the app loads already use the right format.
from app.logging_config import (
    RequestLoggingMiddleware,
    setup_logging,
    take_over_uvicorn_loggers,
)

setup_logging()

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.database import DbSession, engine
from app.redis_client import redis_client
from app.routers import conversations, folders, resources, tasks, users, workspaces
from app.superusers import superusers
from app.utils.image_utils import _get_s3_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once when the server starts. `fastapi run` sets up its own logging
    # after importing this file, so the uvicorn part is re-applied here (see
    # take_over_uvicorn_loggers in app/logging_config.py for the full story).
    take_over_uvicorn_loggers()
    # Building the S3 client reads boto's service definitions from disk. Done
    # once here, in a worker thread, so the first request that needs a file
    # link does not pay for it on the event loop. No network call is made.
    await run_in_threadpool(_get_s3_client)
    yield
    # Runs once when the server stops: close the database connection pool and
    # the Redis connections instead of leaving them to be dropped.
    await engine.dispose()
    await redis_client.aclose()


app = FastAPI(lifespan=lifespan)

# Request logging: one line per request, the X-Request-ID header, and the
# catch-all for unhandled exceptions (logged with traceback, answered with a
# 500 {"message": ...}). See app/logging_config.py.
#
# Order matters: the middleware added LAST is the outermost one. This is
# added before CORS so that CORS wraps it - which means the 500 response it
# produces still gets CORS headers and the frontend can read it. (Side
# effect: CORS preflight OPTIONS requests are answered by the CORS layer
# and never reach this, so they are not logged. That is intended.)
app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/static",
    StaticFiles(directory=Path(__file__).parent.parent / "static"),
    name="static",
)

app.include_router(users.router, prefix="/api/users")
app.include_router(workspaces.router, prefix="/api/workspaces")
app.include_router(conversations.router, prefix="/api/workspaces")
app.include_router(conversations.recent_router, prefix="/api")
app.include_router(tasks.router, prefix="/api/workspaces")
app.include_router(resources.router, prefix="/api/workspaces")
app.include_router(folders.router, prefix="/api/folders")
app.include_router(superusers.router, prefix="/api/superusers")


# ======================================================================================================================
# EXCEPTION HANDLER
# ======================================================================================================================


@app.get("/health")
async def health_check(db: DbSession):
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        # One line without a traceback: an uptime checker polling this while
        # the database is down would otherwise print a full traceback each time.
        logger.error(
            "Health check failed: database unavailable (%s)", type(exc).__name__
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database Unavailable",
        ) from exc

    return {"status": "healthy"}


# Unhandled exceptions (anything that is not an HTTPException or a validation
# error) are not handled here: RequestLoggingMiddleware catches them, logs the
# traceback with the request id, and returns 500 {"message": "Internal server error"}.


@app.exception_handler(StarletteHTTPException)
async def general_exception_handler(request: Request, exc: StarletteHTTPException):
    message = exc.detail if exc.detail else "An error occurred, please try again"
    return JSONResponse(status_code=exc.status_code, content={"message": message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": exc.errors()},
    )
