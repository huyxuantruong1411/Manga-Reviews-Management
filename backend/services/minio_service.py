import logging
from minio import Minio
from datetime import timedelta
import io
from backend.config import settings

logger = logging.getLogger(__name__)

class MinioService:
    def __init__(self):
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False
        )
        self.bucket = settings.minio_bucket

    def upload_cover(self, object_name: str, data: bytes, content_type: str = "image/jpeg") -> str:
        """
        Uploads cover image bytes to MinIO and returns the object key.
        """
        try:
            # Ensure bucket exists (fallback)
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
                
            data_stream = io.BytesIO(data)
            self.client.put_object(
                self.bucket,
                object_name,
                data_stream,
                length=len(data),
                content_type=content_type
            )
            logger.info(f"Successfully uploaded {object_name} to MinIO bucket '{self.bucket}'.")
            return object_name
        except Exception as e:
            logger.error(f"Error uploading cover to MinIO: {e}")
            raise

    def get_presigned_url(self, object_name: str) -> str:
        """
        Generates a 24-hour presigned URL for reading cover images.
        """
        if not object_name:
            return ""
        try:
            url = self.client.get_presigned_url(
                "GET",
                self.bucket,
                object_name,
                expires=timedelta(hours=24)
            )
            # If minio runs in docker and is accessed from host via localhost:9000,
            # we need to ensure the url points to localhost:9000 rather than
            # internal container hostname if container hostname is used.
            # Usually, settings.minio_endpoint is "localhost:9000" so it will be correct.
            return url
        except Exception as e:
            logger.error(f"Error generating presigned URL for {object_name}: {e}")
            return ""

    def delete_cover(self, object_name: str) -> bool:
        """
        Deletes a cover image from the MinIO bucket.
        """
        if not object_name:
            return False
        try:
            self.client.remove_object(self.bucket, object_name)
            logger.info(f"Deleted object {object_name} from MinIO.")
            return True
        except Exception as e:
            logger.error(f"Error deleting object {object_name} from MinIO: {e}")
            return False

minio_service = MinioService()
