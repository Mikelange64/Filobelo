"""Tests for application logging (app/logging_config.py and the log calls
added around the app).

`caplog` is pytest's built-in fixture that records every log record emitted
during a test. Its handler does not have our RequestContextFilter attached
(that lives on the real console handler), so the tests that need the
request id / user id of a record attach the filter themselves via the
`context_caplog` fixture below.
"""

import logging

import pytest

from app.logging_config import REQUEST_ID_HEADER, RequestContextFilter
from tests.auth_helpers import auth_header

PASSWORD = "testpassword123"  # the default in tests/auth_helpers.py


@pytest.fixture(autouse=True)
def _capture_all_app_levels(caplog):
    """Make these tests independent of whatever LOG_LEVEL the local .env sets."""
    caplog.set_level(logging.DEBUG, logger="app")


@pytest.fixture
def context_caplog(caplog):
    """caplog, capturing DEBUG and up from the app's loggers, with each
    record stamped with request_id / user_id like the real console handler."""
    context_filter = RequestContextFilter()
    caplog.handler.addFilter(context_filter)
    caplog.set_level(logging.DEBUG, logger="app")
    yield caplog
    caplog.handler.removeFilter(context_filter)


def _request_lines(caplog) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "app.request"]


# ========================================================================================
# REQUEST ID
# ========================================================================================


@pytest.mark.anyio
async def test_request_id_header_on_success(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert len(response.headers[REQUEST_ID_HEADER]) == 8


@pytest.mark.anyio
async def test_request_id_header_on_error_responses(client):
    not_found = await client.get("/api/this-route-does-not-exist")
    assert not_found.status_code == 404
    assert REQUEST_ID_HEADER in not_found.headers

    unauthenticated = await client.get("/api/users/me")
    assert unauthenticated.status_code == 401
    assert REQUEST_ID_HEADER in unauthenticated.headers


@pytest.mark.anyio
async def test_request_id_differs_per_request_and_ignores_client_value(client):
    first = await client.get("/health", headers={REQUEST_ID_HEADER: "chosen-by-client"})
    second = await client.get("/health")

    assert first.headers[REQUEST_ID_HEADER] != "chosen-by-client"
    assert first.headers[REQUEST_ID_HEADER] != second.headers[REQUEST_ID_HEADER]


# ========================================================================================
# REQUEST LINE
# ========================================================================================


@pytest.mark.anyio
async def test_request_line_has_method_path_status_and_matching_request_id(
    client, context_caplog
):
    response = await client.get("/api/users/me")  # no token -> 401

    lines = _request_lines(context_caplog)
    assert len(lines) == 1
    line = lines[0]
    assert line.levelno == logging.INFO
    assert "GET /api/users/me -> 401" in line.getMessage()
    assert "ms" in line.getMessage()
    assert line.request_id == response.headers[REQUEST_ID_HEADER]
    assert line.user_id == "-"


@pytest.mark.anyio
async def test_request_line_carries_authenticated_user_id(
    client, user, user_token, context_caplog
):
    context_caplog.clear()
    response = await client.get("/api/users/me", headers=auth_header(user_token))
    assert response.status_code == 200

    line = _request_lines(context_caplog)[-1]
    assert line.user_id == user["id"]


@pytest.mark.anyio
async def test_request_line_never_contains_query_string_or_token(
    client, user_token, context_caplog
):
    context_caplog.clear()
    await client.get(
        "/api/users/search?q=someone@example.com", headers=auth_header(user_token)
    )

    assert "someone@example.com" not in context_caplog.text
    assert user_token not in context_caplog.text


@pytest.mark.anyio
async def test_health_check_is_logged_at_debug_only(client, context_caplog):
    await client.get("/health")

    lines = _request_lines(context_caplog)
    assert len(lines) == 1
    assert lines[0].levelno == logging.DEBUG


# ========================================================================================
# UNHANDLED EXCEPTIONS
# ========================================================================================


@pytest.mark.anyio
async def test_unhandled_exception_returns_message_shape_and_is_logged(
    client, context_caplog, monkeypatch
):
    def explode(*args, **kwargs):
        raise RuntimeError("boom from the test")

    # GET /api/users/{id} calls get_user_by_id; make that blow up.
    monkeypatch.setattr("app.routers.users.get_user_by_id", explode)

    response = await client.get("/api/users/1")

    # The client gets the app's standard error shape, not a traceback.
    assert response.status_code == 500
    assert response.json() == {"message": "Internal server error"}
    assert "boom" not in response.text
    request_id = response.headers[REQUEST_ID_HEADER]

    # The log gets the traceback, tagged with the same request id.
    errors = [
        r for r in context_caplog.records if r.levelno == logging.ERROR and r.exc_info
    ]
    assert len(errors) == 1
    assert errors[0].exc_info[0] is RuntimeError
    assert errors[0].request_id == request_id
    assert "boom from the test" in context_caplog.text

    # And the per-request summary line reports the 500 at ERROR.
    summary = _request_lines(context_caplog)[-1]
    assert "-> 500" in summary.getMessage()
    assert summary.levelno == logging.ERROR


# ========================================================================================
# AUTH EVENTS
# ========================================================================================


@pytest.mark.anyio
async def test_failed_login_logs_warning_without_password(client, user, caplog):
    caplog.clear()
    wrong_password = "definitely-not-my-password-42"

    response = await client.post(
        "/api/users/login",
        data={"username": "test@example.com", "password": wrong_password},
    )
    assert response.status_code == 401

    warnings = [
        r
        for r in caplog.records
        if r.levelno == logging.WARNING and "Login failed" in r.getMessage()
    ]
    assert len(warnings) == 1
    assert "test@example.com" in warnings[0].getMessage()
    assert "bad_password" in warnings[0].getMessage()
    # Neither the wrong attempt nor the real password appears anywhere.
    assert wrong_password not in caplog.text
    assert PASSWORD not in caplog.text


@pytest.mark.anyio
async def test_successful_login_logs_info_without_secrets(client, user, caplog):
    caplog.set_level(logging.INFO, logger="app")
    caplog.clear()

    response = await client.post(
        "/api/users/login",
        data={"username": "test@example.com", "password": PASSWORD},
    )
    assert response.status_code == 200
    tokens = response.json()

    assert f"Login succeeded user_id={user['id']}" in caplog.text
    assert PASSWORD not in caplog.text
    assert tokens["access_token"] not in caplog.text
    assert tokens["refresh_token"] not in caplog.text


@pytest.mark.anyio
async def test_invalid_refresh_token_logs_warning_without_token(client, caplog):
    bogus = "not-a-real-refresh-token-abc123"

    response = await client.post("/api/users/refresh", json={"refresh_token": bogus})
    assert response.status_code == 401

    assert any(
        r.levelno == logging.WARNING and "Refresh rejected" in r.getMessage()
        for r in caplog.records
    )
    assert bogus not in caplog.text


@pytest.mark.anyio
async def test_login_rate_limit_logs_warning(client, user, caplog):
    # The login limiter allows 5 attempts a minute; the 6th is rejected.
    for _ in range(6):
        response = await client.post(
            "/api/users/login",
            data={"username": "test@example.com", "password": "wrong-password"},
        )
    assert response.status_code == 429

    assert any(
        r.levelno == logging.WARNING and "Rate limit hit kind=login" in r.getMessage()
        for r in caplog.records
    )


# ========================================================================================
# AUTHORIZATION EVENTS
# ========================================================================================


@pytest.mark.anyio
async def test_non_member_access_logs_warning(
    client, workspace, second_user, second_user_token, caplog
):
    caplog.clear()
    response = await client.get(
        f"/api/workspaces/{workspace['id']}/members",
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 403

    expected = (
        f"Forbidden: not a member user_id={second_user['id']} "
        f"workspace_id={workspace['id']}"
    )
    assert any(
        r.levelno == logging.WARNING and expected in r.getMessage()
        for r in caplog.records
    )


@pytest.mark.anyio
async def test_last_member_leaving_logs_workspace_deletion(
    client, workspace, user_token, caplog
):
    caplog.set_level(logging.INFO, logger="app")
    caplog.clear()

    response = await client.delete(
        f"/api/workspaces/{workspace['id']}/members/me",
        headers=auth_header(user_token),
    )
    assert response.status_code == 204

    assert (
        f"Workspace deleted: last member departed workspace_id={workspace['id']}"
        in caplog.text
    )
