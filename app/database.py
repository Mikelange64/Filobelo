from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Default back to sqlite ONLY if the .env variable is missing
SQLALCHEMY_DATABASE_URL = settings.database_url

# No 'check_same_thread' because we are on Postgres now!
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    with SessionLocal() as db:
        yield db


DbSession = Annotated[Session, Depends(get_db)]
