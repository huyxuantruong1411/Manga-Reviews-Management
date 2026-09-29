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

    def upload_chapter_page(self, manga_id: str, chapter_id: str, filename: str, data: bytes, content_type: str = "image/jpeg") -> tuple:
        """
        Uploads a chapter page image to MinIO.
        Returns (object_key, file_size, width, height, md5_hash).
        """
        import hashlib
        from PIL import Image

        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)

            md5_hash = hashlib.md5(data).hexdigest()
            file_size = len(data)
            width, height = None, None

            try:
                with Image.open(io.BytesIO(data)) as img:
                    width, height = img.size
            except Exception as ie:
                logger.warning(f"Could not read image dimensions for {filename}: {ie}")

            object_name = f"chapters/{manga_id}/{chapter_id}/{filename}"
            data_stream = io.BytesIO(data)
            self.client.put_object(
                self.bucket,
                object_name,
                data_stream,
                length=file_size,
                content_type=content_type
            )
            return object_name, file_size, width, height, md5_hash
        except Exception as e:
            logger.error(f"Error uploading chapter page {filename} to MinIO: {e}")
            raise

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

    def delete_chapter_page(self, object_name: str) -> bool:
        """
        Deletes a single chapter page from MinIO.
        """
        return self.delete_cover(object_name)

    def delete_chapter_folder(self, manga_id: str, chapter_id: str) -> int:
        """
        Deletes all pages belonging to a chapter from MinIO.
        Returns count of deleted objects.
        """
        prefix = f"chapters/{manga_id}/{chapter_id}/"
        try:
            objects_to_delete = list(self.client.list_objects(self.bucket, prefix=prefix, recursive=True))
            if not objects_to_delete:
                return 0
            
            from minio.deleteobjects import DeleteObject
            delete_list = [DeleteObject(obj.object_name) for obj in objects_to_delete]
            errors = self.client.remove_objects(self.bucket, delete_list)
            err_count = sum(1 for _ in errors)
            deleted_count = len(delete_list) - err_count
            logger.info(f"Deleted {deleted_count} objects under prefix '{prefix}'.")
            return deleted_count
        except Exception as e:
            logger.error(f"Error deleting chapter folder '{prefix}' from MinIO: {e}")
            return 0

    def get_batch_presigned_urls(self, object_keys: list, expires_hours: int = 24) -> dict:
        """
        Generates presigned URLs for multiple object keys.
        """
        results = {}
        for key in object_keys:
            if key:
                results[key] = self.get_presigned_url(key)
        return results

minio_service = MinioService()

