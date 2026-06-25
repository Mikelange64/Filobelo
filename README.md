# WorkspaceApp

A full-stack collaborative task management web application built with **FastAPI**, **PostgreSQL**, and **React**.

Users can create and manage workspaces individually or with invited members. Each workspace tracks tasks with deadlines and displays an aggregate completion rate calculated from the ratio of completed to total tasks.

## Features

- **Workspaces** — create shared project spaces, invite members, and track overall progress via a completion rate and time remaining against a deadline
- **Dual-ownership tasks** — tasks have both a _creator_ (who made it) and an _owner_ (who it's assigned to), which can be different users; admins can reassign ownership at any time
- **Role-based access** — workspace admins can add, remove, and promote members; standard members can create and modify tasks freely
- **Scoped visibility** — workspace content (tasks, members) is only visible to workspace members
- **User accounts** — register, login, update profile, upload profile picture, change password, delete account
- **Profile pictures** — images are processed (cropped to 300×300, JPEG-optimized) and stored in an S3-compatible object store
- **Password reset** — secure token-based password reset flow with email delivery and token expiration; tokens are stored as SHA-256 hashes
- **Email sending** — SMTP-based email delivery for password resets and future notifications
- **JWT authentication** — stateless auth via Bearer tokens with Argon2 password hashing
- **Superuser system** — privileged accounts can inspect any user via a protected admin API
- **Full CRUD** — complete create, read, update, and delete operations across all entities: users, workspaces, members, and tasks
- **Pagination** — task list endpoints support `skip` and `limit` query parameters with `has_more` indicators
- **Comprehensive test suite** — 170+ tests covering users, workspaces, tasks, authentication, profile pictures, and password reset flows, with mocked S3 and email

## Tech Stack

| Layer            | Technology                            |
| ---------------- | ------------------------------------- |
| Frontend         | React _(planned)_                     |
| Backend          | FastAPI                               |
| Data validation  | Pydantic                              |
| ORM              | SQLAlchemy 2.0                        |
| Migrations       | Alembic                               |
| Database         | PostgreSQL                            |
| Auth             | PyJWT + pwdlib (Argon2)               |
| Object storage   | AWS S3 (boto3)                        |
| Image processing | Pillow                                |
| Email            | smtplib + Jinja2 templates            |
| Testing          | pytest, TestClient, moto (S3 mocking) |

## Data Model

The schema involves multiple levels of relational complexity:

- **User ↔ Workspace** — many-to-many membership via a `WorkspaceMember` association table, which also stores the member's role (`admin` or `member`) and join date
- **Task** — belongs to a workspace, and carries two separate user foreign keys: `creator_id` and `owner_id`; tracks a due date and exposes a `days_remaining` property
- **Workspace** — aggregates task completion rate, derives a default due date from its tasks, and tracks time remaining against its own deadline
- **PasswordResetToken** — stores a hashed reset token per user with an expiration timestamp; cascades on user deletion for security

## Project Structure

```
WorkspaceApp/
├── app/
│   ├── main.py              # App entry point, router registration, exception handlers
│   ├── auth.py              # JWT creation/verification, password hashing,
│   │                        #   reset token generation/hashing, CurrentUser dependency
│   ├── config.py            # Settings (DB, JWT, S3, email, upload limits, etc.)
│   ├── database.py          # SQLAlchemy engine and session
│   ├── dependencies.py      # Shared dependencies: require_admin, require_membership, etc.
│   ├── models/              # ORM models: User, Task, Workspace, WorkspaceMember,
│   │                        #   PasswordResetToken
│   ├── routers/             # Route handlers: users, tasks, workspaces
│   ├── schemas/             # Pydantic request/response schemas (users, tasks,
│   │                        #   workspaces, auth)
│   ├── utils/               # Utility modules:
│   │   ├── image_utils.py   #   Image processing, S3 upload/delete
│   │   ├── email_utils.py   #   SMTP email delivery
│   │   └── queries.py       #   Reusable DB query functions
│   ├── admin/               # Admin-only user management routes (superuser only)
│   └── scripts/             # Standalone utility scripts
│       └── check_s3.py      #   S3 credential/permission verification
├── static/
├── templates/
│   └── email/               # HTML email templates
├── alembic/                 # Database migration scripts
├── tests/                   # Test suite (170+ tests)
│   ├── conftest.py          # Fixtures: DB, client, S3 mocking, test images
│   ├── auth_helpers.py      # Shared test helpers
│   ├── test_users.py        # User CRUD + profile tests
│   ├── test_workspaces.py   # Workspace CRUD + member management tests
│   ├── test_tasks.py        # Task CRUD + operations tests
│   └── test_auth_and_media.py  # Password reset + profile picture tests
├── seed.py                  # Database seeding utility
├── make_admin.py            # CLI utility to promote a user to superuser
└── pyproject.toml
```

## Getting Started

### Prerequisites

- Python 3.14+
- PostgreSQL
- An S3-compatible object store (optional for development — tests use mocked S3)

### Install dependencies

```bash
pip install uv
uv sync
```

### Configure environment

Create a `.env` file in the project root. At minimum:

```ini
SECRET_KEY=your-secret-key
DATABASE_URL=postgresql+psycopg://user:password@localhost/workspaceapp

# S3 / profile pictures (optional — without these, profile pic uploads will fail)
S3_BUCKET_NAME=your-bucket
S3_REGION=us-east-2
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key

# Email / password reset (optional — without these, email sending will fail)
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=your-email
MAIL_PASSWORD=your-password
MAIL_FROM=noreply@example.com
FRONTEND_URL=http://localhost:3000
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

| Method   | Endpoint                     | Auth   | Description                                             |
| -------- | ---------------------------- | ------ | ------------------------------------------------------- |
| `POST`   | `/api/users`                 | —      | Register a new user                                     |
| `POST`   | `/api/users/login`           | —      | Login and receive a JWT                                 |
| `GET`    | `/api/users/me`              | Bearer | Get current user profile                                |
| `PATCH`  | `/api/users/me`              | Bearer | Update profile (username, email)                        |
| `DELETE` | `/api/users/me`              | Bearer | Delete account (also cleans up profile picture from S3) |
| `GET`    | `/api/users/{user_id}`       | —      | Get a public user profile                               |
| `GET`    | `/api/users/me/workspaces`   | Bearer | List current user's workspaces                          |
| `PATCH`  | `/api/users/me/password`     | Bearer | Change password                                         |
| `PATCH`  | `/api/users/me/picture`      | Bearer | Upload profile picture (multipart form)                 |
| `DELETE` | `/api/users/me/picture`      | Bearer | Delete profile picture                                  |
| `POST`   | `/api/users/forgot-password` | —      | Request password reset email                            |
| `POST`   | `/api/users/resert-password` | —      | Reset password with token                               |

### Workspaces

| Method   | Endpoint                                       | Auth   | Description                                |
| -------- | ---------------------------------------------- | ------ | ------------------------------------------ |
| `POST`   | `/api/workspaces`                              | Bearer | Create a workspace (creator becomes admin) |
| `GET`    | `/api/workspaces/{id}`                         | —      | Get workspace details (public read)        |
| `PATCH`  | `/api/workspaces/{id}`                         | Bearer | Update workspace (member)                  |
| `PUT`    | `/api/workspaces/{id}/`                        | Bearer | Full update workspace (member)             |
| `DELETE` | `/api/workspaces/{id}/`                        | Bearer | Delete workspace (admin only)              |
| `GET`    | `/api/workspaces/{id}/members`                 | Bearer | List workspace members (member)            |
| `PATCH`  | `/api/workspaces/{id}/members/{user_id}`       | Bearer | Add a member (admin only)                  |
| `PATCH`  | `/api/workspaces/{id}/members/{user_id}/admin` | Bearer | Promote to admin (admin only)              |
| `DELETE` | `/api/workspaces/{id}/members/me`              | Bearer | Leave a workspace                          |
| `DELETE` | `/api/workspaces/{id}/members/{user_id}`       | Bearer | Remove a member (admin only)               |

### Tasks

| Method   | Endpoint                                           | Auth   | Description                                 |
| -------- | -------------------------------------------------- | ------ | ------------------------------------------- |
| `POST`   | `/api/workspaces/{ws_id}/tasks/`                   | Bearer | Create a task (member)                      |
| `GET`    | `/api/workspaces/{ws_id}/tasks/`                   | Bearer | List tasks (paginated: `?skip=0&limit=10`)  |
| `GET`    | `/api/workspaces/{ws_id}/tasks/{task_id}`          | Bearer | Get a task                                  |
| `PATCH`  | `/api/workspaces/{ws_id}/tasks/{task_id}/`         | Bearer | Partial update task                         |
| `PUT`    | `/api/workspaces/{ws_id}/tasks/{task_id}`          | Bearer | Full update task (owner only)               |
| `DELETE` | `/api/workspaces/{ws_id}/tasks/{task_id}`          | Bearer | Delete task (admin only)                    |
| `PATCH`  | `/api/workspaces/{ws_id}/tasks/{task_id}/complete` | Bearer | Mark task complete                          |
| `PATCH`  | `/api/workspaces/{ws_id}/tasks/{task_id}/owner`    | Bearer | Change task owner (admin only)              |
| `PATCH`  | `/api/workspaces/{ws_id}/tasks/{task_id}/move`     | Bearer | Move task to another workspace (admin only) |

### Admin (superuser only)

| Method | Endpoint                     | Description        |
| ------ | ---------------------------- | ------------------ |
| `GET`  | `/api/admin-users/all`       | List all users     |
| `GET`  | `/api/admin-users/{user_id}` | Get any user by ID |

## Testing

The project has 170+ tests covering all endpoints, authentication, profile picture uploads to mocked S3, password reset flows, and business logic. Tests use `pytest` with in-memory mocking for external services.

```bash
# Run the full suite
pytest tests/

# Run a specific test file
pytest tests/test_auth_and_media.py -v

# Run with a specific database (creates/drops test tables automatically)
# The test database is configured via DATABASE_URL in conftest.py
```

### Test isolation

- **Database**: Each test session creates a fresh schema. Each test function runs in a transaction that is rolled back after the test.
- **S3**: The `mocked_s3` fixture uses `moto` to create an in-memory mock S3 bucket — no real AWS calls are made.
- **Email**: The `send_password_reset_email` function is patched with `unittest.mock` so no real SMTP connection is attempted.

## Development Status

The backend API is feature-complete. The React frontend has not yet been started. If you encounter any issues, please open an issue or submit a PR.
