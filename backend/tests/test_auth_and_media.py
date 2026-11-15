import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from io import BytesIO
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.auth import hash_reset_token
from app.database import DbSession
from app.models import PasswordResetToken, User
from tests.auth_helpers import auth_header, create_test_user, login_user

prefix = "/api/users"

# ========================================================================================
# ASSERTION HELPERS
# ========================================================================================


def assert_auth_error(response):
    assert response.status_code == 401


def count_s3_objects(s3_client, bucket: str) -> int:
    result = s3_client.list_objects_v2(Bucket=bucket)
    return len(result.get("Contents", []))


# ========================================================================================
# FORGOT PASSWORD  (POST /forgot-password)
# ========================================================================================


@pytest.mark.anyio
async def test_forgot_password_sends_email(client: AsyncClient, user):
    """A valid email address triggers the password reset email."""
    target = "app.routers.users.send_password_reset_email"

    with patch(target) as mock_send:
        response = await client.post(
            f"{prefix}/forgot-password",
            json={"email": "test@example.com"},
        )

    assert response.status_code == 202
    mock_send.assert_called_once()
    call_kwargs = mock_send.call_args.kwargs
    assert call_kwargs["to_email"] == "test@example.com"
    assert call_kwargs["username"] == "testuser"
    assert "token" in call_kwargs


@pytest.mark.anyio
async def test_forgot_password_unknown_email_returns_same_status(client: AsyncClient):
    """Unknown email returns 202 to avoid email enumeration."""
    target = "app.routers.users.send_password_reset_email"

    with patch(target) as mock_send:
        response = await client.post(
            f"{prefix}/forgot-password",
            json={"email": "unknown@example.com"},
        )

    assert response.status_code == 202
    mock_send.assert_not_called()


@pytest.mark.anyio
async def test_forgot_password_invalid_email_format(client: AsyncClient):
    response = await client.post(
        f"{prefix}/forgot-password",
        json={"email": "not-an-email"},
    )
    assert response.status_code == 422


# ========================================================================================
# RESET PASSWORD  (POST /reset-password) — note: endpoint path has a typo "reset-password"
# ========================================================================================


@pytest.mark.anyio
async def test_reset_password_success(client: AsyncClient, db_session):
    """A valid reset token changes the user's password."""
    await create_test_user(client)

    # Generate a real reset token for the user
    token = secrets.token_urlsafe(32)
    token_hash = hash_reset_token(token)
    user = (await db_session.execute(select(User))).scalars().first()
    user.is_verified = True
    expires_at = datetime.now(UTC) + timedelta(hours=1)
    reset_token = PasswordResetToken(
        user_id=user.id, token_hash=token_hash, expires_at=expires_at
    )
    db_session.add(reset_token)
    await db_session.commit()

    response = await client.post(
        f"{prefix}/reset-password",
        json={"token": token, "new_password": "newsecurepassword"},
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Password changed successfully"

    # Verify the password actually changed (login with old password fails)
    login_fails = await client.post(
        f"{prefix}/login",
        data={"username": "test@example.com", "password": "testpassword123"},
    )
    assert login_fails.status_code == 401

    # Login with new password works
    login_ok = await client.post(
        f"{prefix}/login",
        data={"username": "test@example.com", "password": "newsecurepassword"},
    )
    assert login_ok.status_code == 200


@pytest.mark.anyio
async def test_reset_password_invalid_token(client: AsyncClient):
    await create_test_user(client)

    response = await client.post(
        f"{prefix}/reset-password",
        json={"token": "totally-fake-token", "new_password": "newsecurepassword"},
    )

    assert response.status_code == 400
    assert "Invalid or expired reset token" in response.json()["message"]


@pytest.mark.anyio
async def test_reset_password_expired_token(client: AsyncClient, db_session):
    """An expired token returns 400 and is deleted."""
    await create_test_user(client)
    token = secrets.token_urlsafe(32)
    token_hash = hash_reset_token(token)
    user = (await db_session.execute(select(User))).scalars().first()
    expires_at = datetime.now(UTC) - timedelta(hours=1)  # expired
    reset_token = PasswordResetToken(
        user_id=user.id, token_hash=token_hash, expires_at=expires_at
    )
    db_session.add(reset_token)
    await db_session.commit()

    response = await client.post(
        f"{prefix}/reset-password",
        json={"token": token, "new_password": "newsecurepassword"},
    )

    assert response.status_code == 400
    assert "Invalid or expired reset token" in response.json()["message"]

    # The expired token should be cleaned up
    remaining = (await db_session.execute(select(PasswordResetToken))).scalars().all()
    assert len(remaining) == 0


@pytest.mark.anyio
async def test_reset_password_missing_new_password(client: AsyncClient):
    response = await client.post(
        f"{prefix}/reset-password",
        json={"token": "some-token"},
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_reset_password_new_password_too_short(client: AsyncClient):
    response = await client.post(
        f"{prefix}/reset-password",
        json={"token": "some-token", "new_password": "short"},
    )
    assert response.status_code == 422


# ========================================================================================
# UPLOAD PROFILE PICTURE  (PATCH /me/picture)
# ========================================================================================


@pytest.mark.anyio
async def test_upload_profile_picture_success(
    client: AsyncClient, user_auth_headers, mocked_s3, test_image
):
    response = await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
        headers=user_auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["image_path"].startswith("https://")
    assert data["image_path"].endswith(".jpeg")

    # Verify S3 has the uploaded object
    assert count_s3_objects(mocked_s3, "test-bucket") == 1


@pytest.mark.anyio
async def test_upload_profile_picture_replaces_old(
    client: AsyncClient, user_auth_headers, mocked_s3, test_image
):
    """Uploading a second picture removes the old one from S3."""
    # First upload
    await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("first.jpg", BytesIO(test_image), "image/jpeg")},
        headers=user_auth_headers,
    )
    assert count_s3_objects(mocked_s3, "test-bucket") == 1

    # Second upload replaces
    response = await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("second.jpg", BytesIO(test_image), "image/jpeg")},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    # Still only 1 object in S3 (old one deleted, new one uploaded)
    assert count_s3_objects(mocked_s3, "test-bucket") == 1


@pytest.mark.anyio
async def test_upload_profile_picture_no_auth(client: AsyncClient, test_image):
    response = await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
    )
    assert_auth_error(response)


@pytest.mark.anyio
async def test_upload_profile_picture_file_too_large(client: AsyncClient, user_auth_headers):
    """Files exceeding max_upload_size_bytes should be rejected."""
    large_content = b"x" * (5 * 1024 * 1024 + 1)  # 5MB + 1 byte

    response = await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("large.jpg", BytesIO(large_content), "image/jpeg")},
        headers=user_auth_headers,
    )

    assert response.status_code == 400
    assert "File too large" in response.json()["message"]


@pytest.mark.anyio
async def test_upload_profile_picture_invalid_file(client: AsyncClient, user_auth_headers):
    """Non-image files should be rejected."""
    response = await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("fake.txt", BytesIO(b"not an image"), "text/plain")},
        headers=user_auth_headers,
    )

    assert response.status_code == 400
    assert "Invalid image file" in response.json()["message"]


# ========================================================================================
# DELETE PROFILE PICTURE  (DELETE /me/picture)
# ========================================================================================


@pytest.mark.anyio
async def test_delete_profile_picture_success(
    client: AsyncClient, user_auth_headers, mocked_s3, test_image
):
    """Upload a picture then delete it."""
    # Upload first
    await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
        headers=user_auth_headers,
    )
    assert count_s3_objects(mocked_s3, "test-bucket") == 1

    # Delete it
    response = await client.delete(f"{prefix}/me/picture", headers=user_auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["image_path"] == "/static/defaults/default_profile_picture.jpg"

    # S3 object should be gone
    assert count_s3_objects(mocked_s3, "test-bucket") == 0


@pytest.mark.anyio
async def test_delete_profile_picture_no_picture(client: AsyncClient, user_auth_headers):
    """Deleting when no picture exists returns 400."""
    response = await client.delete(f"{prefix}/me/picture", headers=user_auth_headers)

    assert response.status_code == 400
    assert "No profile picture" in response.json()["message"]


@pytest.mark.anyio
async def test_delete_profile_picture_no_auth(client: AsyncClient):
    response = await client.delete(f"{prefix}/me/picture")
    assert_auth_error(response)


# ========================================================================================
# REGRESSION: DELETE USER also cleans up profile picture from S3
# ========================================================================================


@pytest.mark.anyio
async def test_delete_user_removes_s3_picture(
    client: AsyncClient, user, user_auth_headers, mocked_s3, test_image
):
    """When a user with a profile picture is deleted, the S3 object is also removed."""
    # Upload picture first
    await client.patch(
        f"{prefix}/me/picture",
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
        headers=user_auth_headers,
    )
    assert count_s3_objects(mocked_s3, "test-bucket") == 1

    # Delete the user
    response = await client.delete(f"{prefix}/me", headers=user_auth_headers)
    assert response.status_code == 204

    # S3 object should be cleaned up
    assert count_s3_objects(mocked_s3, "test-bucket") == 0


# ========================================================================================
# REGISTER WITH A PROFILE PICTURE  (POST /with-picture)
# ========================================================================================

REGISTER_FORM = {
    "username": "photouser",
    "email": "photo@example.com",
    "password": "testpassword",
}


@pytest.mark.anyio
async def test_register_with_picture_success(client: AsyncClient, mocked_s3, test_image):
    response = await client.post(
        f"{prefix}/with-picture",
        data=REGISTER_FORM,
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "photouser"
    assert data["image_path"].startswith("https://")
    assert data["image_path"].endswith(".jpeg")
    assert count_s3_objects(mocked_s3, "test-bucket") == 1


@pytest.mark.anyio
async def test_register_with_picture_file_is_optional(client: AsyncClient, mocked_s3):
    response = await client.post(f"{prefix}/with-picture", data=REGISTER_FORM)

    assert response.status_code == 201
    assert count_s3_objects(mocked_s3, "test-bucket") == 0


@pytest.mark.anyio
async def test_register_with_picture_invalid_image_creates_no_account(
    client: AsyncClient, mocked_s3
):
    response = await client.post(
        f"{prefix}/with-picture",
        data=REGISTER_FORM,
        files={"file": ("fake.txt", BytesIO(b"not an image"), "text/plain")},
    )

    assert response.status_code == 400
    assert "Invalid image file" in response.json()["message"]
    assert count_s3_objects(mocked_s3, "test-bucket") == 0

    # The email is still free: nothing was created by the rejected attempt.
    retry = await client.post(f"{prefix}/with-picture", data=REGISTER_FORM)
    assert retry.status_code == 201


@pytest.mark.anyio
async def test_register_with_picture_file_too_large(client: AsyncClient, mocked_s3):
    large_content = b"x" * (5 * 1024 * 1024 + 1)

    response = await client.post(
        f"{prefix}/with-picture",
        data=REGISTER_FORM,
        files={"file": ("large.jpg", BytesIO(large_content), "image/jpeg")},
    )

    assert response.status_code == 400
    assert "File too large" in response.json()["message"]
    assert count_s3_objects(mocked_s3, "test-bucket") == 0


@pytest.mark.anyio
async def test_register_with_picture_validates_fields(client: AsyncClient, test_image):
    response = await client.post(
        f"{prefix}/with-picture",
        data={**REGISTER_FORM, "password": "short"},
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
    )

    assert response.status_code == 422


@pytest.mark.anyio
async def test_register_with_picture_duplicate_email_uploads_nothing(
    client: AsyncClient, mocked_s3, test_image
):
    await client.post(f"{prefix}/with-picture", data=REGISTER_FORM)

    response = await client.post(
        f"{prefix}/with-picture",
        data={**REGISTER_FORM, "username": "otherphotouser"},
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
    )

    assert response.status_code == 400
    assert count_s3_objects(mocked_s3, "test-bucket") == 0


@pytest.mark.anyio
async def test_register_with_picture_storage_failure_still_creates_account(
    client: AsyncClient, test_image, monkeypatch
):
    """If the bucket is unreachable the signup still succeeds, without a picture."""

    def broken_upload(file_bytes, filename):
        raise RuntimeError("bucket unreachable")

    monkeypatch.setattr("app.routers.users.upload_profile_image", broken_upload)

    response = await client.post(
        f"{prefix}/with-picture",
        data=REGISTER_FORM,
        files={"file": ("profile.jpg", BytesIO(test_image), "image/jpeg")},
    )

    assert response.status_code == 201
    assert not response.json()["image_path"].endswith(".jpeg")
