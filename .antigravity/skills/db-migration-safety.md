# Database Migration & Index Safety Skill

## 1. Mục Đích & Nguyên Tắc An Toàn
Dự án sử dụng **MongoDB (Motor async)** làm cơ sở dữ liệu chính. Mọi thay đổi về cấu trúc document hoặc thêm trường mới phải đảm bảo:
- **Zero Downtime**: Không làm gián đoạn các truy vấn đang chạy hoặc gây lock bảng.
- **Idempotency**: Các thao tác migration phải an toàn để chạy lại nhiều lần mà không tạo trùng dữ liệu.
- **Bi-directional**: Luôn chuẩn bị kịch bản hoàn tác (Rollback/Down).

---

## 2. Quy Chuẩn Schema Migration (Up & Down)

Khi thêm trường mới hoặc thay đổi kiểu dữ liệu của collection, tạo script migration tương ứng theo mẫu:

```python
"""
Migration: YYYYMMDD_add_field_example.py
Mô tả: Bổ sung trường field_example và đánh index
"""
import logging
from backend.database.connection import get_db

logger = logging.getLogger(__name__)

async def upgrade():
    """Áp dụng thay đổi (UP)"""
    db = get_db()
    logger.info("Migrating UP: add field_example...")
    await db.mangas.update_many(
        {"field_example": {"$exists": False}},
        {"$set": {"field_example": "default_value"}}
    )
    # Đánh index nếu là trường hay query
    await db.mangas.create_index("field_example", sparse=True)

async def downgrade():
    """Hoàn tác thay đổi (DOWN / ROLLBACK)"""
    db = get_db()
    logger.info("Rolling back DOWN: remove field_example...")
    await db.mangas.drop_index("field_example_1")
    await db.mangas.update_many(
        {"field_example": {"$exists": True}},
        {"$unset": {"field_example": ""}}
    )
```

---

## 3. Quy Tắc Đánh Index (Index Enforcement)

Mọi collection khi được thiết kế hoặc bổ sung trường mới **BẮT BUỘC** phải rà soát và đánh index tại [`backend/database/indexes.py`](file:///d:/Projects/Manga/Manga-Reviews-Management/backend/database/indexes.py):

### A. Khóa Ngoại & Quan Hệ (Foreign Keys / References)
Các trường liên kết giữa các collections phải luôn có index để tránh `COLLSCAN` (quét toàn bộ bảng):
- `manga_id` (trong `reviews`, `chapters`, `cover_arts`, `manga_recommendations`, `reading_progress`).
- `user_id` / `actor` (trong `audit_logs`).
- `mangadex_id` (trong `mangas`, `creators`, `tags` - sử dụng `sparse=True`).

### B. Trường Lọc & Sắp Xếp Thường Xuyên (Sort & Filter Keys)
- `created_at`, `added_at`, `timestamp` (phục vụ phân trang và timeline: compound index `[("entity_id", 1), ("timestamp", -1)]`).
- `read_status`, `tag_ids` (phục vụ lọc đa tiêu chí tại MangaListPage và Analytics).

### C. Sử Dụng Cờ Index Hợp Lý
- `sparse=True`: Cho các trường có thể null hoặc không xuất hiện ở mọi document.
- `unique=True`: Cho các trường định danh duy nhất (ví dụ: `reading_progress.manga_id`).
