"""TRANSITIONAL (async rewrite): deleted in the cleanup phase.

The sync versions of the core pieces (session, current-user dependency,
membership checks, query helpers, rate limiters), kept only so the routers
that have not been converted yet keep working while the others move to async
one at a time. A router is converted by pointing its imports back at the real
modules (app.database, app.auth, app.dependencies, app.utils, app.redis_client)
and adding async/await. Nothing new should import from here.
"""
