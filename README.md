# WorkspaceApp

A full-stack collaborative task management web application built with **FastAPI**, **PostgreSQL**, and **React**.

Users can create and manage workspaces individually or with invited members. Each workspace tracks tasks with deadlines and displays an aggregate completion rate calculated from the ratio of completed to total tasks.

## Features

- **Workspaces** — create shared project spaces, invite members, and track overall progress via a completion rate and time remaining against a deadline
- **Dual-ownership tasks** — tasks have both a *creator* (who made it) and an *owner* (who it's assigned to), which can be different users; admins can reassign ownership at any time
- **Role-based access** — workspace admins can add, remove, and promote members; standard members can create and modify tasks freely
- **Scoped visibility** — workspace content (tasks, members) is only visible to workspace members
- **User accounts** — register, login, update profile, change password, delete account; profile picture support
- **JWT authentication** — stateless auth via Bearer tokens with Argon2 password hashing
- **Superuser system** — privileged accounts can inspect any user via a protected admin API
- **Full CRUD** — complete create, read, update, and delete operations across all entities: users, workspaces, members, and tasks

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React *(planned)* |
| Backend | FastAPI |
| Data validation | Pydantic |
| Middleware / requests | Starlette |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Database | PostgreSQL |
| Auth | PyJWT + pwdlib (Argon2) |

## Data Model

The schema involves multiple levels of relational complexity:

- **User ↔ Workspace** — many-to-many membership via a `WorkspaceMember` association table, which also stores the member's role (`admin` or `member`) and join date
- **Task** — belongs to a workspace, and carries two separate user foreign keys: `creator_id` and `owner_id`; tracks a due date and exposes a `days_remaining` property
- **Workspace** — aggregates task completion rate, derives a default due date from its tasks, and tracks time remaining against its own deadline

## Project Structure

```
WorkspaceApp/
├── app/
│   ├── main.py          # App entry point, router registration, exception handlers
│   ├── auth.py          # JWT creation/verification, password hashing, CurrentUser dependency
│   ├── config.py        # Settings (secret key, token expiry, etc.)
│   ├── database.py      # SQLAlchemy engine and session
│   ├── utility.py       # Shared dependencies: require_admin, require_membership, require_superuser
│   ├── models/          # ORM models: User, Task, Workspace, WorkspaceMember
│   ├── routers/         # Route handlers: users, tasks, workspaces
│   ├── schemas/         # Pydantic request/response schemas
│   └── admin/           # Admin-only user management routes (superuser only)
├── static/
│   └── media/           # Uploaded profile pictures; served at /media/profile_pics/
├── templates/           # Jinja2 templates (home, error pages)
├── alembic/             # Database migration scripts
├── seed.py              # Database seeding utility
├── make_admin.py        # CLI utility to promote a user to superuser
└── pyproject.toml
```

## Getting Started

### Install dependencies

```bash
pip install uv
uv sync
```

### Configure environment

Create a `.env` file with at minimum:

```
SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://user:password@localhost/workspaceapp
```

### Run migrations

```bash
alembic upgrade head
```

### Start the backend

```bash
fastapi dev app/main.py
```

The API will be available at `http://localhost:8000`. Interactive docs are at `/docs`.

## API Overview

### Users

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/users` | Register a new user |
| `POST` | `/api/users/login` | Login and receive a JWT |
| `GET` | `/api/users/me` | Get current user profile |
| `GET` | `/api/users/{user_id}` | Get a public user profile |
| `GET` | `/api/users/me/workspaces` | List current user's workspaces |
| `PATCH` | `/api/users/me` | Update profile (username, email, image) |
| `PATCH` | `/api/users/me/change-password` | Change password |
| `DELETE` | `/api/users/me` | Delete account |

### Workspaces

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/workspaces` | Create a workspace |
| `GET` | `/api/workspaces/{id}` | Get workspace details, members, tasks, and completion rate |
| `GET` | `/api/workspaces/tasks/{id}` | List workspace tasks |
| `GET` | `/api/workspaces/members/{id}` | List workspace members |
| `PATCH` | `/api/workspaces/{id}` | Update workspace |
| `PATCH` | `/api/workspaces/members/add/{ws_id}/{user_id}` | Add a member (admin only) |
| `PATCH` | `/api/workspaces/members/remove/{ws_id}/{user_id}` | Remove a member (admin only) |
| `PATCH` | `/api/workspaces/members/make-admin/{ws_id}/{user_id}` | Promote a member to admin |
| `PATCH` | `/api/workspaces/me/{id}` | Leave a workspace |
| `DELETE` | `/api/workspaces/{id}` | Delete workspace (admin only) |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tasks` | Create a task |
| `GET` | `/api/tasks/me/{task_id}/{workspace_id}` | Get a task |
| `PATCH` | `/api/tasks/{task_id}/{workspace_id}` | Update a task |
| `PATCH` | `/api/tasks/make-owner/{ws_id}/{user_id}/{task_id}` | Reassign task owner (admin only) |
| `DELETE` | `/api/tasks/{task_id}/{workspace_id}` | Delete a task |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin-users/all` | List all users (superuser only) |
| `GET` | `/api/admin-users/{user_id}` | Get any user by ID (superuser only) |

This project is currently under active development. The backend API is nearing completion; the React frontend has not yet been started. Remaining backend work before moving to the frontend: profile picture uploads (object storage), pagination on list endpoints, and email verification with task/workspace notification emails.
