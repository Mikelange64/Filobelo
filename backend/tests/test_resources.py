from io import BytesIO

import pytest
from httpx import AsyncClient

from tests.auth_helpers import (
    auth_header,
    create_task,
    create_test_user,
    create_workspace,
    login_user,
    verify_user_in_db,
)

resourceprefix = "/api/workspaces"


# ========================================================================================
# FIXTURES / HELPERS
# ========================================================================================


@pytest.fixture
async def task(client, user_token, workspace):
    """Create and return a task owned by the default user in their workspace."""
    return await create_task(client, user_token, workspace["id"])


@pytest.fixture
def fake_pdf_bytes() -> bytes:
    """Minimal bytes carrying just the PDF magic header - enough for filetype to sniff it."""
    return b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"


def resource_path(workspace_id: int, task_id: int, suffix: str = "") -> str:
    return f"{resourceprefix}/{workspace_id}/tasks/{task_id}/resource{suffix}"


async def create_link(
    client: AsyncClient,
    token: str,
    workspace_id: int,
    task_id: int,
    title: str = "My Link",
    url: str = "https://example.com",
) -> dict:
    response = await client.post(
        resource_path(workspace_id, task_id, "/links"),
        json={"title": title, "url": url},
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to create link: {response.text}"
    return response.json()


async def create_note(
    client: AsyncClient,
    token: str,
    workspace_id: int,
    task_id: int,
    title: str = "My Note",
    content: str = "Some content",
) -> dict:
    response = await client.post(
        resource_path(workspace_id, task_id, "/notes"),
        json={"title": title, "content": content},
        headers=auth_header(token),
    )
    assert response.status_code == 201, f"Failed to create note: {response.text}"
    return response.json()


async def outsider_headers(client: AsyncClient, db_session) -> dict:
    """Create, verify, and log in a user with no relationship to the test workspace."""
    await create_test_user(client, username="outsider", email="outsider@example.com")
    await verify_user_in_db(db_session, "outsider@example.com")
    token = await login_user(client, email="outsider@example.com")
    return auth_header(token)


def assert_forbidden(response):
    assert response.status_code == 403


def assert_unauthorized(response):
    assert response.status_code == 401


# ========================================================================================
# LINKS
# ========================================================================================


@pytest.mark.anyio
async def test_create_link_success(client: AsyncClient, user_auth_headers, workspace, task):
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Docs", "url": "https://example.com/docs"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Docs"
    assert data["url"] == "https://example.com/docs"
    assert data["type"] == "LINK"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.anyio
async def test_create_link_invalid_url(client: AsyncClient, user_auth_headers, workspace, task):
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Bad", "url": "not-a-url"},
        headers=user_auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.anyio
async def test_create_link_non_member(client: AsyncClient, db_session, workspace, task):
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Docs", "url": "https://example.com"},
        headers=await outsider_headers(client, db_session),
    )
    assert_forbidden(response)


@pytest.mark.anyio
async def test_create_link_no_auth(client: AsyncClient, workspace, task):
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Docs", "url": "https://example.com"},
    )
    assert_unauthorized(response)


@pytest.mark.anyio
async def test_get_link_success(client: AsyncClient, user_auth_headers, user_token, workspace, task):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        resource_path(workspace["id"], task["id"], f"/links/{link['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["id"] == link["id"]


@pytest.mark.anyio
async def test_get_link_not_found(client: AsyncClient, user_auth_headers, workspace, task):
    response = await client.get(
        resource_path(workspace["id"], task["id"], "/links/99999"),
        headers=user_auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_get_note_through_link_getter_returns_404(
    client: AsyncClient, user_auth_headers, user_token, workspace, task
):
    """A note's id should not be retrievable through the link-typed getter."""
    note = await create_note(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        resource_path(workspace["id"], task["id"], f"/links/{note['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_list_links_excludes_other_types(
    client: AsyncClient, user_auth_headers, user_token, workspace, task
):
    await create_link(client, user_token, workspace["id"], task["id"], title="A")
    await create_link(client, user_token, workspace["id"], task["id"], title="B")
    await create_note(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        resource_path(workspace["id"], task["id"], "/links"), headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert {d["title"] for d in data} == {"A", "B"}


@pytest.mark.anyio
async def test_update_link_partial(client: AsyncClient, user_auth_headers, user_token, workspace, task):
    link = await create_link(client, user_token, workspace["id"], task["id"], title="Old")
    response = await client.patch(
        resource_path(workspace["id"], task["id"], f"/links/{link['id']}"),
        json={"title": "New"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "New"
    assert data["url"] == link["url"]


@pytest.mark.anyio
async def test_update_link_url(client: AsyncClient, user_auth_headers, user_token, workspace, task):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.patch(
        resource_path(workspace["id"], task["id"], f"/links/{link['id']}"),
        json={"url": "https://example.com/updated"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["url"] == "https://example.com/updated"


@pytest.mark.anyio
async def test_update_link_empty_body_noop(
    client: AsyncClient, user_auth_headers, user_token, workspace, task
):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.patch(
        resource_path(workspace["id"], task["id"], f"/links/{link['id']}"),
        json={},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["url"] == link["url"]
    assert response.json()["title"] == link["title"]


@pytest.mark.anyio
async def test_update_link_not_found(client: AsyncClient, user_auth_headers, workspace, task):
    response = await client.patch(
        resource_path(workspace["id"], task["id"], "/links/99999"),
        json={"title": "Ghost"},
        headers=user_auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.anyio
async def test_update_link_by_other_workspace_member_allowed(
    client: AsyncClient, user_token, workspace, task, second_user, second_user_token
):
    """Any workspace member can edit shared resources - there's no creator-only restriction."""
    from tests.auth_helpers import add_workspace_member

    await add_workspace_member(client, user_token, workspace["id"], second_user["id"])
    link = await create_link(client, user_token, workspace["id"], task["id"], title="Original")
    response = await client.patch(
        resource_path(workspace["id"], task["id"], f"/links/{link['id']}"),
        json={"title": "Edited by teammate"},
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Edited by teammate"


class _FakeOembedResponse:
    def __init__(self, json_data):
        self._json_data = json_data

    def raise_for_status(self):
        pass

    def json(self):
        return self._json_data


@pytest.mark.anyio
async def test_create_link_with_oembed_provider_gets_thumbnail(
    client: AsyncClient, user_auth_headers, workspace, task, monkeypatch
):
    async def fake_get(url, params=None, timeout=None, follow_redirects=None):
        assert url == "https://www.youtube.com/oembed"
        assert params["url"] == "https://www.youtube.com/watch?v=abc123"
        return _FakeOembedResponse({"thumbnail_url": "https://i.ytimg.com/vi/abc123/hqdefault.jpg"})

    monkeypatch.setattr("app.utils.oembed._http_get", fake_get)

    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Cool video", "url": "https://www.youtube.com/watch?v=abc123"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["thumbnail_url"] == "https://i.ytimg.com/vi/abc123/hqdefault.jpg"


@pytest.mark.anyio
async def test_create_link_non_provider_skips_oembed_call(
    client: AsyncClient, user_auth_headers, workspace, task, monkeypatch
):
    async def fake_get(*args, **kwargs):
        raise AssertionError("should not call oEmbed for a non-provider domain")

    monkeypatch.setattr("app.utils.oembed._http_get", fake_get)

    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Some site", "url": "https://example.com/article"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["thumbnail_url"] is None


@pytest.mark.anyio
async def test_create_link_oembed_failure_does_not_block_creation(
    client: AsyncClient, user_auth_headers, workspace, task, monkeypatch
):
    import httpx

    async def fake_get(*args, **kwargs):
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr("app.utils.oembed._http_get", fake_get)

    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Cool video", "url": "https://youtu.be/abc123"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["thumbnail_url"] is None


@pytest.mark.anyio
async def test_create_link_oembed_non_https_thumbnail_ignored(
    client: AsyncClient, user_auth_headers, workspace, task, monkeypatch
):
    """A provider returning something other than a plain https thumbnail URL is discarded, not trusted as-is."""
    async def fake_get(*a, **k):
        return _FakeOembedResponse({"thumbnail_url": "javascript:alert(1)"})

    monkeypatch.setattr("app.utils.oembed._http_get", fake_get)

    response = await client.post(
        resource_path(workspace["id"], task["id"], "/links"),
        json={"title": "Sketchy", "url": "https://youtu.be/abc"},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["thumbnail_url"] is None


@pytest.mark.anyio
async def test_update_link_url_refreshes_thumbnail(
    client: AsyncClient, user_auth_headers, user_token, workspace, task, monkeypatch
):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    assert link.get("thumbnail_url") is None

    async def fake_get(*a, **k):
        return _FakeOembedResponse({"thumbnail_url": "https://i.ytimg.com/vi/xyz/hqdefault.jpg"})

    monkeypatch.setattr("app.utils.oembed._http_get", fake_get)

    response = await client.patch(
        resource_path(workspace["id"], task["id"], f"/links/{link['id']}"),
        json={"url": "https://www.youtube.com/watch?v=xyz"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["thumbnail_url"] == "https://i.ytimg.com/vi/xyz/hqdefault.jpg"


# ========================================================================================
# NOTES
# ========================================================================================


@pytest.mark.anyio
async def test_create_note_success(client: AsyncClient, user_auth_headers, workspace, task):
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/notes"),
        json={"title": "Meeting Notes", "content": "Discussed X and Y."},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Meeting Notes"
    assert data["content"] == "Discussed X and Y."
    assert data["type"] == "NOTE"


@pytest.mark.anyio
async def test_create_note_empty_content_allowed(client: AsyncClient, user_auth_headers, workspace, task):
    """NoteCreate has no min_length on content, matching TaskCreate's own convention."""
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/notes"),
        json={"title": "Empty", "content": ""},
        headers=user_auth_headers,
    )
    assert response.status_code == 201


@pytest.mark.anyio
async def test_get_note_success(client: AsyncClient, user_auth_headers, user_token, workspace, task):
    note = await create_note(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        resource_path(workspace["id"], task["id"], f"/notes/{note['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["content"] == note["content"]


@pytest.mark.anyio
async def test_list_notes_excludes_other_types(
    client: AsyncClient, user_auth_headers, user_token, workspace, task
):
    await create_note(client, user_token, workspace["id"], task["id"], title="A")
    await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        resource_path(workspace["id"], task["id"], "/notes"), headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "A"


@pytest.mark.anyio
async def test_update_note_content(client: AsyncClient, user_auth_headers, user_token, workspace, task):
    note = await create_note(client, user_token, workspace["id"], task["id"])
    response = await client.patch(
        resource_path(workspace["id"], task["id"], f"/notes/{note['id']}"),
        json={"content": "Updated content"},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["content"] == "Updated content"


@pytest.mark.anyio
async def test_update_note_empty_content_allowed(
    client: AsyncClient, user_auth_headers, user_token, workspace, task
):
    """Clearing a note's content back to empty is a legitimate edit, not a validation error."""
    note = await create_note(client, user_token, workspace["id"], task["id"])
    response = await client.patch(
        resource_path(workspace["id"], task["id"], f"/notes/{note['id']}"),
        json={"content": ""},
        headers=user_auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["content"] == ""


@pytest.mark.anyio
async def test_get_link_through_note_getter_returns_404(
    client: AsyncClient, user_auth_headers, user_token, workspace, task
):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        resource_path(workspace["id"], task["id"], f"/notes/{link['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 404


# ========================================================================================
# FILES
# ========================================================================================


@pytest.mark.anyio
async def test_upload_file_success(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3, fake_pdf_bytes
):
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("report.pdf", fake_pdf_bytes, "application/pdf")},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "report.pdf"
    assert data["mime_type"] == "application/pdf"
    assert data["type"] == "FILE"
    assert data["file_path"].startswith("https://")
    # Forces a download instead of the browser rendering the object inline.
    assert "response-content-disposition=attachment" in data["file_path"]


@pytest.mark.anyio
async def test_upload_file_too_large(client: AsyncClient, user_auth_headers, workspace, task, mocked_s3):
    from app.config import settings

    oversized = b"%PDF-1.4\n" + b"0" * (settings.max_file_upload_size_bytes + 1)
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("big.pdf", BytesIO(oversized), "application/pdf")},
        headers=user_auth_headers,
    )
    assert response.status_code == 400
    assert "File too large" in response.json()["message"]


@pytest.mark.anyio
async def test_upload_file_unrecognizable_content_rejected(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3
):
    """Content with no magic bytes and not valid UTF-8 either can't be classified at all."""
    garbage = b"\xff\xfe\xfd\xfc" * 10
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("mystery.bin", garbage, "application/octet-stream")},
        headers=user_auth_headers,
    )
    assert response.status_code == 400
    assert "Invalid file" in response.json()["message"]


@pytest.mark.anyio
async def test_upload_file_plain_text_accepted(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3
):
    """Plain text has no magic bytes for filetype to sniff, so it's detected via UTF-8 decode instead."""
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("note.txt", b"just plain text, no magic bytes here", "text/plain")},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["mime_type"] == "text/plain"


@pytest.mark.anyio
async def test_upload_file_utf8_content_wrong_extension_rejected(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3
):
    """Valid UTF-8 alone isn't enough - CSV/JSON/etc. shouldn't be silently accepted as text/plain."""
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("data.csv", b"col1,col2\n1,2", "text/csv")},
        headers=user_auth_headers,
    )
    assert response.status_code == 400
    assert "Invalid file" in response.json()["message"]


@pytest.mark.anyio
async def test_upload_file_recognized_but_disallowed_type_rejected(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3
):
    """A real, sniffable format (zip) that isn't in ALLOWED_MIME_TYPES should still be rejected."""
    zip_header = b"PK\x03\x04" + b"0" * 20
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("archive.zip", zip_header, "application/zip")},
        headers=user_auth_headers,
    )
    assert response.status_code == 400
    assert "Invalid file" in response.json()["message"]


@pytest.mark.anyio
async def test_upload_file_image_accepted(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3, test_image
):
    """Images are allowed file resources and get a real presigned file_path."""
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("image.jpg", test_image, "image/jpeg")},
        headers=user_auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["mime_type"] == "image/jpeg"
    assert data["file_path"]


@pytest.mark.anyio
async def test_upload_image_with_bad_data_rejected(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3
):
    """Magic bytes alone aren't a full validity check - Pillow may still fail to decode it."""
    fake_png = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("image.png", fake_png, "image/png")},
        headers=user_auth_headers,
    )
    assert response.status_code == 400
    assert "Invalid image" in response.json()["message"]


@pytest.mark.anyio
async def test_upload_oversized_image_is_downscaled(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3
):
    """Images over the max dimension get proportionally downscaled before storage."""
    from PIL import Image as PILImage

    from app.config import settings

    huge = PILImage.new("RGB", (3000, 1500), color="blue")
    buf = BytesIO()
    huge.save(buf, "JPEG")

    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("huge.jpg", buf.getvalue(), "image/jpeg")},
        headers=user_auth_headers,
    )
    assert response.status_code == 201

    objects = mocked_s3.list_objects_v2(Bucket=settings.s3_bucket_name)["Contents"]
    stored = mocked_s3.get_object(Bucket=settings.s3_bucket_name, Key=objects[0]["Key"])
    stored_img = PILImage.open(BytesIO(stored["Body"].read()))
    assert max(stored_img.size) <= 2000
    assert stored_img.size[0] / stored_img.size[1] == pytest.approx(2, abs=0.01)


@pytest.mark.anyio
async def test_upload_gif_not_re_encoded(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3
):
    """GIFs are passed through untouched - re-encoding would collapse animation to one frame."""
    from PIL import Image as PILImage

    gif = PILImage.new("RGB", (50, 50), color="green")
    buf = BytesIO()
    gif.save(buf, "GIF")
    gif_bytes = buf.getvalue()

    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("clip.gif", gif_bytes, "image/gif")},
        headers=user_auth_headers,
    )
    assert response.status_code == 201

    from app.config import settings
    objects = mocked_s3.list_objects_v2(Bucket=settings.s3_bucket_name)["Contents"]
    stored = mocked_s3.get_object(Bucket=settings.s3_bucket_name, Key=objects[0]["Key"])
    assert stored["Body"].read() == gif_bytes


@pytest.mark.anyio
async def test_upload_file_non_member(client: AsyncClient, db_session, workspace, task, mocked_s3, fake_pdf_bytes):
    response = await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("report.pdf", fake_pdf_bytes, "application/pdf")},
        headers=await outsider_headers(client, db_session),
    )
    assert_forbidden(response)


@pytest.mark.anyio
async def test_list_files_excludes_other_types(
    client: AsyncClient, user_auth_headers, user_token, workspace, task, mocked_s3, fake_pdf_bytes
):
    await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("report.pdf", fake_pdf_bytes, "application/pdf")},
        headers=auth_header(user_token),
    )
    await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.get(
        resource_path(workspace["id"], task["id"], "/files"), headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "report.pdf"


@pytest.mark.anyio
async def test_delete_file_removes_from_s3(
    client: AsyncClient, user_auth_headers, workspace, task, mocked_s3, fake_pdf_bytes
):
    from app.config import settings

    upload = (await client.post(
        resource_path(workspace["id"], task["id"], "/files"),
        files={"file": ("report.pdf", fake_pdf_bytes, "application/pdf")},
        headers=user_auth_headers,
    )).json()

    response = await client.delete(
        resource_path(workspace["id"], task["id"], f"/{upload['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 204

    objects = mocked_s3.list_objects_v2(Bucket=settings.s3_bucket_name).get("Contents", [])
    assert objects == []


# ========================================================================================
# CROSS-CUTTING: DELETE (any type) + unified list
# ========================================================================================


@pytest.mark.anyio
async def test_delete_link_success(client: AsyncClient, user_auth_headers, user_token, workspace, task):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.delete(
        resource_path(workspace["id"], task["id"], f"/{link['id']}"),
        headers=user_auth_headers,
    )
    assert response.status_code == 204

    get_response = await client.get(
        resource_path(workspace["id"], task["id"], f"/links/{link['id']}"),
        headers=user_auth_headers,
    )
    assert get_response.status_code == 404


@pytest.mark.anyio
async def test_delete_resource_non_member_forbidden(
    client: AsyncClient, db_session, user_token, workspace, task
):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.delete(
        resource_path(workspace["id"], task["id"], f"/{link['id']}"),
        headers=await outsider_headers(client, db_session),
    )
    assert_forbidden(response)


@pytest.mark.anyio
async def test_delete_resource_no_auth(client: AsyncClient, user_token, workspace, task):
    link = await create_link(client, user_token, workspace["id"], task["id"])
    response = await client.delete(resource_path(workspace["id"], task["id"], f"/{link['id']}"))
    assert_unauthorized(response)


@pytest.mark.anyio
async def test_list_resources_mixed_types(
    client: AsyncClient, user_auth_headers, user_token, workspace, task
):
    await create_link(client, user_token, workspace["id"], task["id"], title="Link")
    await create_note(client, user_token, workspace["id"], task["id"], title="Note")
    response = await client.get(
        resource_path(workspace["id"], task["id"], "/"), headers=user_auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert {d["type"] for d in data} == {"LINK", "NOTE"}


@pytest.mark.anyio
async def test_list_resources_empty(client: AsyncClient, user_auth_headers, workspace, task):
    response = await client.get(
        resource_path(workspace["id"], task["id"], "/"), headers=user_auth_headers
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.anyio
async def test_list_resources_non_member(client: AsyncClient, db_session, workspace, task):
    response = await client.get(
        resource_path(workspace["id"], task["id"], "/"),
        headers=await outsider_headers(client, db_session),
    )
    assert_forbidden(response)


# ========================================================================================
# CROSS-WORKSPACE / CROSS-TASK ISOLATION
# ========================================================================================
# The attacker is a legitimate member of their OWN workspace and puts that
# workspace's id in the URL (so require_membership passes) alongside a task
# or resource id belonging to someone else.


@pytest.fixture
async def attacker_ws(client, second_user_token):
    return await create_workspace(client, second_user_token, title="Attacker WS")


@pytest.mark.anyio
@pytest.mark.parametrize(
    "method, suffix, body",
    [
        pytest.param("get", "/", None, id="list_all"),
        pytest.param("get", "/links", None, id="list_links"),
        pytest.param("get", "/notes", None, id="list_notes"),
        pytest.param("get", "/files", None, id="list_files"),
        pytest.param(
            "post", "/links", {"title": "x", "url": "https://example.com"}, id="add_link"
        ),
        pytest.param("post", "/notes", {"title": "x", "content": "y"}, id="add_note"),
    ],
)
async def test_resources_of_foreign_task_not_reachable(
    client, user_token, workspace, task, second_user_token, attacker_ws,
    method, suffix, body,
):
    await create_link(client, user_token, workspace["id"], task["id"])

    response = await client.request(
        method,
        resource_path(attacker_ws["id"], task["id"], suffix),
        json=body,
        headers=auth_header(second_user_token),
    )
    assert response.status_code == 404

    # nothing was added to the victim's task
    listing = await client.get(
        resource_path(workspace["id"], task["id"], "/"), headers=auth_header(user_token)
    )
    assert len(listing.json()) == 1


@pytest.mark.anyio
async def test_resource_not_reachable_through_own_task(
    client, user_token, workspace, task, second_user_token, attacker_ws
):
    """Valid workspace + valid task of the attacker's own, but a resource id
    that belongs to a different task."""
    victim_link = await create_link(client, user_token, workspace["id"], task["id"])
    attacker_task = await create_task(client, second_user_token, attacker_ws["id"])
    headers = auth_header(second_user_token)
    base = resource_path(attacker_ws["id"], attacker_task["id"])

    assert (await client.get(f"{base}/links/{victim_link['id']}", headers=headers)).status_code == 404
    assert (
        (await client.patch(
            f"{base}/links/{victim_link['id']}", json={"title": "hijacked"}, headers=headers
        )).status_code
        == 404
    )
    assert (await client.delete(f"{base}/{victim_link['id']}", headers=headers)).status_code == 404

    still_there = await client.get(
        resource_path(workspace["id"], task["id"], f"/links/{victim_link['id']}"),
        headers=auth_header(user_token),
    )
    assert still_there.status_code == 200
    assert still_there.json()["title"] == victim_link["title"]
