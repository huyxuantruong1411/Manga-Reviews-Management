# Implementation Plan — Manga Reading List Web App

> **Dành cho AI Agent thực thi.** Đọc kỹ toàn bộ file này trước khi bắt đầu code.  
> Các file đính kèm tham khảo: `project_dump.txt` (manga downloader cũ), `DESIGN.md` (design system), `Manga.txt` (danh sách đọc mẫu).

---

## PHẦN 1 — YÊU CẦU CHI TIẾT

### 1.1 Tổng quan

Web app cá nhân một người dùng, quản lý danh sách đọc manga. Chuyển đổi từ file `.txt` thô (xem `Manga.txt`) sang giao diện web có database. Backend FastAPI, frontend riêng biệt (React + Vite + TypeScript + TailwindCSS). Database MongoDB. Lưu trữ media (cover) trên MinIO. Hai project tách biệt hoàn toàn, giao tiếp qua REST API.

### 1.2 Tính năng chính

#### A. Quản lý Manga (Trang danh sách)

- Hiển thị toàn bộ manga trong danh sách đọc dưới dạng grid card (cover + metadata cơ bản: title, status, rating, tag, năm, author).
- **Phân loại trạng thái đọc** bắt buộc gồm 4 option: `unread` / `reading` / `completed` / `dropped`. Lưu **lịch sử** mỗi lần thay đổi trạng thái vào collection `audit_logs` (timestamp, field thay đổi, giá trị cũ, giá trị mới).
- **Filter sidebar** theo: trạng thái đọc, tag (multi-select), năm, thể loại, ngôn ngữ gốc, tình trạng publication (ongoing/completed/hiatus/cancelled), điểm rating (range slider).
- **Sort** theo: title (A-Z / Z-A), ngày thêm vào (mới nhất/cũ nhất), điểm rating, năm xuất bản.
- **Phân trang**: người dùng chọn số lượng manga mỗi trang (12 / 24 / 48 / 96). Giữ trạng thái phân trang trong URL query params.
- **Advanced Search** (copy thiết kế advanced search của MangaDex): tìm theo title (live search debounce 300ms), author, artist, tag include/exclude (multi-select). Live search title query vào DB cục bộ, không block UI, dùng debounce.
- Mọi thao tác filter + search + sort + phân trang đều xử lý **phi đồng bộ**, không làm đơ UI.

#### B. Trang chi tiết Manga

Hiển thị **toàn bộ metadata** của một bộ manga, bao gồm:

- Title (tên chính), alt titles (tất cả ngôn ngữ), cover image (ưu tiên MinIO, fallback MangaDex CDN bằng UUID, fallback placeholder)
- Author(s), artist(s), status (publication), year, demographic, content rating
- Tags (từ MangaDex + custom tags người dùng thêm), description (tất cả ngôn ngữ)
- Links/providers: tên provider + URL (vd: MangaPlus, ComicWalker, ...). Người dùng có thể **thêm mới provider** thủ công với: tên + URL + rule tùy chọn (ví dụ quy tắc access của provider đó). Dữ liệu provider lấy từ MangaDex API field `links` và cho phép bổ sung thêm.
- Volumes, chapters count (nếu có từ API)
- Nguồn dữ liệu: `mangadex` hoặc `manual`
- Ngày thêm vào danh sách, ngày cập nhật cuối, trạng thái đọc hiện tại

**Trạng thái đọc**: Dropdown chọn `unread/reading/completed/dropped`. Mỗi lần thay đổi ghi `audit_log`.

**Rating cá nhân**: Số thực `x.x` từ 0.0 đến 10.0 (bước 0.5), ví dụ `8.5/10`. Hiển thị dạng số input + thanh slider trực quan.

**Nút "Refresh từ MangaDex"**: Gọi MangaDex API lấy metadata mới nhất (cover mới, chapter count mới,...), cập nhật vào DB, thay cover cũ trong MinIO bằng cover mới. Chỉ hoạt động nếu manga có `mangadex_id`.

**Nút "Tải danh sách chương"**: Mở dialog cho phép chọn đường dẫn lưu file và kích hoạt tải chương từ MangaDex (tham khảo logic trong `project_dump.txt` — `mangadex_api.py` và `core/download_manager.py`). Chỉ hoạt động nếu manga có `mangadex_id`. Download chạy background, UI hiển thị trạng thái tiến độ.

**Chỉnh sửa metadata thủ công**: Dù dữ liệu lấy từ MangaDex, người dùng vẫn có thể sửa bất kỳ trường nào (ví dụ thêm alt title tiếng Việt, thêm provider URL). Thay đổi thủ công được đánh dấu riêng và ghi vào `audit_logs`.

#### C. Hệ thống Review (trong trang chi tiết)

- Một manga có thể có **nhiều review box**, mỗi box là một bài viết độc lập.
- Mỗi review box có: **tiêu đề** (optional), **nội dung** (rich text), **timestamp tạo**, **timestamp cập nhật cuối**.
- Nút **"+ New Review"** để thêm box mới → hiện ra dưới dạng **popup/modal**.
- CRUD đầy đủ: tạo mới, xem, sửa, xóa từng review box.
- **Editor** trong popup hỗ trợ formatting: xuống hàng (Enter), heading (H1/H2/H3), đánh số thứ tự (ordered list), bullet list, **phân cách ngang** `---`, bold, italic. Dùng thư viện **Tiptap** (React). Nội dung lưu dạng JSON (Tiptap document format) vào DB, render đúng format khi load lại.
- **Nút "Format/Cleanup text"**: Tự động xóa các tab thừa liên tiếp (`\t+` giữa các từ) thành một khoảng trắng trong nội dung plain text của review, rồi re-parse lại vào editor. Dùng để clean dữ liệu từ file `.txt` gốc (xem `Manga.txt` — nhiều dòng có `\t\t\t` giữa các từ).
- Lịch sử review: hiển thị timeline "hôm nay", "hôm qua", "tuần này", "tháng trước", "năm ngoái" dựa trên `created_at` của từng review box. Tổng hợp thống kê: số review viết theo tháng/năm (biểu đồ nhỏ trong trang analytics).

#### D. Thêm mới Manga

Dialog/trang thêm manga với **3 luồng**:

**Luồng 1 — Nhập MangaDex UUID**:
- Input field nhập UUID trực tiếp.
- Gọi backend → backend gọi MangaDex API `/manga/{uuid}` → tải full metadata → tải cover từ MangaDex CDN → upload lên MinIO → lưu vào DB.
- Hiển thị preview metadata trước khi xác nhận thêm.

**Luồng 2 — Tìm theo tên**:
- Input field nhập tên manga.
- Backend gọi MangaDex API `/manga?title=...&includes[]=cover_art&includes[]=author&includes[]=artist` → trả về list kết quả.
- Frontend hiển thị danh sách kết quả (cover thumbnail + title + alt titles + year + author) cho người dùng chọn.
- Sau khi chọn → tải full metadata + cover → lưu DB.
- MangaDex API có hỗ trợ query `altTitles` nên title tiếng Việt cũng có thể tìm được.

**Luồng 3 — Nhập thủ công** (khi manga không có trên MangaDex):
- Form đầy đủ nhưng tất cả trường đều **optional** (chỉ cần title là bắt buộc).
- Các trường: title, alt titles (có thể thêm nhiều), author(s), artist(s), year, status, demographic, content rating, description, tags (chọn từ tag DB + tạo mới), cover (upload ảnh từ máy → lưu lên MinIO), provider links.
- Nguồn được đánh dấu là `manual`.

#### E. Custom Tags

- Tag có hai loại: `mangadex` (sync từ API) và `custom` (người dùng tự tạo).
- Người dùng có thể tạo custom tag mới bất kỳ lúc nào (từ form thêm manga, form edit manga, hoặc trang quản lý tag riêng).
- Mọi nơi hiển thị tag đều load đủ cả hai loại.
- Trang quản lý tag: xem, sửa tên/màu, xóa custom tag (tag MangaDex chỉ xem).

#### F. Analytics Dashboard

Trang thống kê cá nhân, bao gồm:

- **Tổng quan**: Tổng số manga, số theo từng trạng thái đọc, tổng số review đã viết.
- **Biểu đồ phân phối điểm**: Histogram số manga theo rating (0-1, 1-2, ... 9-10).
- **Tag phổ biến nhất**: Top 10 tag được gắn nhiều nhất, dạng bar chart.
- **Timeline đọc**: Biểu đồ số manga thêm vào theo tháng (bar chart).
- **Timeline review**: Số review viết theo tháng/năm (line chart hoặc bar chart). Hiển thị phân kỳ "rất tích cực", "bình thường" so với trung bình.
- **Điểm trung bình**: Rating trung bình toàn bộ manga đã chấm điểm.
- **Author/Artist được đọc nhiều nhất**: Top 5.
- Tất cả chart dùng thư viện **Recharts** (nhẹ, tương thích React tốt).

#### G. Dark Mode

- Toàn bộ app hỗ trợ dark/light mode toggle (button ở header).
- Sử dụng CSS variables (xem `DESIGN.md` để suy ra dark mode palette tương ứng — tối hóa background, giảm độ sáng neutral, giữ nguyên accent colors).
- Trạng thái theme lưu vào `localStorage`. Khi toggle, **tất cả** component đều đổi mode đồng thời, không có component nào bị "sót".
- Sử dụng Tailwind `dark:` variant + class `dark` trên `<html>` element.

---

### 1.3 Yêu cầu phi chức năng

- Live search debounce 300ms, không block UI.
- MangaDex API rate limit: tối đa 5 requests/giây. Backend phải tự throttle, tránh bị ban IP.
- Tên file/folder khi tải chương phải được sanitize (xóa ký tự đặc biệt), tham khảo hàm `clean_filename` trong `project_dump.txt` (`utils/file_utils.py`): `re.sub(r'[<>:"/\|?*]', '', str(filename)).strip()`. Áp dụng thêm xóa các ký tự Unicode không hợp lệ trên Windows.
- Đường dẫn/URL trong DB không được hardcode `localhost`. Dùng object key trong MinIO (ví dụ `covers/manga-uuid.jpg`) — URL resolve khi serve.
- Bucket MinIO: **`manga-library`** (không phải `manga-media` đã dùng cho project khác).
- Cover trong MinIO lưu theo path: `covers/{manga_id_in_db}.jpg` (hoặc `.png` / `.webp` tùy định dạng gốc).
- Khi update metadata, xóa cover cũ trong MinIO trước khi upload cover mới.
- Cấu trúc folder rõ ràng, không gom code vào một file ngàn dòng.
- Backend dùng `uv` để quản lý môi trường Python.
- MongoDB URI: `mongodb://localhost:27017/`, database name: `manga_library`.

---

## PHẦN 2 — IMPLEMENTATION PLAN

### 2.1 Cấu trúc dự án tổng thể

```
manga-app/
├── backend/          # FastAPI project
└── frontend/         # React + Vite project
```

---

### 2.2 BACKEND (FastAPI)

#### 2.2.1 Khởi tạo project

```bash
cd manga-app
mkdir backend && cd backend
uv init
uv add fastapi uvicorn[standard] motor pymongo minio httpx python-multipart python-dotenv pydantic-settings
```

**File `.env`** (backend):
```
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB=manga_library
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=manga-library
MINIO_SECURE=false
MANGADEX_API_BASE=https://api.mangadex.org
DOWNLOAD_BASE_PATH=./downloads
```

> Người dùng cần kiểm tra lại `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` khớp với instance MinIO đang chạy (port 9001 là web UI, port API mặc định là 9000).

#### 2.2.2 Cấu trúc folder backend

```
backend/
├── pyproject.toml
├── .env
├── main.py                  # FastAPI app entrypoint, mount routers
├── config.py                # Settings từ .env dùng pydantic-settings
├── database/
│   ├── __init__.py
│   ├── connection.py        # Motor client, database getter
│   └── indexes.py           # Tạo MongoDB indexes khi startup
├── models/
│   ├── __init__.py
│   ├── manga.py             # Pydantic models cho Manga
│   ├── review.py            # Pydantic models cho Review
│   ├── tag.py               # Pydantic models cho Tag
│   └── audit_log.py         # Pydantic model cho AuditLog
├── routers/
│   ├── __init__.py
│   ├── manga.py             # CRUD manga + search + filter
│   ├── reviews.py           # CRUD reviews của manga
│   ├── tags.py              # CRUD custom tags
│   ├── mangadex.py          # Search/fetch từ MangaDex API
│   ├── analytics.py         # Thống kê
│   └── downloads.py         # Trigger tải chương
├── services/
│   ├── __init__.py
│   ├── manga_service.py     # Business logic manga (add, update, delete)
│   ├── mangadex_service.py  # Gọi MangaDex API, throttle, parse response
│   ├── minio_service.py     # Upload/delete cover MinIO
│   ├── download_service.py  # Tải chương (logic từ project cũ)
│   └── analytics_service.py # Tính toán thống kê
└── utils/
    ├── __init__.py
    ├── file_utils.py        # clean_filename, sanitize path
    └── rate_limiter.py      # Simple async rate limiter cho MangaDex API
```

#### 2.2.3 MongoDB Collections & Schema

**Collection: `mangas`**

```python
{
    "_id": ObjectId,
    "mangadex_id": str | None,          # UUID từ MangaDex, None nếu manual
    "source": "mangadex" | "manual",
    
    # Core metadata
    "title": str,                        # Title chính (thường là tiếng Anh/gốc)
    "alt_titles": [                      # Alt titles các ngôn ngữ
        {"lang": "vi", "title": "..."},
        {"lang": "ja", "title": "..."},
    ],
    "description": {                     # Description theo ngôn ngữ
        "en": "...",
        "vi": "..."
    },
    "cover_minio_key": str | None,       # Key trong MinIO, vd "covers/abc123.jpg"
    "cover_mangadex_filename": str|None, # Filename từ MangaDex để construct CDN URL
    
    # Credits
    "authors": [{"id": str|None, "name": str}],
    "artists": [{"id": str|None, "name": str}],
    
    # Classification
    "status": "ongoing"|"completed"|"hiatus"|"cancelled"|None,
    "year": int | None,
    "demographic": "shounen"|"shoujo"|"josei"|"seinen"|None,
    "content_rating": "safe"|"suggestive"|"erotica"|"pornographic"|None,
    "original_language": str | None,    # "ja", "ko", "zh", ...
    
    # Tags (array of tag IDs trỏ vào collection tags)
    "tag_ids": [str],
    
    # Provider links
    "links": [
        {
            "name": str,                # "MangaPlus", "ComicWalker", custom name
            "url": str,
            "rule": str | None,         # Ghi chú về rule access (optional)
            "source": "mangadex"|"manual"
        }
    ],
    
    # Stats từ MangaDex (nếu có)
    "chapter_count": int | None,
    "volume_count": int | None,
    
    # Reading list info
    "read_status": "unread"|"reading"|"completed"|"dropped",
    "personal_rating": float | None,    # 0.0 - 10.0 bước 0.5
    
    # Timestamps
    "added_at": datetime,
    "updated_at": datetime,
    "last_mangadex_sync": datetime | None,
    
    # Flags
    "is_manually_edited": bool          # True nếu user đã edit metadata từng field
}
```

**Collection: `reviews`**

```python
{
    "_id": ObjectId,
    "manga_id": str,                    # ObjectId của manga (dạng string)
    "title": str | None,                # Tiêu đề review (optional)
    "content": dict,                    # Tiptap JSON document format
    "created_at": datetime,
    "updated_at": datetime,
    "is_deleted": bool                  # Soft delete
}
```

**Collection: `tags`**

```python
{
    "_id": ObjectId,
    "mangadex_id": str | None,          # UUID tag MangaDex, None nếu custom
    "source": "mangadex" | "custom",
    "name": {                           # Tên theo ngôn ngữ
        "en": str,
        "vi": str | None
    },
    "group": str | None,                # "genre", "theme", "format", "content"
    "description": dict | None,
    "created_at": datetime
}
```

**Collection: `audit_logs`**

```python
{
    "_id": ObjectId,
    "entity_type": "manga"|"review"|"tag",
    "entity_id": str,
    "action": "create"|"update"|"delete"|"status_change"|"metadata_sync",
    "field": str | None,                # Field nào thay đổi
    "old_value": Any | None,
    "new_value": Any | None,
    "timestamp": datetime,
    "note": str | None
}
```

**Collection: `download_tasks`**

```python
{
    "_id": ObjectId,
    "manga_id": str,
    "mangadex_id": str,
    "save_path": str,
    "status": "pending"|"running"|"completed"|"failed",
    "progress": float,                  # 0.0 - 1.0
    "total_chapters": int | None,
    "completed_chapters": int,
    "error": str | None,
    "created_at": datetime,
    "updated_at": datetime
}
```

**MongoDB Indexes** (tạo khi startup):

```python
# mangas
await db.mangas.create_index("mangadex_id", sparse=True)
await db.mangas.create_index("read_status")
await db.mangas.create_index("tag_ids")
await db.mangas.create_index([("title", "text")], default_language="none")
await db.mangas.create_index("added_at")
await db.mangas.create_index("personal_rating", sparse=True)

# reviews
await db.reviews.create_index("manga_id")
await db.reviews.create_index("created_at")

# audit_logs
await db.audit_logs.create_index([("entity_id", 1), ("timestamp", -1)])

# tags
await db.tags.create_index("mangadex_id", sparse=True)
await db.tags.create_index("source")
```

#### 2.2.4 API Endpoints

**Manga Router** `/api/manga`

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/` | List manga với filter + sort + pagination (query params) |
| POST | `/` | Thêm manga mới (từ MangaDex UUID/name hoặc manual) |
| GET | `/{manga_id}` | Chi tiết một manga |
| PATCH | `/{manga_id}` | Cập nhật metadata thủ công |
| DELETE | `/{manga_id}` | Xóa manga (và reviews, cover MinIO) |
| PATCH | `/{manga_id}/status` | Cập nhật read status |
| PATCH | `/{manga_id}/rating` | Cập nhật personal rating |
| POST | `/{manga_id}/refresh` | Sync lại metadata từ MangaDex |
| GET | `/{manga_id}/cover` | Lấy URL cover (resolve MinIO hoặc MangaDex CDN) |
| GET | `/{manga_id}/history` | Lịch sử thay đổi của manga |

**Query params cho GET `/api/manga`**:
- `read_status` (multi): `unread,reading,completed,dropped`
- `tag_ids` (multi): filter manga có tất cả/bất kỳ tag này
- `tag_mode`: `any` | `all` (mặc định `any`)
- `year_from`, `year_to`: int
- `rating_min`, `rating_max`: float
- `demographic` (multi)
- `content_rating` (multi)
- `status` (multi): publication status
- `original_language` (multi)
- `title`: string, live search (MongoDB text search hoặc regex)
- `author`: string
- `sort_by`: `title_asc|title_desc|added_at_desc|added_at_asc|rating_desc|rating_asc|year_desc|year_asc`
- `page`: int (default 1)
- `per_page`: int (default 24, choices: 12/24/48/96)

**Reviews Router** `/api/manga/{manga_id}/reviews`

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/` | List reviews của manga |
| POST | `/` | Tạo review mới |
| GET | `/{review_id}` | Chi tiết review |
| PATCH | `/{review_id}` | Cập nhật review |
| DELETE | `/{review_id}` | Soft delete review |
| POST | `/{review_id}/cleanup` | Cleanup tab chars trong content |

**MangaDex Router** `/api/mangadex`

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/search` | Tìm manga trên MangaDex (param: `title`) |
| GET | `/{mangadex_id}` | Lấy thông tin manga từ MangaDex theo UUID |
| GET | `/{mangadex_id}/chapters` | Lấy danh sách chương từ MangaDex |
| POST | `/sync-tags` | Sync tag list từ MangaDex vào DB |

**Tags Router** `/api/tags`

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/` | Lấy tất cả tags (MangaDex + custom) |
| POST | `/` | Tạo custom tag mới |
| PATCH | `/{tag_id}` | Sửa custom tag |
| DELETE | `/{tag_id}` | Xóa custom tag |

**Analytics Router** `/api/analytics`

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/summary` | Tổng số manga, reviews, rating trung bình |
| GET | `/by-status` | Phân phối theo read status |
| GET | `/by-rating` | Histogram rating |
| GET | `/top-tags` | Top tags |
| GET | `/timeline` | Manga thêm theo tháng |
| GET | `/reviews-timeline` | Reviews viết theo tháng |
| GET | `/top-authors` | Top authors |

**Downloads Router** `/api/downloads`

| Method | Path | Mô tả |
|--------|------|--------|
| POST | `/{manga_id}/start` | Bắt đầu tải chương |
| GET | `/{manga_id}/status` | Trạng thái download task hiện tại |
| DELETE | `/{manga_id}/cancel` | Huỷ download |

#### 2.2.5 MangaDex Service

File: `services/mangadex_service.py`

- Dùng `httpx.AsyncClient` cho tất cả request.
- **Rate limiter**: Tự implement simple token bucket limiter — max 5 requests/giây. Tham khảo `utils/rate_limiter.py`:

```python
import asyncio, time

class RateLimiter:
    def __init__(self, rate: float = 5.0):
        self._rate = rate
        self._tokens = rate
        self._last = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            self._tokens = min(self._rate, self._tokens + (now - self._last) * self._rate)
            self._last = now
            if self._tokens < 1:
                await asyncio.sleep((1 - self._tokens) / self._rate)
                self._tokens = 0
            else:
                self._tokens -= 1
```

- `async def search_manga(title: str) -> list[dict]`: Gọi `GET /manga?title=...&includes[]=cover_art&includes[]=author&includes[]=artist&limit=20`
- `async def get_manga(mangadex_id: str) -> dict`: Gọi `GET /manga/{id}?includes[]=cover_art&includes[]=author&includes[]=artist&includes[]=scanlation_group`
- `async def get_chapters(mangadex_id: str) -> list[dict]`: Gọi `GET /manga/{id}/feed?...` với pagination.
- `async def get_all_tags() -> list[dict]`: Gọi `GET /manga/tag`.
- `async def download_cover(mangadex_id: str, cover_filename: str) -> bytes`: Tải cover từ CDN MangaDex: `https://uploads.mangadex.org/covers/{mangadex_id}/{cover_filename}.512.jpg`

**Parse response MangaDex**:
- Cover: trong `relationships` tìm item có `type == "cover_art"`, lấy `attributes.fileName`
- Authors: tìm `type == "author"`, lấy `attributes.name`
- Artists: tìm `type == "artist"`, lấy `attributes.name`
- Links: `attributes.links` là dict `{raw_key: url_or_id}`. Map các key phổ biến sang tên đọc được: `al`→AniList, `ap`→Anime-Planet, `mu`→MangaUpdates, `nu`→NovelUpdates, `kt`→Kitsu, `mal`→MyAnimeList, `bw`→BookWalker, `amz`→Amazon, `cdj`→CD Japan, `ebj`→eBookJapan, `raw`→Raw, `engtl`→Official English.

#### 2.2.6 MinIO Service

File: `services/minio_service.py`

- Dùng `minio` SDK (sync, chạy trong `asyncio.to_thread` để không block).
- Tạo bucket `manga-library` nếu chưa có khi startup.
- `async def upload_cover(manga_id: str, image_bytes: bytes, content_type: str) -> str`: Upload, trả về object key.
- `async def delete_cover(key: str)`: Xóa object.
- `async def get_cover_url(key: str) -> str`: Trả về presigned URL hoặc public URL tùy cấu hình MinIO.

> MinIO mặc định sau khi pull: API port 9000, Console port 9001. Nếu người dùng muốn serve ảnh public, cần set bucket policy `public` hoặc dùng presigned URL. Mặc định dùng presigned URL (valid 24h).

#### 2.2.7 Download Service

File: `services/download_service.py`

Tham khảo `mangadex_api.py` và `core/download_manager.py` từ `project_dump.txt`.

- `async def start_download(task_id: str, manga_id: str, mangadex_id: str, save_path: str)`: Chạy trong background task.
  1. Tạo `download_task` document, status = `running`.
  2. Lấy danh sách chapters từ MangaDex API.
  3. Với mỗi chapter: tạo folder `{save_path}/{clean_filename(chapter_number)}/`, tải từng ảnh song song (max 4 workers).
  4. Cập nhật progress vào DB sau mỗi chapter.
  5. Status = `completed` khi xong, `failed` nếu lỗi.

- Dùng FastAPI `BackgroundTasks` để không block response. Người dùng poll `GET /api/downloads/{manga_id}/status` để theo dõi.

- **clean_filename** (từ project cũ, mở rộng thêm):
```python
import re, unicodedata

def clean_filename(name: str) -> str:
    # Xóa ký tự không hợp lệ trên Windows và Linux
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    # Xóa dấu cách thừa đầu cuối và dấu chấm ở cuối (Windows)
    name = name.strip().rstrip('.')
    return name or 'untitled'
```

#### 2.2.8 main.py

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database.connection import connect_db, close_db
from database.indexes import create_indexes
from routers import manga, reviews, tags, mangadex, analytics, downloads

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await create_indexes()
    # Sync MangaDex tags nếu collection rỗng
    yield
    await close_db()

app = FastAPI(title="Manga Library API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(manga.router, prefix="/api/manga", tags=["manga"])
app.include_router(reviews.router, prefix="/api/manga", tags=["reviews"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(mangadex.router, prefix="/api/mangadex", tags=["mangadex"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(downloads.router, prefix="/api/downloads", tags=["downloads"])
```

**Chạy backend**:
```bash
cd backend
uv run uvicorn main:app --reload --port 8000
```

---

### 2.3 FRONTEND (React + Vite + TypeScript + TailwindCSS)

#### 2.3.1 Khởi tạo

```bash
cd manga-app
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install tailwindcss @tailwindcss/vite
npm install axios react-router-dom@7
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-heading @tiptap/extension-ordered-list @tiptap/extension-bullet-list @tiptap/extension-horizontal-rule
npm install recharts
npm install lucide-react
npm install @tanstack/react-query
npm install clsx tailwind-merge
```

#### 2.3.2 Thiết kế (theo DESIGN.md)

Tất cả thiết kế phải tuân theo `DESIGN.md`. Tóm tắt nhanh:

- **Font**: Spartan (headings) + Poppins (UI). Import từ Google Fonts.
- **Primary color**: `#DA7500` (Brand Orange).
- **Background**: `#FFFFFF` (light) / dark mode background: `#141414`.
- **Text**: `#242424` (light) / `#E5E7EB` (dark).
- **Border**: `#E5E7EB` (light) / `#2D2D2D` (dark).
- **Cards**: border-radius `0px`, shadow subtle.
- **Primary Button**: bg `#DA7500`, text white, height 40px, border-radius 8px.
- **Genre Tags**: purple `#C084FC`, cyan `#05AAF0`, blue `#1199FF`.

**Tailwind config (`tailwind.config.ts`)**:

```typescript
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#DA7500',
          coral: '#FF6740',
        },
        accent: {
          purple: '#C084FC',
          cyan: '#05AAF0',
          blue: '#1199FF',
        },
        neutral: {
          charcoal: '#242424',
          dark: '#222222',
        }
      },
      fontFamily: {
        spartan: ['Spartan', 'sans-serif'],
        poppins: ['Poppins', 'sans-serif'],
      }
    }
  }
}
```

**Dark mode CSS variables** (trong `index.css`):

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #F0F1F2;
  --text-primary: #242424;
  --text-secondary: #6B7280;
  --border: #E5E7EB;
  --card-bg: #ffffff;
}
.dark {
  --bg-primary: #141414;
  --bg-secondary: #1E1E1E;
  --text-primary: #E5E7EB;
  --text-secondary: #9CA3AF;
  --border: #2D2D2D;
  --card-bg: #1E1E1E;
}
```

#### 2.3.3 Cấu trúc folder frontend

```
frontend/src/
├── main.tsx
├── App.tsx                    # Router setup
├── index.css                  # CSS variables, font import
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx        # Navigation sidebar (collapsible)
│   │   ├── Header.tsx         # Top bar với dark mode toggle
│   │   └── Layout.tsx         # Wrapper layout
│   ├── manga/
│   │   ├── MangaCard.tsx      # Card trong grid list
│   │   ├── MangaGrid.tsx      # Grid container
│   │   ├── MangaFilters.tsx   # Sidebar filter panel
│   │   ├── AdvancedSearch.tsx # Advanced search panel (MangaDex style)
│   │   ├── SortControls.tsx   # Sort + per-page controls
│   │   ├── Pagination.tsx     # Pagination component
│   │   ├── StatusBadge.tsx    # Badge hiển thị read status
│   │   ├── RatingDisplay.tsx  # Hiển thị x.x/10
│   │   └── CoverImage.tsx     # Cover với fallback logic
│   ├── detail/
│   │   ├── MetadataPanel.tsx  # Panel metadata chi tiết
│   │   ├── ProviderLinks.tsx  # Hiển thị + thêm provider links
│   │   ├── TagList.tsx        # Tags với màu sắc
│   │   └── AltTitles.tsx      # Danh sách alt titles
│   ├── reviews/
│   │   ├── ReviewList.tsx     # List các review boxes
│   │   ├── ReviewBox.tsx      # Một review box (hiển thị)
│   │   ├── ReviewEditor.tsx   # Modal editor (Tiptap)
│   │   └── ReviewTimeline.tsx # Sidebar timeline reviews
│   ├── add-manga/
│   │   ├── AddMangaDialog.tsx # Dialog chọn luồng thêm
│   │   ├── UUIDForm.tsx       # Luồng 1: nhập UUID
│   │   ├── SearchForm.tsx     # Luồng 2: tìm theo tên
│   │   ├── ManualForm.tsx     # Luồng 3: nhập thủ công
│   │   └── SearchResults.tsx  # Hiển thị kết quả tìm kiếm MangaDex
│   ├── analytics/
│   │   ├── SummaryCards.tsx
│   │   ├── RatingHistogram.tsx
│   │   ├── TopTagsChart.tsx
│   │   ├── TimelineChart.tsx
│   │   └── ReviewsTimeline.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Select.tsx
│       ├── Modal.tsx
│       ├── Tag.tsx
│       ├── Spinner.tsx
│       ├── Toast.tsx
│       └── ThemeToggle.tsx
├── pages/
│   ├── MangaListPage.tsx      # Trang danh sách
│   ├── MangaDetailPage.tsx    # Trang chi tiết
│   ├── AnalyticsPage.tsx      # Trang analytics
│   └── TagsPage.tsx           # Trang quản lý tags
├── hooks/
│   ├── useDebounce.ts
│   ├── useTheme.ts
│   └── useMangaList.ts
├── api/
│   ├── client.ts              # axios instance
│   ├── manga.ts               # API calls manga
│   ├── reviews.ts             # API calls reviews
│   ├── tags.ts                # API calls tags
│   ├── mangadex.ts            # API calls MangaDex proxy
│   ├── analytics.ts
│   └── downloads.ts
└── types/
    ├── manga.ts
    ├── review.ts
    ├── tag.ts
    └── analytics.ts
```

#### 2.3.4 Routing (react-router-dom v7)

```typescript
// App.tsx
<Routes>
  <Route path="/" element={<Layout />}>
    <Route index element={<MangaListPage />} />
    <Route path="manga/:mangaId" element={<MangaDetailPage />} />
    <Route path="analytics" element={<AnalyticsPage />} />
    <Route path="tags" element={<TagsPage />} />
  </Route>
</Routes>
```

#### 2.3.5 State management

- Dùng **TanStack Query (React Query)** cho server state (fetch, cache, refetch).
- Dùng React `useState` / `useReducer` cho UI state (filter selections, modal open/close,...).
- Filter state đồng bộ với URL query params bằng `useSearchParams`.

#### 2.3.6 Trang Danh sách Manga (`MangaListPage`)

Layout: Sidebar filter bên trái (240px) + content chính bên phải.

Sidebar filter:
- Multi-select checkboxes cho: Read Status, Tag, Demographic, Content Rating, Publication Status, Original Language.
- Range inputs cho Year (from/to).
- Slider cho Rating (min/max).
- Nút "Reset filters".

Header content:
- Input search title (debounce 300ms) + nút "Advanced Search" (mở panel nâng cao).
- Sort dropdown + Per-page select.
- Tổng số kết quả.

Advanced Search panel (slide down):
- Giống MangaDex: input Author, input Artist, tag picker (include tags / exclude tags với multi-select dropdown).

Grid: responsive, 2 cột (tablet) → 4-6 cột (desktop).

Mỗi **MangaCard** hiển thị:
- Cover image (aspect ratio 2:3)
- Title (truncate 2 dòng)
- Read Status badge (màu tương ứng: unread=gray, reading=cyan, completed=green, dropped=red)
- Rating badge (nếu có)
- 2-3 tag badges

Click card → navigate đến trang chi tiết.

Pagination: prev/next + chọn trang.

#### 2.3.7 Trang Chi tiết Manga (`MangaDetailPage`)

Layout: 2 cột (cover + metadata bên trái / content bên phải) trên desktop, 1 cột trên mobile.

**Cột trái** (~280px):
- Cover image (đầy đủ width)
- Nút thay đổi Read Status (dropdown)
- Rating input (số + slider)
- Nút "Refresh từ MangaDex" (disabled nếu không có mangadex_id)
- Nút "Tải chương" (disabled nếu không có mangadex_id) → mở dialog chọn path
- Nút "Chỉnh sửa metadata"

**Cột phải**:
- Title lớn (Spartan font)
- Alt titles (collapsible nếu nhiều)
- Metadata grid: Author, Artist, Status, Year, Demographic, Content Rating, Original Language
- Description (collapsible nếu dài)
- Tags (colored badges theo group: genre=purple, theme=cyan, format=blue, content=amber)
- Provider Links (danh sách + nút "Thêm provider")
- Divider
- **Review section**:
  - Tiêu đề "Reviews" + nút "+ New Review"
  - List ReviewBox components

**ReviewBox**:
- Header: tiêu đề (nếu có) + timestamp (relative: "2 ngày trước") + nút Edit + nút Delete
- Content: render Tiptap JSON thành HTML

**ReviewEditor Modal**:
- Input title (optional)
- Tiptap editor với toolbar: Bold, Italic, H1/H2/H3, Ordered List, Bullet List, Horizontal Rule
- Nút "Cleanup Tabs" (gọi API cleanup)
- Nút Save / Cancel

#### 2.3.8 Cover Image Fallback

Component `CoverImage.tsx`:

```typescript
// Priority: MinIO presigned URL → MangaDex CDN → placeholder
const [src, setSrc] = useState(
  manga.cover_minio_url || 
  buildMangaDexCoverUrl(manga.mangadex_id, manga.cover_mangadex_filename) ||
  '/placeholder-cover.svg'
)

const handleError = () => {
  if (currentFallback === 'minio' && manga.mangadex_id) {
    setSrc(buildMangaDexCoverUrl(...))
    setCurrentFallback('mangadex')
  } else {
    setSrc('/placeholder-cover.svg')
  }
}
```

MangaDex CDN URL: `https://uploads.mangadex.org/covers/{mangadex_id}/{filename}.512.jpg`

#### 2.3.9 Dark Mode

```typescript
// hooks/useTheme.ts
const useTheme = () => {
  const [theme, setTheme] = useState<'light'|'dark'>(
    () => localStorage.getItem('theme') as 'light'|'dark' || 'light'
  )
  
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  
  return { theme, toggle: () => setTheme(t => t === 'light' ? 'dark' : 'light') }
}
```

ThemeToggle button: dùng `SunIcon` / `MoonIcon` từ lucide-react.

#### 2.3.10 Chạy frontend

```bash
cd frontend
npm run dev   # chạy ở http://localhost:5173
```

---

### 2.4 Thứ tự build (cho AI Agent)

Thực hiện theo thứ tự sau để tránh dependency issues:

**Phase 1 — Backend foundation**
1. Khởi tạo uv project, cài dependencies
2. Viết `config.py`, `database/connection.py`, `database/indexes.py`
3. Viết tất cả Pydantic models (`models/`)
4. Viết `services/mangadex_service.py` (rate limiter + API calls)
5. Viết `services/minio_service.py`
6. Viết `utils/file_utils.py`
7. Test kết nối MongoDB và MinIO

**Phase 2 — Backend core routers**
8. Viết `services/manga_service.py` (CRUD logic đầy đủ)
9. Viết `routers/manga.py`
10. Viết `routers/mangadex.py`
11. Viết `routers/tags.py`
12. Viết `routers/reviews.py`
13. Viết `routers/analytics.py`
14. Viết `services/download_service.py` + `routers/downloads.py`
15. Viết `main.py`, test toàn bộ với Swagger UI

**Phase 3 — Frontend foundation**
16. Khởi tạo Vite + cài dependencies
17. Setup Tailwind + CSS variables + fonts
18. Viết UI components cơ bản (`ui/`)
19. Viết `api/client.ts` + tất cả api modules
20. Setup routing + Layout + Sidebar + Header với ThemeToggle

**Phase 4 — Frontend pages**
21. Viết `MangaListPage` (grid + filter + sort + pagination + search)
22. Viết `MangaDetailPage` (metadata + status + rating)
23. Viết Review components + ReviewEditor (Tiptap)
24. Viết Add Manga Dialog (3 luồng)
25. Viết `AnalyticsPage` (Recharts charts)
26. Viết `TagsPage`

**Phase 5 — Polish & edge cases**
27. Implement download dialog + progress polling
28. Implement cover refresh flow
29. Implement manual metadata edit form
30. Test dark mode thoroughly (mọi component)
31. Test toàn bộ luồng thêm manga (3 luồng)
32. Review cleanup feature
33. Audit log display trong history page

---

### 2.5 Lưu ý quan trọng cho AI Agent

1. **Bucket MinIO**: Tên là `manga-library`, KHÔNG phải `manga-media` (đã dùng cho project khác của người dùng).

2. **Cover storage**: Chỉ lưu object key (vd `covers/abc123.jpg`) trong DB, không lưu full URL. URL được resolve dynamically khi API trả về (presigned URL từ MinIO hoặc public URL nếu bucket public).

3. **Tab cleanup**: Trong review content, replace pattern `\t+` (một hoặc nhiều tab liên tiếp) giữa các từ thành một khoảng trắng đơn. Ví dụ: `"Change the world\t\t\t 7.5/10"` → `"Change the world 7.5/10"`.

4. **Manga.txt**: File này là ví dụ danh sách đọc thô của người dùng. Không cần import tự động — người dùng sẽ tự thêm từng bộ qua UI. Nhưng tham khảo format để hiểu context.

5. **MangaDex API authentication**: MangaDex public API không cần auth token cho read operations (search, get manga, get chapters). Chỉ cần respect rate limit.

6. **Tiptap JSON**: Khi lưu review content, lưu nguyên Tiptap editor state JSON vào MongoDB. Khi render, dùng `generateHTML()` từ `@tiptap/html` hoặc render qua Tiptap's `EditorContent` với `editable: false`.

7. **MongoDB `_id`**: Khi trả về từ API, convert `ObjectId` sang string. Frontend dùng string ID xuyên suốt.

8. **CORS**: Backend chỉ allow origin `http://localhost:5173` (Vite dev). Sau này deploy thì thêm domain production.

9. **Error handling**: Tất cả API calls trong frontend phải có loading state + error state + toast notification. Dùng TanStack Query `isLoading`, `isError`, `error` states.

10. **MangaDex chapter download path**: Khi người dùng chọn path để download, frontend gửi đường dẫn absolute path trên máy người dùng (input text tự nhập hoặc nếu browser hỗ trợ thì dùng File System Access API). Backend nhận path string và tải về đó. Path mặc định gợi ý: `./downloads/{manga_title_cleaned}/`.

11. **Provider links từ MangaDex**: Field `links` trong response MangaDex là object dạng `{"al": "12345", "mu": "https://...", "raw": "https://..."}`. Map sang readable names, một số value là ID (không phải URL) — xây dựng URL tương ứng hoặc để nguyên. Xem mapping đầy đủ tại https://api.mangadex.org/docs/3-enumerations/#manga-links-data.

12. **Custom tags**: Khi người dùng thêm custom tag mới trong form, tạo tag document trước, lấy `_id`, rồi gắn vào manga. Không hardcode tag ID.
