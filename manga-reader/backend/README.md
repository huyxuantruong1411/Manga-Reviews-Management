# Manga Reader System v2.0 (Standalone Platform)

Hệ thống Đọc Truyện Tranh (**Manga Reader System v2.0**) độc lập nằm trong thư mục `manga-reader/`, được thiết kế để nhận các gói dữ liệu chuẩn **`manga-reader-package` v2.0** từ hệ thống **Manga Data Lake & Storage Pool** (`/api/datalake-pool`) của hệ thống quản lý & đánh giá manga.

---

## 1. Kiến trúc Hạ tầng & Phân bổ Cổng (Zero Port Collision)

Toàn bộ dịch vụ của `manga-reader` sử dụng dải cổng riêng biệt (`15432`, `16379`, `18000`, `19000`, `19001`) để không xung đột với hệ thống Review hiện hành (`5432`, `6379`, `8000`, `9000`, `9001`, `27017`):

| Thành phần | Container Name | Cổng Host (`127.0.0.1`) | Lưu trữ Bền vững trên Ổ D (Bind Mount) |
| :--- | :--- | :--- | :--- |
| **FastAPI Reader API** | `mr_api` (hoặc chạy local) | `18000` | `d:\Projects\Manga\Manga-Reviews-Management\manga-reader\` |
| **PostgreSQL 16** (`pg_trgm`, `unaccent`) | `mr_postgres` | `15432` | `d:\Projects\Manga\Manga-Reviews-Management\manga-reader\postgres_data` |
| **Redis 7** (`appendonly yes`) | `mr_redis` | `16379` | `d:\Projects\Manga\Manga-Reviews-Management\manga-reader\redis_data` |
| **MinIO S3 Storage** | `mr_minio` | `19000` (S3) / `19001` (Console) | `d:\Projects\Manga\Manga-Reviews-Management\manga-reader\minio_data` |

> **Cam kết An toàn Ổ Đĩa**: Tuyệt đối không sử dụng Docker Named Volumes trên ổ C. Mọi dữ liệu phát sinh của PostgreSQL, Redis và MinIO đều được bind-mount trực tiếp vào ổ D bên trong `manga-reader/`.

---

## 2. Cấu trúc 8 Phân hệ Nghiệp vụ (39 Use Cases)

- **Module 1 (`app/modules/mod1_reader_activity`)**: Quản trị người dùng, khóa/mở khóa tài khoản (chống khóa chéo Admin, quy tắc 7 ngày + `force_override`, thu hồi phiên JWT tức thời qua Redis `token_version`), nhật ký hoạt động bất biến, thống kê xu hướng đọc và xử lý báo cáo đa đích (`account`, `manga`, `comment`).
- **Module 2 (`app/modules/mod2_manga_management`)**: Tích hợp **Manga Data Lake & Storage Pool**, kiểm định JSON Schema `manga-reader-contract v2.0`, nạp gói dữ liệu Idempotent (Upsert `mangas`, `chapters`, `chapter_pages`, `creators`, `tags` theo `pool_revision` & `manifest_sha256`), đồng bộ chương mới qua CDC Webhook, ẩn/hiện truyện, xóa truyện an toàn (kiểm tra khóa `is_syncing`).
- **Module 3 (`app/modules/mod3_manga_discovery`)**: Danh mục phân trang cố định `24 truyện/trang`, bộ lọc tổ hợp (`AND`/`OR`, loại trừ tag), tìm kiếm tiếng Việt không dấu & chịu lỗi chính tả (`unaccent` + `pg_trgm`), trang chi tiết tác giả/họa sĩ, và **3 Mô hình Gợi ý Truyện độc lập**:
  1. **Content-Based Filtering** (Cosine Similarity trên vector đặc trưng Tag/Creator + fallback theo thể loại).
  2. **Item-Based Collaborative Filtering** (Adjusted Cosine Similarity trên ma trận tương tác $R_{u,i}$ + fallback Cold-Start).
  3. **User-Based Collaborative Filtering** (K-NN người dùng tương đồng, tự động loại trừ các truyện đã `completed` hoặc `dropped`).
- **Module 4 (`app/modules/mod4_manga_reader`)**: Danh sách chương, bộ lọc số chương thập phân (`10.5`), trình đọc Zero-Copy từ MinIO, điều hướng **Đọc tiếp thông minh** (`continue-reading`), bộ lọc chống spam F5 khi tính lượt xem (`acquire_view_count_slot`), chấm điểm `1..10` (bắt buộc đã đọc ít nhất 1 chương) kèm lịch sử thay đổi điểm số.
- **Module 5 (`app/modules/mod5_comments`)**: Bình luận theo truyện/chương, cơ chế khóa nhãn **Spoiler 2 cấp độ** (`is_spoiler` + `spoiler_locked_by_admin`), lịch sử chỉnh sửa bình luận (`comment_edit_histories`), xóa mềm giữ nguyên nhánh phản hồi, và nút Like/Dislike loại trừ tương hỗ.
- **Module 6 (`app/modules/mod6_user_profile`)**: Đăng ký, xác thực OTP Email (`120 giây`, hiệu lực 1 lần), đăng nhập Argon2id + chống vét cạn mật khẩu, cập nhật hồ sơ (chuyển đổi ảnh đại diện sang WebP <= 2MB, chống giả mạo Admin/System).
- **Module 7 (`app/modules/mod7_reading_lists`)**: Quản lý danh sách đọc cá nhân riêng tư (`403 Forbidden` với người dùng khác) và tính năng **Gộp danh sách & Khử trùng lặp tự động** (`DISTINCT manga_id`, cảnh báo xác nhận khi các danh sách nguồn đều trống).
- **Module 8 (`app/modules/mod8_list_items`)**: Tìm kiếm/lọc cục bộ trong danh sách, thêm nhanh 1 truyện vào nhiều danh sách (kèm tạo danh sách mới tại chỗ), và thống kê phân tích dữ liệu danh sách (phân bố thể loại, trạng thái phát hành, top tác giả).

---

## 3. Cấu trúc Subsystems trong `manga-reader/`

- **`manga-reader/backend/`**: Standalone FastAPI API (cổng `18000`), PostgreSQL 16 + Alembic migrations, Redis 7, MinIO S3 (`19000`/`19001`).
- **`manga-reader/web/`**: Standalone Reader & Admin Web Frontend (React 19 + TypeScript + Vite + Tailwind CSS + Motion UI, cổng `15173`).
- **`manga-reader/MangaReader-Android/`**: Native Java Android Client kết nối trực tiếp Backend API.

---

## 4. Hướng dẫn Khởi chạy & Kiểm thử

```bash
# 1. Kiểm tra cổng, dung lượng ổ D và khởi chạy hạ tầng Docker (Postgres 16, Redis 7, MinIO)
uv run --project manga-reader/backend python manga-reader/backend/scripts/preflight_check.py
docker compose -f manga-reader/docker-compose.yml up -d
uv run --project manga-reader/backend python manga-reader/backend/scripts/verify_infra.py

# 2. Chạy migrations cơ sở dữ liệu Alembic (25 bảng + 12 kiểu ENUM)
uv run --directory manga-reader/backend alembic upgrade head

# 3. Nạp tài khoản demo & gói dữ liệu mẫu Data Contract v2.0
uv run --directory manga-reader/backend python scripts/seed_demo_accounts.py
uv run --project manga-reader/backend python manga-reader/backend/scripts/seed_sample_package.py

# 4. Chạy toàn bộ bộ kiểm thử tự động (Pytest)
uv run --directory manga-reader/backend pytest -v

# 5. Khởi chạy máy chủ API (18000) & Web Frontend (15173)
uv run --directory manga-reader/backend uvicorn app.main:app --host 127.0.0.1 --port 18000 --reload
pnpm --dir manga-reader/web dev
```
