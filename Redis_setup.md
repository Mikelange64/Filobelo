# Redis Setup (Fedora Linux)

---

## 0. A Fedora-Specific Note: You're Actually Running Valkey

On current Fedora, `sudo dnf install redis` installs **Valkey**, an open-source fork of Redis
created after Redis Inc. changed their license in 2024. Most major distros (Fedora, Debian,
Ubuntu) switched their `redis` package to build Valkey instead. It's a drop-in replacement — same
protocol, same commands, same clients (`redis-cli`, `redis-py`) — but the service name, package
name, and config path all say **valkey**, not redis:

```bash
rpm -q redis            # "package redis is not installed" — expected
redis-cli --version     # reports "valkey-cli X.X.X"
systemctl status redis  # actually shows valkey.service
```

Config lives at `/etc/valkey/valkey.conf`, not `/etc/redis/redis.conf` or `/etc/redis.conf`.
Everything else in this guide — `redis-cli`, connection URLs, `redis.asyncio` in Python — is
unaffected, since those all talk to Valkey the same way they'd talk to Redis.

---

## 1. Install & Start the Server

Redis/Valkey is an in-memory data server — a background process that runs continuously and
listens for connections on port 6379. Like PostgreSQL, installing it doesn't connect you to
anything automatically; you still need to start the service.

```bash
sudo dnf install redis                # installs Valkey under the hood, see note above
sudo systemctl enable --now valkey    # start now and on every boot
```

> Unlike PostgreSQL, there's no `--initdb` step. Redis/Valkey has no schema and no disk-backed
> storage to initialize up front — it starts with an empty in-memory keyspace immediately.

Check it's running:

```bash
systemctl status valkey
redis-cli ping    # should return PONG — redis-cli works fine against Valkey
```

> The service is named `valkey`, not `redis` or `redis-server` — this trips people up who are
> following guides written for other distros or older Fedora releases.

---

## 2. No Role or Database Creation Needed

This is the biggest structural difference from PostgreSQL. Redis has:

- **No separate user system** — by default, anyone who can reach the port can run any command.
- **No `createdb` step** — there isn't a concept of multiple named databases the way Postgres has
  `workspaceapp_db`. Redis has 16 numbered databases (`0`–`15`) in the same server, selected with
  `SELECT <n>` or a `db=` parameter in your client. Most projects just use `db=0` and separate
  concerns with key prefixes instead (e.g. `ratelimit:*`, `session:*`).

> Think of it less like "one building, many isolated units" (Postgres) and more like "one big
> shared room" — isolation is a naming convention (key prefixes), not a server-level boundary.

---

## 3. Auth: There's No "Ident Authentication Failed" Step

PostgreSQL ships in a locked-down state that you had to loosen (`ident` → `trust`) before
SQLAlchemy could connect. Redis ships in the *opposite* posture: by default, on Fedora, it:

- Binds only to `127.0.0.1` (loopback) — not reachable from other machines out of the box.
- Requires **no password** for local connections.

So for local dev, there's usually nothing to fix — it works immediately, which is why step 3 in
the Postgres guide has no real equivalent here. Confirm the binding if you're curious:

```bash
sudo grep -E "^bind|^protected-mode|^requirepass" /etc/valkey/valkey.conf
```

You should see something like:
```
bind 127.0.0.1 -::1
protected-mode yes
```

> If you ever need a password locally (e.g. to match a production-like setup), set `requirepass`
> in that file and restart with `sudo systemctl restart valkey`. Don't do this by default — it's
> extra friction for zero benefit in local dev.

---

## 4. Connection String

Similar idea to the SQLAlchemy URL, though most Redis clients also accept plain keyword args
instead of forcing a URL.

```
redis://[:password@]host:port/db_number
```

| Part | What it is |
|---|---|
| `redis` | the scheme (`rediss` for TLS) |
| `password` | omitted entirely for local dev (no `requirepass` set) |
| `host` | where the server is running (`localhost` for your machine) |
| `port` | `6379` by default |
| `db_number` | which of the 16 numbered databases to use (`0` unless you have a reason otherwise) |

Example:
```
REDIS_URL=redis://localhost:6379/0
```

In `redis-py`, this maps to either:

```python
import redis.asyncio as redis

# via URL
redis_client = redis.Redis.from_url("redis://localhost:6379/0", decode_responses=True)

# or equivalently, via kwargs
redis_client = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
```

---

## 5. No Migration Tool — and No Schema to Migrate

PostgreSQL needed Alembic because tables have a fixed shape that evolves over time. Redis has no
schema at all — keys are just strings mapping to values (strings, hashes, lists, sets, sorted
sets). There's nothing to `autogenerate` or `upgrade head`.

The equivalent discipline in Redis is being deliberate about **key naming conventions**, since
that's the only structure you get:

```
ratelimit:{client_id}:{route}
session:{user_id}
cache:user_profile:{user_id}
```

> Pick a convention early and stick to it — it's the closest thing Redis has to a schema, and
> it's enforced by nothing but habit.

---

## 6. Everyday Workflow

There's no revision/apply two-step like Alembic. Changes to data just happen as your app runs.
The commands you'll actually use day-to-day are inspection commands:

```bash
redis-cli KEYS "ratelimit:*"          # find keys by pattern (avoid KEYS in production, see below)
redis-cli GET some_key                # read a value
redis-cli TTL some_key                # seconds until a key expires (-1 = never expires)
redis-cli DEL some_key                # delete a key
redis-cli FLUSHDB                     # wipe the current numbered database
```

---

## 7. Verification Commands

```bash
redis-cli ping                        # confirm the server is up
redis-cli INFO server                 # version, uptime, config summary
redis-cli DBSIZE                      # how many keys exist in the current db
redis-cli -n 0 KEYS "*"               # list all keys in db 0 (fine for dev, avoid in prod)
systemctl status valkey               # confirm the service itself is healthy
```

---

## 8. Nuke & Reset (Development Only)

Use this to wipe everything and start fresh:

```bash
redis-cli FLUSHDB    # wipe only the current numbered database
redis-cli FLUSHALL   # wipe every numbered database on the server
```

> There are no migration files to delete — flushing *is* the full reset, in one command.

---

## 9. Rollback

There isn't one. Redis has no transaction log or version history for you to step backward
through the way `alembic downgrade` does. If a key's value is wrong, you overwrite or delete it —
there's no "undo one change" primitive at the server level.

---

## Production Notes

These don't apply locally but are good habits to understand before you deploy.

**You likely won't manage the server yourself.** Managed Redis providers (Upstash, Redis Cloud,
AWS ElastiCache, Railway) handle installation, persistence, and failover. You get a connection
URL and point your app at it — same pattern as Supabase/Neon for Postgres.

**Set a real password (`requirepass`) and enable TLS.** The no-password, loopback-only default
that's fine locally is not fine on a server facing the internet. Managed providers enforce this
for you automatically.

**Avoid `KEYS` on a large production dataset.** `KEYS` scans the entire keyspace and blocks the
server while it runs. Use `SCAN` instead, which iterates incrementally without blocking.

**Decide on persistence.** By default Redis is often used purely as an in-memory cache/rate-limit
store, and that's fine if losing all keys on restart is acceptable (rate-limit counters just
reset). If you're storing anything you can't afford to lose, enable RDB snapshotting or AOF
logging — most managed providers turn this on by default, but check.

**Set `maxmemory` and an eviction policy.** Unlike Postgres, Redis keeps everything in RAM. Without
a `maxmemory` cap, an unbounded cache can consume all available memory on the host. A common
default for a cache/rate-limit use case is `maxmemory-policy allkeys-lru`.