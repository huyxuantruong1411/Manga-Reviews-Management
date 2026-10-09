import base64
import io
import json
import logging
import os
import subprocess
import sys
import time
import uuid
import zipfile
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from bson import ObjectId
from PIL import Image

from backend.config import settings
from backend.database.connection import get_db
from backend.models.chapter_export import (
    ChapterExportItem,
    ChapterExportRequest,
)
from backend.services.chapter_service import chapter_service
from backend.services.minio_service import minio_service
from backend.utils.file_utils import clean_filename, normalize_windows_path

logger = logging.getLogger(__name__)


class ExportPage:
    def __init__(self, raw: Any):
        if isinstance(raw, dict):
            self.filename = str(raw.get("filename") or f"{raw.get('page_number', 1):03d}.jpg")
            self.object_key = str(raw.get("object_key") or "")
            self.page_number = int(raw.get("page_number") or 1)
            self.file_size = int(raw.get("file_size") or 0)
        else:
            self.filename = str(getattr(raw, "filename", None) or f"{getattr(raw, 'page_number', 1):03d}.jpg")
            self.object_key = str(getattr(raw, "object_key", "") or "")
            self.page_number = int(getattr(raw, "page_number", 1) or 1)
            self.file_size = int(getattr(raw, "file_size", 0) or 0)


class ExportChapter:
    def __init__(self, raw: Any):
        if isinstance(raw, dict):
            self.id = str(raw.get("id") or raw.get("_id") or "")
            self.chapter_number = str(raw.get("chapter_number", "1"))
            try:
                self.chapter_numeric = float(raw.get("chapter_numeric") or 0.0)
            except (ValueError, TypeError):
                self.chapter_numeric = 0.0
            vol = raw.get("volume")
            self.volume = str(vol).strip() if vol is not None and str(vol).strip() != "" else None
            self.title = str(raw.get("title") or "")
            self.language = str(raw.get("language") or "en")
            raw_pages = raw.get("pages") or []
        else:
            self.id = str(getattr(raw, "id", None) or getattr(raw, "_id", "") or "")
            self.chapter_number = str(getattr(raw, "chapter_number", "1"))
            try:
                self.chapter_numeric = float(getattr(raw, "chapter_numeric", 0.0) or 0.0)
            except (ValueError, TypeError):
                self.chapter_numeric = 0.0
            vol = getattr(raw, "volume", None)
            self.volume = str(vol).strip() if vol is not None and str(vol).strip() != "" else None
            self.title = str(getattr(raw, "title", "") or "")
            self.language = str(getattr(raw, "language", "en") or "en")
            raw_pages = getattr(raw, "pages", []) or []

        self.pages = [ExportPage(p) for p in raw_pages]


class ChapterExportService:
    """Domain service for exporting manga chapters to PDF, ZIP, CBZ, and structured folders

    with real-time granular SSE progress tracking and Windows Explorer integration.
    """

    def __init__(self):
        self._exports_dir = os.path.join(settings.download_dir, ".exports")
        os.makedirs(self._exports_dir, exist_ok=True)

    def generate_comic_info_xml(
        self,
        manga_title: str,
        chapter_number: str = "",
        volume: Optional[str] = None,
        chapter_title: Optional[str] = "",
        page_count: int = 0,
        summary: Optional[str] = "",
        authors: Optional[List[str]] = None,
        language: str = "en",
    ) -> str:
        """Generates standard ComicInfo 2.0 XML metadata compatible with Tachiyomi, Mihon, and CDisplayEx."""
        clean_title = (chapter_title or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        clean_series = (manga_title or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        clean_summary = (summary or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        writer_str = ", ".join(authors or []).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        vol_str = volume if volume else ""

        xml_lines = [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
            f"  <Series>{clean_series}</Series>",
            f"  <Number>{chapter_number}</Number>",
        ]
        if vol_str:
            xml_lines.append(f"  <Volume>{vol_str}</Volume>")
        if clean_title:
            xml_lines.append(f"  <Title>{clean_title}</Title>")
        if clean_summary:
            xml_lines.append(f"  <Summary>{clean_summary}</Summary>")
        if writer_str:
            xml_lines.append(f"  <Writer>{writer_str}</Writer>")
        xml_lines.extend(
            [
                f"  <PageCount>{page_count}</PageCount>",
                f"  <LanguageISO>{language}</LanguageISO>",
                "  <Manga>YesAndRightToLeft</Manga>",
                "</ComicInfo>",
            ]
        )
        return "\n".join(xml_lines)

    def create_pdf_from_images(
        self,
        images_data: List[Tuple[str, bytes]],
        optimize: bool = False,
    ) -> bytes:
        """Converts an ordered list of image bytes into a high-fidelity PDF file using Pillow."""
        if not images_data:
            raise ValueError("No images provided for PDF generation")

        pil_images: List[Image.Image] = []
        for _, raw_data in images_data:
            try:
                with Image.open(io.BytesIO(raw_data)) as img:
                    # Convert transparent or paletted images to white RGB
                    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                        bg = Image.new("RGB", img.size, (255, 255, 255))
                        converted = img.convert("RGBA")
                        bg.paste(converted, mask=converted.split()[3])
                        frame = bg
                    else:
                        frame = img.convert("RGB")

                    if optimize:
                        # Re-encode to JPEG 85% to optimize PDF file size
                        buf = io.BytesIO()
                        frame.save(buf, format="JPEG", quality=85, optimize=True)
                        frame = Image.open(buf)
                        frame.load()

                    pil_images.append(frame)
            except Exception as e:
                logger.warning(f"Error decoding image frame for PDF: {e}")
                continue

        if not pil_images:
            raise ValueError("Could not decode any valid image frames for PDF generation")

        output_buf = io.BytesIO()
        first_img = pil_images[0]
        rest_imgs = pil_images[1:] if len(pil_images) > 1 else []

        first_img.save(
            output_buf,
            format="PDF",
            save_all=True,
            append_images=rest_imgs,
            resolution=100.0,
        )

        for img in pil_images:
            try:
                img.close()
            except Exception:
                pass

        return output_buf.getvalue()

    def create_zip_archive(
        self,
        files: List[Tuple[str, bytes]],
        compress: bool = True,
    ) -> bytes:
        """Creates an in-memory ZIP or CBZ archive from a list of relative paths and byte payloads."""
        buf = io.BytesIO()
        compression_mode = zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED
        with zipfile.ZipFile(buf, mode="w", compression=compression_mode) as zf:
            for arcname, data in files:
                zf.writestr(arcname, data)
        return buf.getvalue()

    def reveal_in_windows_explorer(self, target_path: str) -> Dict[str, Any]:
        """Opens Windows Explorer with target path highlighted/selected."""
        if sys.platform != "win32":
            return {"success": False, "message": "Windows Explorer is only supported on Windows OS"}

        try:
            norm_path = os.path.normpath(target_path)
            if not os.path.exists(norm_path):
                return {"success": False, "message": f"Path does not exist: {norm_path}"}

            if os.path.isfile(norm_path):
                # /select,"path" opens Explorer and selects the file
                subprocess.Popen(["explorer", f"/select,{norm_path}"])
            else:
                subprocess.Popen(["explorer", norm_path])

            return {"success": True, "opened_path": norm_path}
        except Exception as e:
            logger.error(f"Error revealing in Windows Explorer: {e}")
            return {"success": False, "message": str(e)}

    def get_export_file_path(self, export_id: str) -> Optional[str]:
        """Resolves the physical file path for a completed browser export."""
        export_folder = os.path.join(self._exports_dir, export_id)
        if not os.path.exists(export_folder):
            return None
        entries = os.listdir(export_folder)
        if not entries:
            return None
        return os.path.join(export_folder, entries[0])

    async def stream_export_manga(
        self,
        manga_id: str,
        request: ChapterExportRequest,
    ) -> AsyncGenerator[str, None]:
        """Async generator streaming SSE events for manga chapter export."""
        start_time = time.time()
        db = get_db()

        # 1. Fetch Manga info
        if not ObjectId.is_valid(manga_id):
            yield f"data: {json.dumps({'type': 'error', 'error': 'Invalid manga ID'})}\n\n"
            return

        manga = await db.mangas.find_one({"_id": ObjectId(manga_id)})
        if not manga:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Manga not found'})}\n\n"
            return

        manga_title = manga.get("title", "Untitled Manga")
        clean_title = clean_filename(manga_title)
        authors = manga.get("authors") or []
        summary = manga.get("description") or ""

        # 2. Fetch Chapters
        fetch_lang = None if (request.chapter_ids and len(request.chapter_ids) > 0) else request.language
        if fetch_lang and fetch_lang.lower() == "all":
            fetch_lang = None

        raw_chapters = await chapter_service.get_manga_chapters(manga_id, language=fetch_lang)
        if not raw_chapters and fetch_lang is not None:
            raw_chapters = await chapter_service.get_manga_chapters(manga_id)

        if not raw_chapters:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Không tìm thấy chapter nào để xuất dữ liệu'})}\n\n"
            return

        all_chapters = [ExportChapter(c) for c in raw_chapters]

        # Filter by selected chapter IDs if specified
        if request.chapter_ids and len(request.chapter_ids) > 0:
            target_ids_set = {str(cid) for cid in request.chapter_ids}
            target_chapters = [c for c in all_chapters if c.id in target_ids_set]
        elif request.language and request.language.lower() != "all":
            req_lang = request.language.strip().lower()
            target_chapters = [c for c in all_chapters if (c.language or "en").lower() == req_lang]
        else:
            target_chapters = all_chapters

        if not target_chapters:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Không có chapter nào phù hợp với bộ lọc đã chọn'})}\n\n"
            return

        # Sort naturally by volume and chapter_numeric
        def sort_key(c: ExportChapter):
            vol_val = 0.0
            if c.volume:
                try:
                    vol_val = float(str(c.volume).replace("v", "").replace("Vol.", "").strip())
                except ValueError:
                    vol_val = 999.0
            num_val = c.chapter_numeric or 0.0
            return (vol_val, num_val)

        target_chapters.sort(key=sort_key)

        total_chapters = len(target_chapters)
        total_pages_overall = sum(len(c.pages) for c in target_chapters)

        if total_pages_overall == 0:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Các chương đã chọn không có trang ảnh nào'})}\n\n"
            return

        export_id = str(uuid.uuid4())
        yield f"data: {
            json.dumps(
                {
                    'type': 'init',
                    'export_id': export_id,
                    'manga_id': manga_id,
                    'manga_title': manga_title,
                    'total_chapters': total_chapters,
                    'total_pages': total_pages_overall,
                    'format': request.format,
                    'grouping': request.grouping,
                    'destination': request.destination,
                }
            )
        }\n\n"

        # 3. Setup Destination Directory
        if request.destination == "browser":
            work_dir = os.path.join(self._exports_dir, export_id)
            os.makedirs(work_dir, exist_ok=True)
        else:
            base_dir = request.local_path
            if not base_dir:
                base_dir = os.path.join(settings.download_dir, "Exports", clean_title)
            work_dir = normalize_windows_path(base_dir)
            os.makedirs(work_dir, exist_ok=True)

        # 4. Fetch cover image if requested
        cover_image_bytes = None
        if request.include_cover and manga.get("cover_image_key"):
            try:
                resp = minio_service.client.get_object(minio_service.bucket, manga["cover_image_key"])
                cover_image_bytes = resp.read()
                resp.close()
                resp.release_conn()
            except Exception as ce:
                logger.warning(f"Could not load cover image for export: {ce}")

        # 5. Download pages and organize by group
        # Groups map: group_key -> list of (chapter_obj, [(filename, bytes)])
        grouped_data: Dict[str, List[Tuple[Any, List[Tuple[str, bytes]]]]] = {}
        total_pages_done = 0
        total_bytes_processed = 0

        for chap_idx, chapter in enumerate(target_chapters, 1):
            chap_num = chapter.chapter_number
            chap_title = chapter.title or ""
            chap_vol = chapter.volume

            yield f"data: {
                json.dumps(
                    {
                        'type': 'chapter_start',
                        'chapter_id': chapter.id,
                        'chapter_number': chap_num,
                        'volume': chap_vol,
                        'title': chap_title,
                        'page_count': len(chapter.pages),
                        'chapter_index': chap_idx,
                        'total_chapters': total_chapters,
                    }
                )
            }\n\n"

            # Determine group key
            if request.grouping == "by_volume":
                group_key = f"Volume {chap_vol.strip().zfill(2)}" if chap_vol else "No Volume"
            elif request.grouping == "by_chapter":
                group_key = f"Chapter {chap_num}"
            else:
                group_key = "All"

            if group_key not in grouped_data:
                grouped_data[group_key] = []

            chapter_pages_data: List[Tuple[str, bytes]] = []

            for p_idx, page in enumerate(chapter.pages, 1):
                raw_bytes = b""
                try:
                    obj_key = page.object_key
                    resp = minio_service.client.get_object(minio_service.bucket, obj_key)
                    raw_bytes = resp.read()
                    resp.close()
                    resp.release_conn()
                except Exception as pe:
                    logger.warning(f"Failed to fetch page {page.filename} for chapter {chap_num}: {pe}")
                    continue

                chapter_pages_data.append((page.filename, raw_bytes))
                total_pages_done += 1
                total_bytes_processed += len(raw_bytes)

                elapsed = max(0.05, time.time() - start_time)
                speed = total_pages_done / elapsed
                remaining = max(0, total_pages_overall - total_pages_done)
                eta = remaining / max(0.1, speed)
                percent = round((total_pages_done / max(1, total_pages_overall)) * 85.0, 1)

                # Thumbnail preview for UX
                preview_base64 = None
                if p_idx == 1 or p_idx % 5 == 0:
                    try:
                        with Image.open(io.BytesIO(raw_bytes)) as thumb:
                            thumb.thumbnail((120, 160))
                            if thumb.mode in ("RGBA", "P"):
                                thumb = thumb.convert("RGB")
                            t_buf = io.BytesIO()
                            thumb.save(t_buf, format="JPEG", quality=65)
                            preview_base64 = (
                                f"data:image/jpeg;base64,{base64.b64encode(t_buf.getvalue()).decode('utf-8')}"
                            )
                    except Exception:
                        pass

                yield f"data: {
                    json.dumps(
                        {
                            'type': 'page_progress',
                            'chapter_number': chap_num,
                            'chapter_title': chap_title,
                            'chapter_index': chap_idx,
                            'total_chapters': total_chapters,
                            'page_number': p_idx,
                            'chapter_page_count': len(chapter.pages),
                            'total_pages_done': total_pages_done,
                            'total_pages_overall': total_pages_overall,
                            'percent': percent,
                            'speed_pages_per_sec': round(speed, 1),
                            'eta_seconds': int(eta),
                            'elapsed_seconds': int(elapsed),
                            'total_bytes_processed': total_bytes_processed,
                            'preview_base64': preview_base64,
                        }
                    )
                }\n\n"

            grouped_data[group_key].append((chapter, chapter_pages_data))

        # 6. Packaging Phase (85% -> 100%)
        yield f"data: {
            json.dumps(
                {
                    'type': 'packaging_start',
                    'percent': 88.0,
                    'message': f'Đang đóng gói định dạng {request.format.upper()} ({request.grouping})...',
                }
            )
        }\n\n"

        exported_items: List[ChapterExportItem] = []
        final_file_path: Optional[str] = None
        is_optimize = request.image_optimization == "compressed"

        # Case A: PDF Format
        if request.format == "pdf":
            generated_pdfs: List[Tuple[str, bytes]] = []

            for group_name, chaps in grouped_data.items():
                pdf_images: List[Tuple[str, bytes]] = []
                # Prepend cover page if single file or first volume
                if cover_image_bytes and (group_name in ("All", "Volume 01", "Volume 1")):
                    pdf_images.append(("000_cover.jpg", cover_image_bytes))

                total_pages_in_group = 0
                for ch, pages in chaps:
                    for fname, pdata in pages:
                        pdf_images.append((f"{ch.chapter_number}_{fname}", pdata))
                        total_pages_in_group += 1

                if not pdf_images:
                    continue

                if request.grouping == "single_file":
                    pdf_filename = f"{clean_title}.pdf"
                elif request.grouping == "by_volume":
                    pdf_filename = f"{clean_title} - {clean_filename(group_name)}.pdf"
                else:  # by_chapter
                    pdf_filename = f"{clean_title} - {clean_filename(group_name)}.pdf"

                pdf_bytes = self.create_pdf_from_images(pdf_images, optimize=is_optimize)
                generated_pdfs.append((pdf_filename, pdf_bytes))

                if request.destination == "local_folder":
                    dest_file = os.path.join(work_dir, pdf_filename)
                    with open(dest_file, "wb") as f:
                        f.write(pdf_bytes)
                    exported_items.append(
                        ChapterExportItem(
                            file_name=pdf_filename,
                            file_path=dest_file,
                            file_size=len(pdf_bytes),
                            page_count=len(pdf_images),
                        )
                    )

            if request.destination == "browser":
                if not generated_pdfs:
                    yield f"data: {json.dumps({'type': 'error', 'error': 'Không tạo được file PDF nào từ các trang ảnh'})}\n\n"
                    return
                if len(generated_pdfs) == 1:
                    pdf_name, pdf_data = generated_pdfs[0]
                    final_path = os.path.join(work_dir, pdf_name)
                    with open(final_path, "wb") as f:
                        f.write(pdf_data)
                    final_file_path = final_path
                else:
                    # Package multiple PDFs into a single zip for browser download
                    zip_name = f"{clean_title}_PDFs.zip"
                    zip_bytes = self.create_zip_archive(generated_pdfs, compress=True)
                    final_path = os.path.join(work_dir, zip_name)
                    with open(final_path, "wb") as f:
                        f.write(zip_bytes)
                    final_file_path = final_path
            else:
                final_file_path = work_dir

        # Case B: ZIP or CBZ Format
        elif request.format in ("zip", "cbz"):
            ext = ".cbz" if request.format == "cbz" else ".zip"
            generated_archives: List[Tuple[str, bytes]] = []

            for group_name, chaps in grouped_data.items():
                archive_files: List[Tuple[str, bytes]] = []
                # Metadata
                if request.include_metadata:
                    first_ch = chaps[0][0] if chaps else None
                    first_ch_num = first_ch.chapter_number if first_ch else ""
                    first_ch_vol = first_ch.volume if first_ch else ""
                    xml = self.generate_comic_info_xml(
                        manga_title=manga_title,
                        chapter_number=first_ch_num,
                        volume=first_ch_vol,
                        chapter_title=first_ch.title if first_ch else "",
                        page_count=sum(len(p) for _, p in chaps),
                        summary=summary,
                        authors=authors,
                        language=request.language or "en",
                    )
                    archive_files.append(("ComicInfo.xml", xml.encode("utf-8")))

                # Cover image
                if cover_image_bytes and (group_name in ("All", "Volume 01", "Volume 1")):
                    archive_files.append(("000_cover.jpg", cover_image_bytes))

                # Pages
                for ch, pages in chaps:
                    chap_folder = f"Chapter {ch.chapter_number}"
                    if ch.title:
                        chap_folder += f" - {clean_filename(ch.title)}"
                    vol_folder = f"Volume {ch.volume}" if ch.volume else ""

                    for fname, pdata in pages:
                        if request.grouping == "single_file":
                            arcname = f"{vol_folder}/{chap_folder}/{fname}" if vol_folder else f"{chap_folder}/{fname}"
                        elif request.grouping == "by_volume":
                            arcname = f"{chap_folder}/{fname}"
                        else:  # by_chapter
                            arcname = fname

                        archive_files.append((arcname, pdata))

                if request.grouping == "single_file":
                    arch_filename = f"{clean_title}{ext}"
                elif request.grouping == "by_volume":
                    arch_filename = f"{clean_title} - {clean_filename(group_name)}{ext}"
                else:
                    arch_filename = f"{clean_title} - {clean_filename(group_name)}{ext}"

                # CBZ usually uses ZIP_STORED or light compression
                arch_bytes = self.create_zip_archive(archive_files, compress=True)
                generated_archives.append((arch_filename, arch_bytes))

                if request.destination == "local_folder":
                    dest_file = os.path.join(work_dir, arch_filename)
                    with open(dest_file, "wb") as f:
                        f.write(arch_bytes)
                    exported_items.append(
                        ChapterExportItem(
                            file_name=arch_filename,
                            file_path=dest_file,
                            file_size=len(arch_bytes),
                            page_count=len(archive_files),
                        )
                    )

            if request.destination == "browser":
                if not generated_archives:
                    yield f"data: {json.dumps({'type': 'error', 'error': 'Không tạo được gói nén nào từ các chương đã chọn'})}\n\n"
                    return
                if len(generated_archives) == 1:
                    arch_name, arch_data = generated_archives[0]
                    final_path = os.path.join(work_dir, arch_name)
                    with open(final_path, "wb") as f:
                        f.write(arch_data)
                    final_file_path = final_path
                else:
                    zip_name = f"{clean_title}_{request.format.upper()}s.zip"
                    zip_bytes = self.create_zip_archive(generated_archives, compress=True)
                    final_path = os.path.join(work_dir, zip_name)
                    with open(final_path, "wb") as f:
                        f.write(zip_bytes)
                    final_file_path = final_path
            else:
                final_file_path = work_dir

        # Case C: Raw Folder Format (local disk only)
        elif request.format == "folder":
            for _group_name, chaps in grouped_data.items():
                for ch, pages in chaps:
                    vol_part = f"Volume {clean_filename(ch.volume)}" if ch.volume else ""
                    chap_part = f"Chapter {clean_filename(ch.chapter_number)}"
                    if ch.title:
                        chap_part += f" - {clean_filename(ch.title)}"

                    if vol_part:
                        target_dir = os.path.join(work_dir, vol_part, chap_part)
                    else:
                        target_dir = os.path.join(work_dir, chap_part)

                    os.makedirs(target_dir, exist_ok=True)
                    for fname, pdata in pages:
                        with open(os.path.join(target_dir, fname), "wb") as f:
                            f.write(pdata)

            final_file_path = work_dir

        # 7. Finalization & Explorer Trigger
        final_file_size = (
            os.path.getsize(final_file_path)
            if final_file_path and os.path.isfile(final_file_path)
            else total_bytes_processed
        )
        download_url = (
            f"/api/manga/{manga_id}/export/download/{export_id}" if request.destination == "browser" else None
        )

        if request.destination == "local_folder" and request.auto_open_explorer and final_file_path:
            self.reveal_in_windows_explorer(final_file_path)

        yield f"data: {
            json.dumps(
                {
                    'type': 'completed',
                    'export_id': export_id,
                    'percent': 100.0,
                    'total_chapters': total_chapters,
                    'total_pages': total_pages_done,
                    'total_size_bytes': final_file_size,
                    'download_url': download_url,
                    'destination_path': final_file_path,
                    'file_name': os.path.basename(final_file_path) if final_file_path else clean_title,
                    'is_local': request.destination == 'local_folder',
                    'elapsed_seconds': int(time.time() - start_time),
                }
            )
        }\n\n"


chapter_export_service = ChapterExportService()
