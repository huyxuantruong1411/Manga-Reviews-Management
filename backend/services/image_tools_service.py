import os
import hashlib
import base64
import logging
from io import BytesIO
from typing import List, Dict, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'}
MAX_WORKERS = 8


def _get_file_hash(filepath: str) -> Optional[str]:
    """Compute MD5 hash of a file using 128KB chunks."""
    hasher = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            buf = f.read(131072)
            while len(buf) > 0:
                hasher.update(buf)
                buf = f.read(131072)
        return hasher.hexdigest()
    except Exception:
        return None


def _make_thumbnail_base64(filepath: str, max_size: Tuple[int, int] = (240, 360)) -> Optional[str]:
    """Generate a small base64-encoded JPEG thumbnail for preview."""
    try:
        with Image.open(filepath) as img:
            img.thumbnail(max_size, Image.Resampling.LANCZOS)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            buffer = BytesIO()
            img.save(buffer, format="JPEG", quality=60)
            return base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        return None


def _convert_single_image(filepath: str, target_ext: str) -> Dict[str, Any]:
    """Convert a single image file to the target format. Returns result dict."""
    ext = target_ext.lower()
    if ext == ".jpg":
        pil_format = "JPEG"
    elif ext == ".png":
        pil_format = "PNG"
    else:
        return {"path": filepath, "success": False, "error": "Unsupported target format"}

    try:
        old_ext = os.path.splitext(filepath)[1].lower()
        if old_ext == ext or (ext == ".jpg" and old_ext == ".jpeg"):
            return {"path": filepath, "success": False, "error": "Already in target format"}

        new_path = os.path.splitext(filepath)[0] + ext
        old_size = os.path.getsize(filepath)

        with Image.open(filepath) as img:
            if pil_format == "JPEG" and img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            img.save(new_path, format=pil_format)

        new_size = os.path.getsize(new_path)

        # Remove original if conversion succeeded and paths differ
        if os.path.exists(filepath) and new_path != filepath:
            os.remove(filepath)

        return {
            "path": new_path,
            "original_path": filepath,
            "success": True,
            "old_size": old_size,
            "new_size": new_size,
        }
    except Exception as e:
        return {"path": filepath, "success": False, "error": str(e)}


class ImageToolsService:
    def __init__(self):
        self.progress = {
            "total_files": 0,
            "scanned_files": 0,
            "duplicates_found": 0,
            "is_active": False
        }

    def scan_duplicates(self, folder_path: str) -> Dict[str, Any]:
        """
        Scan a folder recursively for duplicate images using MD5 hashing.
        Returns duplicate groups (hash -> list of file paths).
        """
        self.progress = {
            "total_files": 0,
            "scanned_files": 0,
            "duplicates_found": 0,
            "is_active": True
        }
        try:
            if not os.path.isdir(folder_path):
                return {"error": f"Directory not found: {folder_path}", "groups": [], "stats": {}}
    
            # Collect all image files
            all_files: List[str] = []
            for dirpath, _, filenames in os.walk(folder_path):
                for f in filenames:
                    if os.path.splitext(f)[1].lower() in IMAGE_EXTENSIONS:
                        all_files.append(os.path.join(dirpath, f))
    
            self.progress["total_files"] = len(all_files)
    
            if not all_files:
                return {"groups": [], "stats": {"total_files": 0, "total_groups": 0, "total_wasted_bytes": 0}}
    
            # Hash files in parallel
            hash_map: Dict[str, List[str]] = {}
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                future_to_path = {executor.submit(_get_file_hash, p): p for p in all_files}
                for future in as_completed(future_to_path):
                    fpath = future_to_path[future]
                    self.progress["scanned_files"] += 1
                    try:
                        h = future.result()
                        if h:
                            hash_map.setdefault(h, []).append(fpath)
                            if len(hash_map[h]) == 2:
                                self.progress["duplicates_found"] += 2
                            elif len(hash_map[h]) > 2:
                                self.progress["duplicates_found"] += 1
                    except Exception:
                        pass
        finally:
            self.progress["is_active"] = False

        # Filter to only duplicate groups (2+ files with same hash)
        duplicate_groups = {k: v for k, v in hash_map.items() if len(v) > 1}

        # Build response with thumbnails
        groups: List[Dict[str, Any]] = []
        total_wasted = 0

        for hash_val, paths in duplicate_groups.items():
            try:
                file_size = os.path.getsize(paths[0])
            except Exception:
                file_size = 0

            wasted = file_size * (len(paths) - 1)
            total_wasted += wasted

            # Generate thumbnail from first file
            thumbnail = _make_thumbnail_base64(paths[0])

            # Extract chapter folder info for each path
            locations = []
            for p in paths:
                rel = os.path.relpath(p, folder_path)
                locations.append({
                    "path": p,
                    "relative": rel,
                    "chapter": os.path.dirname(rel) or "(root)",
                    "filename": os.path.basename(p),
                })

            groups.append({
                "hash": hash_val,
                "count": len(paths),
                "file_size": file_size,
                "wasted_bytes": wasted,
                "thumbnail": thumbnail,
                "files": locations,
            })

        # Sort by wasted space descending
        groups.sort(key=lambda g: g["wasted_bytes"], reverse=True)

        return {
            "groups": groups,
            "stats": {
                "total_files": len(all_files),
                "total_groups": len(groups),
                "total_wasted_bytes": total_wasted,
            }
        }

    def delete_duplicates(self, file_paths: List[str]) -> Dict[str, Any]:
        """Delete specified files. Returns count and freed bytes."""
        deleted_count = 0
        freed_bytes = 0
        errors: List[str] = []

        for p in file_paths:
            try:
                if os.path.exists(p):
                    size = os.path.getsize(p)
                    os.remove(p)
                    deleted_count += 1
                    freed_bytes += size
                else:
                    errors.append(f"File not found: {p}")
            except Exception as e:
                errors.append(f"Error deleting {p}: {str(e)}")

        return {
            "deleted_count": deleted_count,
            "freed_bytes": freed_bytes,
            "errors": errors,
        }

    def scan_non_target_format(self, folder_path: str, target_format: str) -> Dict[str, Any]:
        """
        Scan a folder for images NOT matching the target format.
        Groups results by subfolder (chapter).
        """
        if not os.path.isdir(folder_path):
            return {"error": f"Directory not found: {folder_path}", "chapters": [], "stats": {}}

        target_ext = target_format.lower()
        if target_ext not in (".jpg", ".png"):
            return {"error": "Target format must be .jpg or .png", "chapters": [], "stats": {}}

        # Map target ext to list of extensions considered "already ok"
        ok_extensions = {target_ext}
        if target_ext == ".jpg":
            ok_extensions.add(".jpeg")

        chapter_map: Dict[str, List[Dict[str, Any]]] = {}
        total_files = 0

        for dirpath, _, filenames in os.walk(folder_path):
            for f in filenames:
                ext = os.path.splitext(f)[1].lower()
                if ext in IMAGE_EXTENSIONS and ext not in ok_extensions:
                    total_files += 1
                    full_path = os.path.join(dirpath, f)
                    rel_dir = os.path.relpath(dirpath, folder_path) or "(root)"
                    try:
                        fsize = os.path.getsize(full_path)
                    except Exception:
                        fsize = 0

                    chapter_map.setdefault(rel_dir, []).append({
                        "path": full_path,
                        "filename": f,
                        "size": fsize,
                        "current_ext": ext,
                    })

        chapters = []
        for chapter_name, files in sorted(chapter_map.items()):
            chapters.append({
                "chapter": chapter_name,
                "full_path": os.path.join(folder_path, chapter_name) if chapter_name != "(root)" else folder_path,
                "file_count": len(files),
                "files": files,
            })

        return {
            "chapters": chapters,
            "stats": {
                "total_convertible": total_files,
                "total_chapters": len(chapters),
                "target_format": target_ext,
            }
        }

    def convert_images(self, file_paths: List[str], target_format: str) -> Dict[str, Any]:
        """
        Convert a list of image files to the target format using multi-threading.
        """
        target_ext = target_format.lower()
        if target_ext not in (".jpg", ".png"):
            return {"error": "Target format must be .jpg or .png", "converted": 0}

        converted = 0
        failed = 0
        total_old_size = 0
        total_new_size = 0
        errors: List[str] = []

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_path = {
                executor.submit(_convert_single_image, p, target_ext): p
                for p in file_paths
            }
            for future in as_completed(future_to_path):
                try:
                    result = future.result()
                    if result["success"]:
                        converted += 1
                        total_old_size += result.get("old_size", 0)
                        total_new_size += result.get("new_size", 0)
                    else:
                        failed += 1
                        if result.get("error") and result["error"] != "Already in target format":
                            errors.append(f"{result['path']}: {result['error']}")
                except Exception as e:
                    failed += 1
                    errors.append(str(e))

        return {
            "converted": converted,
            "failed": failed,
            "total_old_size": total_old_size,
            "total_new_size": total_new_size,
            "errors": errors[:20],  # Cap error list
        }


image_tools_service = ImageToolsService()
