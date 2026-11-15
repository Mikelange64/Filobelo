import logging
import uuid
from io import BytesIO

import boto3
from PIL import Image, ImageOps
from starlette.concurrency import run_in_threadpool

from app.config import settings

# S3 failures are logged here, where the call is made, as one ERROR line with
# the object key (a random file name, not user content) and then re-raised
# unchanged, so callers behave exactly as before.
logger = logging.getLogger(__name__)


def _make_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.s3_region,
        aws_access_key_id=(
            settings.s3_access_key_id.get_secret_value()
            if settings.s3_access_key_id
            else None
        ),
        aws_secret_access_key=(
            settings.s3_secret_access_key.get_secret_value()
            if settings.s3_secret_access_key
            else None
        ),
        endpoint_url=settings.s3_endpoint_url,
    )

_s3_client = None

def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = _make_s3_client()
    return _s3_client


# Pillow work is CPU-bound, so this stays a plain sync function; async callers
# run it with `await run_in_threadpool(process_profile_image, content)`.
def process_profile_image(content: bytes) -> tuple[bytes, str]:
    with Image.open(BytesIO(content)) as original:
        if original.format not in {"JPEG", "PNG", "WEBP", "GIF"}:
            raise ValueError("Unsupported image format")
            
        img = ImageOps.exif_transpose(original)

        # crop image to 300x300
        img = ImageOps.fit(img, (300, 300), method=Image.Resampling.LANCZOS)

        # convert to RGB
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")

        # give it a unique uuid name
        filename = f"{uuid.uuid4().hex}.jpeg"

        output = BytesIO()

        # Now we save to the ouput, which is just bytes
        img.save(output, "JPEG", quality=85, optimize=True)

        # we reset it to the beginning so we can read from it
        output.seek(0)

        # return the filename so we can properly store it
        return output.read(), filename


# boto3 is a blocking library: the two functions below are plain sync
# functions, and the async wrappers further down run them in a worker thread
# so the event loop is never held up by a network call to S3.
def _upload_to_s3(file_bytes: bytes, key: str) -> None:
    s3 = _get_s3_client()
    try:
        s3.upload_fileobj(
            BytesIO(file_bytes),
            settings.s3_bucket_name,
            key,
            ExtraArgs={"ContentType": "image/jpeg"},
        )
    except Exception as exc:
        logger.error(
            "S3 upload failed key=%s size_bytes=%s: %s: %s",
            key, len(file_bytes), type(exc).__name__, exc,
        )
        raise


def _delete_from_s3(key: str) -> None:
    s3 = _get_s3_client()
    try:
        s3.delete_object(Bucket=settings.s3_bucket_name, Key=key)
    except Exception as exc:
        logger.error("S3 delete failed key=%s: %s: %s", key, type(exc).__name__, exc)
        raise


async def upload_profile_image(file_bytes: bytes, filename: str) -> None:
    key = f"profile_pics/{filename}"
    await run_in_threadpool(_upload_to_s3, file_bytes, key)


async def delete_profile_image(filename: str | None) -> None:
    if filename is None:
        return
    key = f"profile_pics/{filename}"
    await run_in_threadpool(_delete_from_s3, key)
