# Hợp Đồng Dữ Liệu Manga Reader v2.0 (Data Contract v2.0)

> **Phạm vi**: Giao tiếp chuẩn giữa **Manga Data Lake & Storage Pool** (hệ thống nguồn) và **Hệ thống đọc truyện (Manga Reader Application)** (hệ thống đích).  
> **Phiên bản Hợp đồng**: `2.0`  
> **Chuẩn Schema**: JSON Schema Draft 2020-12 (`https://json-schema.org/draft/2020-12/schema`)  
> **API Export Mẫu**: `GET /api/datalake-pool/contract/template`

---

## 1. Mục Đích & Nguyên Tắc Thiết Kế

Khi đóng gói dữ liệu từ Data Lake Pool chuyển giao sang hệ thống đọc truyện, hợp đồng v2.0 đảm bảo:

1. **Khép kín & Nhất quán**: Mỗi gói export (`ReaderPackage`) chứa trọn vẹn thông tin một bộ manga và toàn bộ các chương/trang hợp lệ để ứng dụng đọc truyện có thể hydrate trực tiếp vào cơ sở dữ liệu quan hệ (PostgreSQL / MySQL) mà không cần gọi ngược lại hệ thống review.
2. **Loại bỏ hoàn toàn trường nội bộ / editor**:
   - `_id`: ID nội bộ BSON của MongoDB nguồn không rò rỉ sang reader; sử dụng `pool_manga_id` (`pm_...`) và `pool_chapter_id` (`pch_...`) làm khoá chính ổn định.
   - Presigned `url`: Link ký tạm thời có thời hạn (TTL) không bao giờ được lưu vào cơ sở dữ liệu reader. Hợp đồng chỉ chuyển giao con trỏ đối tượng (`bucket`, `object_key`) theo cơ chế **Zero-Copy**. Reader cấu hình CDN hoặc S3 Reverse Proxy để phân phối ảnh.
   - Cờ quản trị: Các cờ như `included`, `duplicate_of_page_number`, `pool_state`, `is_etl_ready` đã được lọc ở tầng service nguồn. Chỉ các chương và trang có `included=True` mới được đóng gói, số thứ tự trang (`page_number`) được đánh số liên tục `1..N`.
3. **Chuẩn hoá Enums cho RDBMS**: Các trường `status`, `content_rating`, `publication_demographic` được chuẩn hoá thành tập giá trị cố định, tương thích với kiểu `ENUM` hoặc `CHECK` constraint của PostgreSQL và MySQL.
4. **Hỗ trợ Upsert / Đồng bộ tăng dần**: Trường `lineage.pool_revision` và `manifest_sha256` cho phép phía reader kiểm tra nhanh xem bản ghi có thay đổi hay không trước khi thực hiện ghi đè nặng.

---

## 2. Từ Điển Dữ Liệu (Data Dictionary)

### 2.1. Cấu trúc cấp cao: `ReaderPackage`

| Trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa / Ghi chú |
|---|---|:---:|---|
| `contract_name` | String (`"manga-reader-package"`) | Có | Tên hợp đồng định danh |
| `contract_version` | String (`"2.0"`) | Có | Phiên bản hợp đồng |
| `exported_at` | ISO 8601 Datetime (UTC) | Có | Thời điểm trích xuất gói dữ liệu |
| `manga` | Object (`ReaderManga`) | Có | Toàn bộ metadata bộ truyện |
| `chapters` | Array of `ReaderChapter` | Có | Danh sách chương đọc được (đã sort theo `chapter_numeric ASC, language ASC`) |

---

### 2.2. Metadata Bộ Truyện: `ReaderManga`

| Trường | Kiểu dữ liệu | Bắt buộc | SQL Mapping (PostgreSQL / MySQL) | Mô tả & Quy tắc |
|---|---|:---:|---|---|
| `pool_manga_id` | String | Có | `VARCHAR(64) PRIMARY KEY` | Khóa chính cố định (vd: `pm_1a2b3c4d5e6f`) |
| `slug` | String | Có | `VARCHAR(255) NOT NULL UNIQUE` | Đường dẫn tĩnh thân thiện SEO (vd: `one-piece`) |
| `source_manga_id` | String | Có | `VARCHAR(64) NOT NULL` | Mã định danh gốc trong hệ thống review (truy vết) |
| `mangadex_id` | UUID / String | Không | `UUID NULL` / `CHAR(36) NULL` | Mã MangaDex nếu có |
| `title` | String | Có | `VARCHAR(500) NOT NULL` | Tiêu đề chính hiển thị của truyện |
| `alt_titles` | Array of String | Có | `JSONB` / `JSON NOT NULL` | Các tên gọi khác (tiếng Nhật, tiếng Việt, v.v.) |
| `description` | String | Có | `TEXT NOT NULL DEFAULT ''` | Tóm tắt nội dung truyện |
| `status` | Enum (String) | Có | `ENUM('ongoing', 'completed', 'hiatus', 'cancelled', 'unknown')` | Tình trạng xuất bản gốc |
| `content_rating` | Enum (String) | Có | `ENUM('safe', 'suggestive', 'erotica', 'pornographic', 'unknown')` | Độ tuổi phân loại nội dung |
| `publication_demographic` | Enum (String) | Có | `ENUM('shounen', 'shoujo', 'seinen', 'josei', 'kodomo', 'unknown')` | Đối tượng độc giả mục tiêu |
| `original_language` | String | Không | `VARCHAR(10) NULL` | Mã ngôn ngữ gốc ISO 639-1 (vd: `ja`, `ko`, `zh`) |
| `year` | Integer | Không | `SMALLINT NULL` | Năm phát hành đầu tiên (1800 - 2200) |
| `published_start_date` | String | Không | `VARCHAR(50) NULL` | Ngày bắt đầu phát hành |
| `published_end_date` | String | Không | `VARCHAR(50) NULL` | Ngày kết thúc phát hành |
| `official_volumes` | Integer | Không | `INT NULL` | Tổng số tập chính thức (theo nguồn xuất bản) |
| `official_chapters` | Integer | Không | `INT NULL` | Tổng số chương chính thức (theo nguồn xuất bản) |
| `creators` | Array of Object | Có | Bảng `creators` & `manga_creators` | Tác giả (`author`) và Họa sĩ (`artist`) |
| `tags` | Array of Object | Có | Bảng `tags` & `manga_tags` | Thể loại và nhãn phân loại |
| `links` | Array of Object | Có | Bảng `manga_links` | Liên kết ngoài (MangaDex, trang chủ, MAL, v.v.) |
| `primary_cover` | Object (`ReaderMediaRef`) | Không | Cột `cover_bucket`, `cover_object_key`, ... | Ảnh bìa đại diện chính |
| `cover_arts` | Array of Object | Có | Bảng `cover_arts` | Danh sách bìa phụ theo tập |
| `stats` | Object | Có | Cột thống kê hoặc JSON | Số chương (`chapter_count`), số trang (`page_count`), tổng dung lượng byte (`total_size_bytes`), danh sách ngôn ngữ |
| `lineage` | Object | Có | Cột kiểm tra phiên bản | `pool_revision`, `source_metadata_revision`, `manifest_sha256`, `published_at`, `updated_at` |

---

### 2.2b. Tác Giả & Họa Sĩ: `ReaderCreator` (Định danh bằng UUID chống trùng tên)

| Trường | Kiểu dữ liệu | Bắt buộc | SQL Mapping (PostgreSQL / MySQL) | Mô tả & Quy tắc |
|---|---|:---:|---|---|
| `creator_id` | String (UUID) | Có | `VARCHAR(64) PRIMARY KEY` | Khóa chính định danh tác giả/họa sĩ (dùng MangaDex Author UUID nếu có, hoặc UUIDv5 chuẩn hoá). Đảm bảo phân biệt 2 tác giả trùng tên (`name` giống nhau nhưng `creator_id` khác nhau). |
| `slug` | String | Có | `VARCHAR(255) NOT NULL` | Slug thân thiện URL (vd: `nakamura-moto`) phục vụ route `/author/{creator_id}/{slug}` |
| `name` | String | Có | `VARCHAR(255) NOT NULL` | Tên hiển thị của tác giả/họa sĩ (không đặt UNIQUE để cho phép trùng tên) |
| `role` | Enum (`"author"` \| `"artist"`) | Có | `ENUM('author', 'artist')` | Vai trò trong bộ truyện (một người kiêm cả 2 vai trò sẽ xuất hiện 2 phần tử với `role` tương ứng) |
| `mangadex_id` | UUID / String | Không | `UUID NULL` / `CHAR(36) NULL` | Mã UUID gốc trên MangaDex |
| `biography` | Object `{lang: text}` | Có | `JSONB` / `JSON NOT NULL` | Tiểu sử đa ngôn ngữ (`en`, `ja`, `vi`, ...) |
| `links` | Object `{platform: url}` | Có | `JSONB` / `JSON NOT NULL` | Liên kết mạng xã hội (`twitter`, `pixiv`, `youtube`, `website`, ...) |

---

### 2.3. Con Trỏ Đối Tượng Media: `ReaderMediaRef` (Zero-Copy)

| Trường | Kiểu dữ liệu | Bắt buộc | SQL Mapping | Mô tả |
|---|---|:---:|---|---|
| `bucket` | String | Có | `VARCHAR(63) NOT NULL` | Tên bucket MinIO/S3 (vd: `manga-library`) |
| `object_key` | String | Có | `TEXT NOT NULL` | Đường dẫn vật lý trên kho lưu trữ (vd: `chapters/one_piece/ch1/001.webp`) |
| `content_type` | String | Không | `VARCHAR(100) NULL` | MIME type (vd: `image/webp`, `image/jpeg`) |
| `width` | Integer | Không | `INT NULL` | Chiều rộng ảnh (pixels) |
| `height` | Integer | Không | `INT NULL` | Chiều cao ảnh (pixels) |
| `file_size` | Integer | Có | `BIGINT NOT NULL DEFAULT 0` | Dung lượng tệp tính theo bytes |
| `md5_hash` | String | Không | `VARCHAR(64) NULL` | Mã băm MD5 hỗ trợ dedup |
| `sha256` | String | Không | `VARCHAR(64) NULL` | Mã băm SHA-256 xác thực toàn vẹn |

---

### 2.4. Danh Sách Chương: `ReaderChapter`

| Trường | Kiểu dữ liệu | Bắt buộc | SQL Mapping | Mô tả |
|---|---|:---:|---|---|
| `pool_chapter_id` | String | Có | `VARCHAR(64) PRIMARY KEY` | Khóa chính chương (vd: `pch_0a1b2c3d4e5f`) |
| `pool_manga_id` | String | Có | `VARCHAR(64) NOT NULL FK` | Khóa ngoại liên kết tới `mangas.pool_manga_id` |
| `source_chapter_id` | String | Có | `VARCHAR(64) NOT NULL` | ID chương gốc trong review system |
| `chapter_number` | String | Có | `VARCHAR(50) NOT NULL` | Số chương hiển thị (vd: `"1"`, `"10.5"`, `"Extra"`) |
| `chapter_numeric` | Float | Có | `DOUBLE PRECISION NOT NULL` | Điểm số thực dùng để `ORDER BY chapter_numeric ASC` |
| `volume` | String | Không | `VARCHAR(20) NULL` | Tập truyện (nếu có, vd: `"1"`) |
| `title` | String | Có | `VARCHAR(500) NOT NULL` | Tiêu đề riêng của chương |
| `language` | String | Có | `VARCHAR(10) NOT NULL` | Ngôn ngữ dịch (vd: `en`, `vi`) |
| `scanlation_group` | String | Không | `VARCHAR(255) NULL` | Tên nhóm dịch |
| `publish_at` | Datetime (ISO 8601) | Không | `TIMESTAMPTZ NULL` | Thời điểm phát hành chương |
| `source` | String | Có | `VARCHAR(50) NOT NULL` | Nguồn lấy dữ liệu (vd: `mangadex`, `local_import`) |
| `source_id` | String | Không | `VARCHAR(255) NULL` | ID tại nguồn |
| `page_count` | Integer | Có | `INT NOT NULL` | Tổng số trang trong chương |
| `total_size_bytes` | Integer | Có | `BIGINT NOT NULL` | Dung lượng tính bằng bytes |
| `pages_revision` | Integer | Có | `INT NOT NULL` | Phiên bản trang truyện của chương |
| `manifest_sha256` | String | Có | `CHAR(64) NOT NULL` | Checksum kiểm tra toàn vẹn nội dung chương |
| `pages` | Array of `ReaderPage` | Có | Bảng `chapter_pages` | Danh sách trang truyện đã đánh số liên tục `1..N` |

---

### 2.5. Trang Truyện: `ReaderPage`

| Trường | Kiểu dữ liệu | Bắt buộc | SQL Mapping | Mô tả |
|---|---|:---:|---|---|
| `page_uid` | String | Có | `VARCHAR(64) PRIMARY KEY` | Khóa chính định danh trang |
| `page_number` | Integer | Có | `INT NOT NULL` | Thứ tự đọc trong chương: bắt đầu từ `1`, liên tục `1..N` |
| `filename` | String | Có | `VARCHAR(255) NOT NULL` | Tên tệp ảnh (vd: `001.webp`) |
| `media` | Object (`ReaderMediaRef`)| Có | Các cột trong bảng `chapter_pages` | Con trỏ ảnh MinIO (`bucket`, `object_key`, kích thước, hash) |

---

## 3. Bảng Chuẩn Hoá & Ánh Xạ Enums

Để đảm bảo không bị lỗi dữ liệu khi nhập vào RDBMS, service nguồn đã tự động chuẩn hoá các giá trị tự do về danh mục chuẩn sau:

### 3.1. Publication Status (`status`)
| Dữ liệu đầu vào nguồn | Chuẩn hoá hợp đồng v2 |
|---|---|
| `ongoing`, `publishing`, `releasing`, `serializing`, `in progress` | `ongoing` |
| `completed`, `complete`, `finished`, `ended` | `completed` |
| `hiatus`, `on hiatus`, `paused`, `on hold` | `hiatus` |
| `cancelled`, `canceled`, `discontinued`, `dropped` | `cancelled` |
| Giá trị khác hoặc `null` | `unknown` |

### 3.2. Content Rating (`content_rating`)
| Dữ liệu đầu vào nguồn | Chuẩn hoá hợp đồng v2 |
|---|---|
| `safe` | `safe` |
| `suggestive` | `suggestive` |
| `erotica` | `erotica` |
| `pornographic`, `hentai` | `pornographic` |
| Giá trị khác hoặc `null` | `unknown` *(Ứng dụng đọc truyện cần mặc định kiểm duyệt nếu là unknown)* |

### 3.3. Publication Demographic (`publication_demographic`)
| Dữ liệu đầu vào nguồn | Chuẩn hoá hợp đồng v2 |
|---|---|
| `shounen`, `shonen` | `shounen` |
| `shoujo`, `shojo` | `shoujo` |
| `seinen` | `seinen` |
| `josei` | `josei` |
| `kodomo`, `kodomomuke` | `kodomo` |
| Giá trị khác hoặc `null` | `unknown` |

---

## 4. Các File DDL Đi Kèm

- **PostgreSQL**: [`docs/contracts/schema-postgresql.sql`](schema-postgresql.sql)
- **MySQL 8.0+**: [`docs/contracts/schema-mysql.sql`](schema-mysql.sql)

Cả hai schema đều đã thiết kế sẵn các chỉ mục (indexes) tối ưu cho các truy vấn đọc truyện:
- Trang chủ / Danh sách: `(status, content_rating, updated_at DESC)`
- Tìm theo đường dẫn slug: `UNIQUE INDEX (slug)`
- Mục lục chương truyện: `INDEX (manga_id, chapter_numeric ASC, language)`
- Trình đọc (Reader): `INDEX (chapter_id, page_number ASC)`
- Lọc theo thể loại: `INDEX (tag_id, manga_id)`

---

## 5. Chiến Lược Phục Vụ Ảnh (Zero-Copy CDN / Reverse Proxy)

Phía ứng dụng đọc truyện nhận được con trỏ `media.bucket` và `media.object_key`. Để hiển thị ảnh tới người dùng cuối:

1. **Cách 1 (Khuyên dùng - NGINX / Cloudflare CDN Cache)**:
   - Cấu hình NGINX làm reverse proxy trỏ về MinIO endpoint:
   ```nginx
   location /media/ {
       proxy_pass http://minio:9000/manga-library/;
       proxy_cache manga_images_cache;
       proxy_cache_valid 200 30d;
       add_header X-Cache-Status $upstream_cache_status;
   }
   ```
   - Trình đọc frontend chỉ cần load ảnh: `https://reader.example.com/media/{object_key}`.

2. **Cách 2 (S3 Client Presign URL theo phiên)**:
   - Backend hệ thống đọc truyện khởi tạo MinIO/S3 Client.
   - Khi user mở đọc chương `GET /chapters/{id}`, backend sinh URL presigned động 15-30 phút cho mảng trang và trả về frontend.

---

## 6. Hướng Dẫn Tải & Kiểm Tra Hợp Đồng

- **Trực tiếp qua API**:
  ```bash
  curl -O -J http://localhost:8000/api/datalake-pool/contract/template
  ```
- **Trên Giao Diện**:
  - Truy cập trang **Manga Data Lake & Storage Pool** (`/datalake-pool`).
  - Nhấp vào nút **"Mẫu Hợp Đồng v2"** ở góc trên bên phải để xem trực tiếp JSON Schema, tải file `.schema.json` hoặc xem ví dụ thực tế.
