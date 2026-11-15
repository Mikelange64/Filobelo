# Spec: async backend rewrite

Branch: `async-rewrite` (branched from `followup-fixes`).
Scope: `backend/` only. The frontend and the HTTP API must not change.

## Goal

Every route, dependency and database call in `backend/app` runs as `async`,
and every test in `backend/tests` is `async`. Behaviour seen by a client is
identical: same URLs, status codes, response bodies, error shape
(`{"message": ...}`), rate limits and log lines.

## Done means

- No sync `Session`, `create_engine` or `sessionmaker` left in `app/`,
  `alembic/` or `tests/`.
- No blocking network or disk call runs on the event loop.
- The full suite passes with the same test count as the starting commit
  (360), with no test deleted or weakened to get there.
- `uv run fastapi dev` starts, and a manual pass through login, creating a
  workspace, a task, a file upload and a bot message works.

## Reference style: read this first

The owner's own async FastAPI project is at
`/home/mikelange64/lessons/python/fast_api`. It is a small learning project,
so it does not cover everything Filobelo does, but **it is the style to
follow**: the owner wrote it, likes it and understands it. Read
`database.py`, `auth.py`, `routers/posts.py`, `routers/users.py`,
`image_utils.py`, `email_utils.py`, `alembic/env.py`, `tests/conftest.py` and
`tests/test_posts.py` before writing any code. Where this spec and that
project disagree on style, that project wins; where it has no answer, extend
its patterns rather than introducing a different approach.

The patterns to copy:

- **Engine and session** (`database.py`): `create_async_engine`,
  `async_sessionmaker(bind=engine, class_=AsyncSession,
  expire_on_commit=False)`, and
  `async def get_db(): async with AsyncSessionLocal() as session: yield session`.
  The engine is disposed in the lifespan hook (`await engine.dispose()`).
  Filobelo keeps its `DbSession` alias; it becomes
  `Annotated[AsyncSession, Depends(get_db)]`.
- **Queries**: two steps, as written there:
  `result = await db.execute(select(...))` then `result.scalars().first()` /
  `.all()` / `result.scalar() or 0`.
- **Relationships**: `.options(selectinload(Model.rel))` in the query, and
  after a write `await db.refresh(obj, attribute_names=["rel"])`.
- **Blocking library calls**: plain sync private functions wrapped by an
  `async def` that calls `await run_in_threadpool(fn, *args)` from
  `starlette.concurrency` (see `upload_profile_image` in `image_utils.py`
  and the image processing call in `routers/users.py`). Use
  `run_in_threadpool`, not `asyncio.to_thread`.
- **Email**: `aiosmtplib` with `async def send_email`. This is the one new
  package this rewrite is expected to add; it is in the reference project,
  so treat it as approved.
- **Alembic**: the async `env.py` (`async_engine_from_config`,
  `connection.run_sync(do_run_migrations)`, `asyncio.run(...)`).
- **Tests** (`tests/conftest.py`): `pytest_plugins = ["anyio"]`, a
  session-scoped `anyio_backend` fixture returning `"asyncio"`, the engine
  created with `poolclass=NullPool`, `conn.run_sync(Base.metadata.create_all)`,
  the per-test connection + transaction + `async_sessionmaker(...,
  join_transaction_mode="create_savepoint")` rollback fixture, an
  `httpx.AsyncClient` over `ASGITransport(app=app)`, async helper functions
  (`create_test_user`, `login_user`), and `@pytest.mark.anyio` on each test.

Where the reference has no answer, extend it in the same spirit:

- **Redis**: `redis.asyncio` client; the rate limiters become `async def`
  dependencies.
- **Bot**: `AsyncOpenAI` and `httpx.AsyncClient` (also for oEmbed).
- **Password hashing**: the reference hashes inline. Argon2 takes tens of
  milliseconds of CPU, so here wrap `hash_password` / `verify_password`
  calls in `run_in_threadpool`, the same way the reference wraps image
  processing.
- **Background tasks**: the reference sends its reset email through
  `BackgroundTasks`. Filobelo currently sends inline and logs a failure. Keep
  that (awaited inline, same log line) unless switching can be done with no
  change to any test; behaviour comes first.

Do not copy from the reference: its flat module layout (`import models`),
its error shape (`detail`; Filobelo returns `{"message": ...}`), or the
`name : Type` spacing in some of its files (see Style below).

## Starting state (facts, verified 2026-11-14)

- 141 sync functions in `app/`; the only `async def` are the lifespan hook in
  `app/main.py` and `RequestLoggingMiddleware`.
- `app/database.py`: sync `create_engine`, `SessionLocal`, `get_db`,
  `DbSession = Annotated[Session, Depends(get_db)]`.
- Driver is `psycopg` 3, which supports async. **No new runtime dependency is
  needed**: use `create_async_engine` with a `postgresql+psycopg://` URL. The
  default `database_url` in `app/config.py` is `postgresql://...`; the async
  engine needs the `+psycopg` form, so normalise the URL in `database.py`
  rather than requiring a change to the production `.env`.
- 26 `relationship()` definitions, none with an explicit `lazy=` setting, and
  only 11 `joinedload`/`selectinload` uses. Everything else is loaded lazily.
- Model properties that touch relationships and will fail under async unless
  the relationship is already loaded:
  `Workspace.default_due_date`, `num_of_members`, `num_of_tasks`, `progress`,
  `time_remaining` (`app/models/workspaces.py`), `Conversation.last_message`
  (`app/models/conversations.py`). Response schemas read these.
- Blocking calls to deal with:
  - `app/redis_client.py`: sync `Redis.from_url`, used by every rate limiter.
  - `app/bot_service.py`: sync `OpenAI` client (DeepSeek) and `httpx.post`
    (Tavily search).
  - `app/utils/oembed.py`: `httpx.get`.
  - `app/utils/email_utils.py`: `smtplib`.
  - `app/utils/image_utils.py`, `app/utils/file_utils.py`: `boto3`, Pillow.
  - `UploadFile.file.read()` in `routers/users.py` and `routers/resources.py`.
  - Password hashing (argon2) in `app/auth.py`: CPU-bound, tens of ms.
- Tests: 360, sync `TestClient`, one session-scoped engine, each test wrapped
  in a transaction that is rolled back (`tests/conftest.py`). Helpers in
  `tests/auth_helpers.py` take the client and are called from most tests.

## Rules

1. **Dependencies.** Do not add any package without asking the owner first.
   The one exception is `aiosmtplib`, which the reference project uses.
   Everything else is already installed: SQLAlchemy's async support
   (`greenlet` is in `pyproject.toml`), `redis.asyncio`, `openai.AsyncOpenAI`,
   `httpx.AsyncClient`, and the `anyio` pytest plugin that ships with
   Starlette. `boto3`, Pillow and argon2 stay sync and are called through
   `run_in_threadpool`.
2. **Lazy loading.** Create the session with `expire_on_commit=False`. Every
   relationship a route or schema reads must be loaded explicitly
   (`selectinload` for collections, `joinedload` for many-to-one) in the
   query that fetches the row. Do not reach for `lazy="selectin"` on the
   model as a blanket fix: it hides N+1 queries. Prefer replacing the
   count-style properties (`num_of_members`, `num_of_tasks`) with SQL counts
   where a route only needs the number. `db.refresh(obj)` after a commit does
   not reload relationships; pass `attribute_names=[...]` or re-query.
3. **Access scoping stays.** `get_task_by_id(task_id, workspace_id, db)`,
   `get_resource_by_id(resource_id, task_id, db)`,
   `get_folder_by_id(folder_id, owner_id, db)` keep their parent-id
   parameters. `require_membership`, `require_admin`,
   `require_task_in_workspace` keep their behaviour. The cross-workspace
   isolation tests in `test_tasks.py` and `test_resources.py` must pass
   unmodified apart from the mechanical `async`/`await` change.
4. **Logging.** `app/logging_config.py` stores the request context in a
   mutable dict inside a `ContextVar` because sync routes run in a worker
   thread with a copied context. Once routes are async that workaround is no
   longer needed, but leave it working; simplify only if
   `tests/test_logging.py` still passes.
5. **Alembic goes async the way the reference does it** (`alembic/env.py`
   there). Do not create a migration; this rewrite changes no schema. Check
   `uv run alembic current` still reports `b7d2e4a91c63 (head)` afterwards.
6. **Style.** Annotations are written `name: Type` with any alignment padding
   after the colon (see `app/models/`). Keep existing comments; update the
   ones that say "because the app is sync".
7. **Tests are converted, not rewritten.** Same names, same assertions.
   Mechanical changes only: `async def`, `await client...`,
   `@pytest.mark.anyio` on each test, async fixtures and helpers. If a test fails after
   conversion, the application code is wrong until proven otherwise.

## Test isolation (read before running anything)

The test database (`test_workspaceapp`) and Redis index 15 are created,
flushed and dropped by each pytest session. Another session may be running
tests on another branch at the same time, and two runs against the same
database corrupt each other.

First change on this branch: make `tests/conftest.py` read
`TEST_DATABASE_URL` and `TEST_REDIS_URL` from the environment, defaulting to
today's values, then run this branch's tests with its own database and Redis
index (for example `test_workspaceapp_async` and index 14). Work in a
separate checkout (`git worktree add ../WorkspaceApp-async async-rewrite`) so
the two sessions never share a working directory.

The per-test rollback fixture is the one in the reference project's
`tests/conftest.py`; copy it.

## Phases

Keep the suite green at the end of each phase and commit each one separately.
During the conversion a sync and an async session dependency may coexist so
that routers can move one at a time.

1. **Test plumbing.** Env-configurable test DB and Redis; async engine and
   session fixtures alongside the sync ones; one async client fixture.
2. **Core.** `database.py` (async engine, `get_db`, `DbSession`),
   `redis_client.py` (rate limiters), `auth.py` (`get_current_user`, token
   helpers; hashing through `to_thread`), `dependencies.py`,
   `utils/queries.py`.
3. **Routers, one per commit**, each with its test file: `users`,
   `workspaces`, `folders`, `tasks`, `resources`, `conversations`,
   `superusers`.
4. **Blocking I/O.** Bot service (`AsyncOpenAI`, `httpx.AsyncClient`),
   oEmbed, email (`aiosmtplib`), S3 and image processing
   (`run_in_threadpool`), upload reads (`await file.read(...)`).
5. **Cleanup.** Remove the sync session and fixtures, convert
   `alembic/env.py`, confirm nothing imports the sync pieces, run the full
   suite twice.

## Things that will bite

- `MissingGreenlet` means a lazy load happened; find the relationship and
  load it in the query. It often appears only when the response is
  serialised, not in the route body.
- `db.execute`, `db.commit`, `db.flush`, `db.refresh`, `db.get`, `db.delete`
  are all awaited; `db.add` is not.
- A sync function that takes `db` and is called from a route (helpers in
  `dependencies.py` such as `handle_membership_departure`, the rate
  limiters) must become async too, and every caller must await it. A missed
  `await` returns a coroutine that is truthy, so a membership check can
  silently pass. Grep for calls to every converted function.
- The bot route stores the user's message before calling the model; keep
  that ordering, the frontend's failure handling depends on it.
- `run_in_threadpool` for S3 and image work: never pass the `AsyncSession`
  into the thread.
- The database URL must be the `postgresql+psycopg://` form for the async
  engine (the reference's test config uses it).

## Out of scope

Splitting `routers/users.py`, a `queries/` package, any API or schema change,
any frontend change, deployment. Production currently runs uvicorn under
systemd; the start command does not change.
