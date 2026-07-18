# PostgreSQL & Alembic Setup (Fedora Linux)

---

## 1. Install & Start the Server

PostgreSQL is a database server — a background process that runs continuously, manages data on disk,
and listens for connections on port 5432. Installing it doesn't connect you to anything automatically;
you still need to initialize storage and start the service.

```bash
sudo dnf install postgresql-server postgresql-contrib  # install the engine
sudo postgresql-setup --initdb                         # create storage on disk (Fedora-specific)
sudo systemctl enable --now postgresql                 # start now and on every boot
```

> The server is now always running in the background. It uses negligible resources at idle so
> there's no need to stop it between projects. Disabling it does not affect your data.

---

## 2. Create Your Role & Database

PostgreSQL has its own user system separate from Linux. By creating a role that matches your Linux
username, the server recognizes you automatically — no password needed locally.

```bash
sudo -u postgres createuser -s $(whoami)  # create a superuser role matching your Linux username
createdb workspaceapp_db                  # create the application database
```

Each project gets its own database. The PostgreSQL server is shared — think of it as one building
hosting multiple isolated units. You can see all of them with `psql -l`.

> **Naming tip:** use lowercase table and database names. PostgreSQL is case-sensitive when names
> are quoted, which forces you to quote them in every raw SQL query. Lowercase avoids that entirely.

---

## 3. Fix: "Ident Authentication Failed"

By default, Fedora's PostgreSQL requires ident authentication for TCP connections, which blocks
SQLAlchemy and Alembic. Change it to `trust` for local development.

```bash
sudo nano /var/lib/pgsql/data/pg_hba.conf
```

Find these lines near the bottom and update the method column:

```
# Before
host   all   all   127.0.0.1/32   ident
host   all   all   ::1/128        ident

# After
host   all   all   127.0.0.1/32   trust
host   all   all   ::1/128        trust
```

```bash
sudo systemctl restart postgresql  # apply the changes
```

> `trust` means no password is required for local connections. Fine for development — never use it
> in production. In prod, authentication is handled by your managed database provider (Supabase,
> Neon, etc.) via a connection string with real credentials.

---

## 4. Connection String

SQLAlchemy and Alembic connect to PostgreSQL via a URL you construct. Each piece maps to a real
value the server needs to accept the connection.

```
postgresql+psycopg://username@host/database_name
```

| Part | What it is |
|---|---|
| `postgresql` | the database type |
| `+psycopg` | tells SQLAlchemy to use the psycopg3 driver |
| `username` | your Postgres role (matches your Linux username) |
| `host` | where the server is running (`localhost` for your machine) |
| `database_name` | the database you created with `createdb` |

Example:
```
DATABASE_URL=postgresql+psycopg://mikelange64@localhost/workspaceapp_db
```

No password is needed because of the `trust` rule set above. In production, Supabase or Neon will
hand you a complete connection string with all four parts filled in, including a real password.

---

## 5. Alembic Setup

Alembic is a migration tool — it tracks schema changes over time like version control for your
database. Once you use Alembic, it owns the schema. Remove any `Base.metadata.create_all()` calls
from your app; they conflict with Alembic and silently ignore column changes on existing tables.

**Install and initialize (once per project):**

```bash
uv add alembic
uv run alembic init alembic   # use `-t async` if your project uses async SQLAlchemy
```

Then update `alembic/env.py` to import your `Base` and models, and load your `.env` so Alembic
can read `DATABASE_URL`.

**Recommended `context.configure()` settings in `env.py`:**

```python
context.configure(
    connection=connection,
    target_metadata=target_metadata,
    compare_type=True,           # detect column type changes e.g. String(50) → String(200)
    compare_server_default=True, # detect server_default changes
)
```

> Without `compare_type`, changing a column type in your model produces an empty migration file
> and your database silently falls out of sync.

---

## 6. Alembic Workflow

Run these every time you change a model.

```bash
uv run alembic revision --autogenerate -m "describe the change"
```
Alembic compares your models to the current database state and generates a migration file.
It only creates the file — it does not apply it. Review it before proceeding.

```bash
# review the generated file in alembic/versions/
uv run alembic upgrade head   # apply all pending migrations to the database
```

> This is analogous to `git commit` (revision) then `git push` (upgrade).

---

## 7. Verification Commands

```bash
psql -l                                      # list all databases on the server
psql workspaceapp_db                         # connect to a database
\dt                                          # list all tables (inside psql)
\d tablename                                 # describe a table's columns and types
psql -d workspaceapp_db -c "\dt"             # list tables without entering psql
uv run alembic current                       # check which migration version is applied
```

---

## 8. Nuke & Reset (Development Only)

Use this to wipe everything and start fresh — useful when iterating on your schema early on.

```bash
dropdb workspaceapp_db && createdb workspaceapp_db  # wipe and recreate the database
rm alembic/versions/*.py                            # clear migration history
```

Then generate a fresh initial migration and apply it.

---

## 9. Rollback

To undo migrations one step at a time:

```bash
uv run alembic downgrade -1   # go back one version
uv run alembic downgrade -2   # go back two versions
```

---

## Production Notes

These don't apply locally but are good habits to understand before you deploy.

**You won't manage the server.** In production, you use a managed database provider (Supabase,
Neon, Railway, AWS RDS). They handle installation, configuration, backups, and restarts. You just
get a connection string and point your app at it. Your entire local setup collapses to one `.env`
change.

**Use `scram-sha-256` auth, not `trust`.** Managed providers enforce real password authentication.
Never set `trust` on a server that faces the internet.

**Create a dedicated database user per app.** Rather than connecting as a superuser, create a role
with only the permissions your app needs (`CONNECT`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`). If
the app is ever compromised, the blast radius is limited.

**Run migrations as a deploy step.** `uv run alembic upgrade head` should run automatically during
your deployment pipeline before your app starts — not manually after. This ensures the schema is
always in sync with the code being deployed.

**Never delete migration files in production.** The `rm alembic/versions/*.py` nuke is for local
dev only. In production, migration files are the historical record of every schema change. Deleting
them breaks rollback and confuses any environment that hasn't run them yet.