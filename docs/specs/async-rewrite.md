# Spec: async backend rewrite

Branch: `async-rewrite` (branched from `followup-fixes`).
Scope: `backend/` only. The frontend and the HTTP API must not change.

## Goal

Every route, dependency and database call in `backend/app` runs as `async`,
and every test in `backend/tests` is `async`. Behaviour seen by a client is
identical: same URLs, status codes, response bodies, error shape
(`{"message": ...}`), rate limits and log lines.

## Done means

- No sync `Session`, `create_engine` or `sessionmaker` left in `app/`
  (Alembic is the one allowed exception, see below).
- No blocking network or disk call runs on the event loop.
- The full suite passes with the same test count as the starting commit
  (360), with no test deleted or weakened to get there.
- `uv run fastapi dev` starts, and a manual pass through login, creating a
  workspace, a task, a file upload and a bot message works.

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
   Expected to be enough: `sqlalchemy[asyncio]` features already installed
   (`greenlet` is in `pyproject.toml`), `redis.asyncio`, `openai.AsyncOpenAI`,
   `httpx.AsyncClient`, and the `anyio` pytest plugin that ships with
   Starlette (`@pytest.mark.anyio`, `httpx.AsyncClient` +
   `ASGITransport(app=app)`). `boto3`, `smtplib`, Pillow and argon2 stay sync
   and are called through `asyncio.to_thread`.
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
5. **Alembic stays sync.** `alembic/env.py` keeps using a sync engine. Do not
   create a migration; this rewrite changes no schema.
6. **Style.** Annotations are written `name: Type` with any alignment padding
   after the colon (see `app/models/`). Keep existing comments; update the
   ones that say "because the app is sync".
7. **Tests are converted, not rewritten.** Same names, same assertions.
   Mechanical changes only: `async def`, `await client...`,
   `pytestmark = pytest.mark.anyio`, async fixtures. If a test fails after
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

The per-test rollback pattern carries over to async: open an
`AsyncConnection`, begin a transaction, bind an `AsyncSession` to it with
`join_transaction_mode="create_savepoint"`, roll back at the end.

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
   oEmbed, email, S3 and image processing, upload reads
   (`await file.read(...)`).
5. **Cleanup.** Remove the sync session and fixtures, confirm nothing imports
   them, run the full suite twice.

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
- `asyncio.to_thread` for S3 and SMTP: do not pass the `AsyncSession` into
  the thread.

## Out of scope

Splitting `routers/users.py`, a `queries/` package, any API or schema change,
any frontend change, deployment. Production currently runs uvicorn under
systemd; the start command does not change.
