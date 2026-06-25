from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app.admin import admin_users
from app.routers import tasks, users, workspaces

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(users.router, prefix="/api/users", tags=["user"])
app.include_router(tasks.router, prefix="/api/workspaces", tags=["task"])
app.include_router(workspaces.router, prefix="/api/workspaces", tags=["workspaces"])
app.include_router(admin_users.router, prefix="/api/admin-users", tags=["admin_users"])


# ======================================================================================================================
# EXCEPTION HANDLER
# ======================================================================================================================


@app.exception_handler(HTTPException)
def general_exception_handler(request: Request, exc: HTTPException):
    message = exc.detail if exc.detail else "An error occurred, please try again"
    return JSONResponse(status_code=exc.status_code, content={"message": message})


@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"message": exc.errors()},
    )
