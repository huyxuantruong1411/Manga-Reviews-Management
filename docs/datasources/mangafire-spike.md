# MangaFire Technical Spike & Multi-Source Transport Decision Record

**Ngày thực hiện:** 12/10/2026  
**Môi trường thử nghiệm:** Windows 11, Python 3.12, Playwright Chromium headless, httpx 0.28  
**Baseline Git Commit:** `ac65c84`  
**Git Branch:** `feature/mangafire-multisource`  
**Tác phẩm khảo sát live:** Sheeply Horned Witch Romi (`https://mangafire.to/title/oj8n8-sheeply-horned-witch-romii`)

---

## 1. Mục tiêu Spike (PR00 Gate)

1. Kiểm chứng khả năng truy cập MangaFire bằng transport thực tế (Direct HTTP vs Browser Context).
2. Kiểm chứng việc resolve metadata tác phẩm, catalogue phân trang và page manifests của MangaFire.
3. Đối chiếu thực tế trường hợp mẫu Romi giữa MangaFire và MangaDex (đặc biệt là Chapter 14).
4. Ban hành Architecture Decision Record (ADR) cho Transport, Session lifecycle, Identity model, Media revision và Commit pipeline.

---

## 2. Kết quả Thử nghiệm Live (Empirical Findings)

### 2.1 Direct HTTP Transport vs SPA & Token Signature

| Phương thức | Kết quả | Nguyên nhân / Chi tiết |
|---|---|---|
| **Direct GET HTML** (`/title/oj8n8-...`) | 200 OK, 3.4 KB | Trả về SPA shell rỗng (`<div id="app-root"></div>`), script bundle `main-*.js` và Cloudflare challenge loader. Không chứa danh sách chapter trong HTML tĩnh. |
| **Direct GET Internal API** (`/api/titles/oj8n8`) | 403 Forbidden | `{"message":"Missing token."}`. API yêu cầu tham số chữ ký client `vrf=...`. |
| **Playwright Chromium (Headless Context)** | **200 OK đầy đủ** | Trình duyệt thực thi SPA bundle, tự động tính toán tham số `vrf` và gửi request API nội bộ thành công. |

### 2.2 Catalogue & Pagination Romi

Qua việc lắng nghe network trong Browser Context khi duyệt qua pagination (4 trang):

| Trang | Số releases ghi nhận | Dải chapter | Ghi chú |
|---|---|---|---|
| Page 1 | 20 | Ch. 31 đến Ch. 22 | Mỗi số chapter có 2 releases (`official` và `unofficial`) |
| Page 2 | 20 | Ch. 21 đến Ch. 12 | Có Ch. 14 (ID 4618281 và ID 7694003) |
| Page 3 | 20 | Ch. 11 đến Ch. 2 | |
| Page 4 | 2 | Ch. 1 | 2 releases của Ch. 1 |
| **Tổng cộng** | **62 releases** | **31 chapter numbers** (1 đến 31) | Khớp chính xác 100% với quan sát khảo sát ban đầu! |

*Lưu ý về DOM*: MangaFire có chèn overlay banner quảng cáo trên một số phần tử trang. Khi tương tác Playwright để chuyển trang, cần dùng `page.evaluate()` kích hoạt `.click()` trên `.npager__num` hoặc `click(force=True)` để không bị overlay chặn sự kiện.

### 2.3 Page Manifest & Image Downloading

Thử nghiệm trích xuất manifest và tải ảnh thực tế cho Chapter 14:

1. **Release 4618281** (`POCKET-SIZED SANADA`, unofficial):
   - Reader hiển thị: **6 ảnh**.
   - CDN host: `https://l1n.mfcdn1.xyz/mf/.../h/p.jpg`.
2. **Release 7694003** (`(1r0n)`, official):
   - Reader hiển thị: **6 ảnh**.
   - CDN host: `https://k99.mfcdn1.xyz/mf/.../h/p.jpg`.
3. **Thử nghiệm tải ảnh bằng HTTP Client (`httpx`)**:
   - Gửi GET với header `Referer: https://mangafire.to/`.
   - Kết quả: **HTTP 200 OK**, `Content-Type: image/jpeg`, kích thước **562,733 bytes**.
   - Pillow verification: `JPEG (1122, 1600)`. Ảnh hoàn toàn nguyên vẹn và hợp lệ.

### 2.4 Đối chiếu Thực tế với MangaDex (Cross-link & Chapter Mismatch)

- **MangaFire Work Romi**: Link tác phẩm tương ứng trên MangaDex có UUID `8627e210-25dc-4e9a-8531-142c917e4760`.
- **MangaDex Feed tiếng Anh thực tế**:
  - Tổng số chapter: **15 chapters** (từ Ch. 1 đến Ch. 15).
  - Chapter 14: Title `Rewrites`, `pages: 17`, UUID `01f03090-5a4d-47c2-a96a-a780266efb75`.
- **So sánh Chapter 14**:
  - MangaFire Ch. 14: Title `POCKET-SIZED SANADA`, **6 trang**.
  - MangaDex Ch. 14: Title `Rewrites`, **17 trang**.
- **Kết luận kiến trúc**: **BẮT BUỘC KHÔNG ĐƯỢC TỰ ĐỘNG GỘP (AUTO-MERGE) HAI CHAPTER CHỈ VÌ CÙNG SỐ 14.** Hệ thống phải coi đây là mapping chưa xác minh (`unverified_mapping`) và yêu cầu người dùng xác nhận hoặc tách biệt.

---

## 3. Architecture Decision Records (ADR)

### ADR-01: Kiến trúc Transport MangaFire
- **Quyết định**: Áp dụng mô hình **Hybrid Transport**:
  1. **Metadata & Catalogue / Manifest Resolution**: Sử dụng **Playwright Headless Browser Context** dùng riêng (isolated context), quản lý lifecycle chặt chẽ (đóng khi hoàn thành/idle), để website tự thực thi JavaScript sinh token `vrf`.
  2. **Image Media Fetching**: Sau khi đã trích xuất danh sách URL ảnh từ manifest, việc stream/download file ảnh do **HTTP Client backend (`httpx`)** đảm nhiệm với `Referer: https://mangafire.to/` và rate limiter/budget riêng.
- **Lý do**: Tận dụng triệt để Playwright sẵn có trong repository mà không cần cài đặt thêm JVM runtime hay extension bridge nặng nề; đồng thời không dùng browser để tải từng byte ảnh (gây tốn RAM và process không cần thiết).

### ADR-02: Phân tách Identity (Tác phẩm, Slot logic, Release đã lưu)
- **Quyết định**:
  - `mangas`: Đại diện cho tác phẩm trong thư viện người dùng.
  - `manga_sources`: Đại diện cho liên kết giữa Manga nội bộ với nguồn bên ngoài (`(source, source_work_id)`).
  - `chapter_slots`: Đại diện cho đơn vị chương logic (`manga_id, language, unit_kind, chapter_key`), giữ con trỏ `preferred_chapter_id`.
  - `chapters`: Đại diện cho một bản phát hành cụ thể đã lưu (Source-scoped release identity: `manga_id, source, source_work_id, source_id, language`). Giữ `_id` cũ tương thích backward.
- **Lý do**: Ngăn ngừa hoàn toàn tình trạng đè dữ liệu hoặc conflict ID giữa các nguồn khác nhau.

### ADR-03: Media Revision & Object Storage Key Format
- **Quyết định**:
  - Object key mới: `chapters/{manga_id}/{internal_chapter_id}/revisions/{media_revision_id}/{filename}`.
  - Giữ nguyên các object key cũ đã lưu trong `PageItem.object_key`.
  - Mỗi lần thay đổi trang hoặc tải lại bản phát hành khác, sinh `media_revision_id` mới bất biến.
- **Lý do**: Tránh ghi đè file S3/MinIO đang được reader hoặc worker OCR/Translation sử dụng; loại bỏ race conditions.

### ADR-04: Commit Pipeline (Staging -> Validate -> CAS Commit)
- **Quyết định**:
  - Tải ảnh vào staging -> Xác thực kích thước, MIME (Pillow), tính SHA-256 từng trang -> Upload S3 -> Atomic Compare-And-Swap (CAS) trên document MongoDB.
  - Reader chỉ đọc những chapter có trạng thái `ready` với manifest hoàn chỉnh.
- **Lý do**: Đảm bảo không bao giờ xuất hiện chapter bị thiếu trang hoặc ở trạng thái nửa vời khi gặp sự cố mạng/crash.

---

## 4. Trạng thái Quality Gates

- [x] Baseline backend tests: 179 passed, 1 skipped.
- [x] Baseline python lint & check: 0 errors.
- [x] Baseline frontend biome check: 0 errors.
- [x] Baseline frontend typecheck (`tsc -b`): 0 errors.
- [x] Baseline frontend build (`vite build`): 0 errors.
- [x] Documentation & route sync: 0 errors.
- [x] Live MangaFire access proof: Resolved work `oj8n8`, 62 releases / 31 chapters, Chapter 14 manifests (6 pages) và 562 KB JPEG download verification.
- [x] Live MangaDex Romi mismatch proof: 15 chapters feed, Chapter 14 has 17 pages vs 6 pages.
