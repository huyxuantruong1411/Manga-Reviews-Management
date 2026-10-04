# System Architecture & Technical Flow

> **Source Reference**: [`docs/ai-context.md`](./ai-context.md)  
> **Source Commit Verified**: `c4a6dfb29309b0b0afd5343aa7c5327d31b252ad`

---

## 1. System Topology & Component Interactions

The system follows a modular architecture separating presentation (React 19 SPA), application coordination (FastAPI), persistent datastores (MongoDB & MinIO S3), caching and asynchronous processing (Redis & ARQ), and external integrations:

```mermaid
flowchart TD
    UI["Frontend (React 19 + TypeScript + Tailwind v4)"] -->|REST API & SSE| API["Backend API (FastAPI)"]
    API --> DB[("MongoDB (6.0+ Standalone)\nMetadata, Panels, Reviews & Translation")]
    API --> S3[("MinIO S3 (manga-library)\nPages, Covers & Translation Artifacts")]
    UI -->|Direct Presigned URLs| S3
    
    API -->|Cache Read/Write| Redis[("Redis (Alpine)\nCache & Job Queues")]
    API -->|Enqueue OCR Job| Redis
    API -->|Enqueue Translation Job| Redis
    Redis -->|arq:queue| Worker["ARQ Worker (WorkerSettings)\nprocess_manga_panel_ocr"]
    Redis -->|arq:translation| TransWorker["Translation ARQ Worker\nexecute_translation_job_page"]
    Worker -->|OCR Results| DB
    Worker -->|Read Page Media| S3
    TransWorker -->|JSONL Envelope| Subproc["Isolated Translator Runtime\n(services/translator-runtime)"]
    Subproc -->|Output Manifest| TransWorker
    TransWorker -->|Save Results & Bindings| DB
    TransWorker -->|Upload Translated/Clean Pages| S3

    API -->|In-Process Scan (asyncio)| Scanner["PanelScannerService\n(OpenCV + RapidOCR + spaCy)"]
    Scanner -->|Read Page Images| S3
    Scanner -->|Write Extracted Panels| DB
    
    API -->|Sync & Metadata| DexAPI["External MangaDex APIv5"]
    API -->|Assistance & Scene Analysis| GeminiAPI["Google Gemini API"]
```

### Architectural Responsibilities:
- **FastAPI Layer** ([`backend/main.py`](../backend/main.py)): Exposes REST endpoints, validates input payloads via Pydantic v2, and manages connection pools in its lifespan context.
- **In-Process Scanner** ([`backend/services/panel_scanner_service.py`](../backend/services/panel_scanner_service.py)): Manages interactive page slicing and dialogue extraction using `asyncio.create_task`, streaming realtime progress to the frontend via Server-Sent Events (SSE).
- **Background Worker (OCR)** ([`backend/tasks/worker.py`](../backend/tasks/worker.py)): Separate worker process running ARQ to execute heavy computer vision tasks asynchronously off the HTTP loop.
- **Translation Worker** ([`backend/tasks/translation_worker.py`](../backend/tasks/translation_worker.py)): ARQ worker for `arq:translation` queue, claims page slots with fencing tokens, and manages isolated subprocess lifecycle.
- **Subprocess Translator Runtime** ([`services/translator-runtime/`](../services/translator-runtime/)): Isolated execution plane exchanging JSONL envelopes to avoid loading heavy ML dependencies inside FastAPI.
- **Cache Layer** ([`backend/core/redis.py`](../backend/core/redis.py)): Thread-safe Redis connection pool with automatic fallback to database reads if Redis is offline.

---

## 2. Asynchronous Processing Mechanisms

The codebase contains **three distinct** asynchronous mechanisms designed for different operational modes:

### Mechanism A: In-Process Manga Scanner (Interactive UI Flow)
Used by the frontend [`frontend/src/pages/PanelWordsDetectorPage.tsx`](../frontend/src/pages/PanelWordsDetectorPage.tsx) to scan manga chapters with real-time feedback:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Frontend Scan UI
    participant API as FastAPI Vision Router
    participant Scanner as PanelScannerService
    participant S3 as MinIO S3
    participant DB as MongoDB

    UI->>API: POST /api/vision/scan/manga/{id}
    API->>Scanner: trigger_scan(manga_id)
    Scanner-->>API: Task scheduled via asyncio.create_task
    API-->>UI: 200 OK (Scan triggered)
    
    UI->>API: GET /api/vision/scan-progress (SSE stream)
    loop Every Page Processed
        Scanner->>S3: Read raw page image bytes
        Scanner->>Scanner: RapidOCR page detection -> BBox contouring -> MangaOCR cleaning -> spaCy lemmas
        Scanner->>DB: Bulk insert/update manga_panels
        Scanner-->>UI: Yield progress event (current, total, status)
    end
    Scanner-->>UI: Yield terminal state (completed / error)
```

### Mechanism B: Distributed ARQ Task Worker (Background Queue Flow)
Used for queue-based task offloading and external API clients:

```mermaid
sequenceDiagram
    autonumber
    participant Client as API Client
    participant API as FastAPI Tasks Router
    participant Redis as Redis Queue
    participant Worker as ARQ Worker Process
    participant Storage as MinIO / Local FS
    participant DB as MongoDB

    Client->>API: POST /tasks/ocr (panel_id, image_path, language)
    API->>Redis: enqueue_job('process_manga_panel_ocr', ...)
    alt Redis Connected
        API-->>Client: 202 Accepted (task_id, status: queued)
    else Redis Offline
        API-->>Client: 503 Service Unavailable (Task queue offline)
    end

    Worker->>Redis: Poll and claim job
    Worker->>Storage: Retrieve image bytes
    Worker->>Worker: RapidOCR text detection & cleaning
    Worker->>DB: Update panel text & metadata
    Worker->>Redis: Store completed result (TTL: 86400s)

    Client->>API: GET /tasks/{task_id}
    API->>Redis: Retrieve cached status or query job
    API-->>Client: 200 OK (status: completed, result: {...})
```

### Mechanism C: Isolated Translation Subprocess Envelope (Translation ARQ Worker Flow)
Used for deep-learning translation, OCR, inpainting, and rendering without polluting the FastAPI runtime dependencies:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Reader / Studio UI
    participant API as FastAPI Translation Router
    participant Redis as Redis Queue
    participant Worker as Translation ARQ Worker
    participant Runtime as Isolated Subprocess Runner
    participant Storage as MinIO S3 (manga-library)
    participant DB as MongoDB

    UI->>API: POST /api/translation/jobs (manga_id, chapter_id, pages, profile)
    API->>DB: Create translation_job (status: pending)
    API->>Redis: enqueue_job('process_translation_job', job_id)
    API-->>UI: 202 Accepted (job_id, status: pending)

    Worker->>Redis: Claim translation job
    Worker->>DB: Set job status to running
    loop For each page in chapter
        Worker->>Storage: Fetch source page image
        Worker->>Runtime: Exec subprocess CLI stdin (JSON envelope)
        Runtime->>Runtime: Isolated provider translation / OCR / inpainting
        Runtime-->>Worker: Stdout JSON response envelope
        Worker->>Storage: Upload rendered page, mask, and translation JSON
        Worker->>DB: Upsert translation_page_bindings & record audit log
    end
    Worker->>DB: Set job status to completed
    Worker->>Redis: Cache job progress / status
    UI->>API: GET /api/translation/jobs/{job_id}
    API-->>UI: 200 OK (status: completed, pages: [...])
```

---

## 3. Data Relationships (Logical Reference Model)

Relationships in MongoDB are maintained at the application layer using standard string/ObjectId references:

```mermaid
erDiagram
    mangas ||--o{ chapters : "contains (manga_id)"
    mangas ||--o{ reviews : "reviewed_by (manga_id)"
    mangas ||--o{ reading_progress : "tracked_for (manga_id)"
    chapters ||--o{ manga_panels : "yields (chapter_id)"
    chapters ||--o{ translation_jobs : "translates (chapter_id)"
    chapters ||--o{ translation_page_bindings : "binds (chapter_id)"
    translation_jobs ||--o{ translation_page_bindings : "produces (job_id)"
    
    mangas {
        string _id PK
        string title
        string mangadex_id
        string read_status
        array tag_ids
        float personal_rating
        datetime added_at
    }

    chapters {
        string _id PK
        string manga_id FK
        float chapter_number
        string volume
        int page_count
        string storage_status
    }

    manga_panels {
        string _id PK
        string manga_id FK
        string chapter_id FK
        int page_number
        int panel_index
        string page_minio_key
        array bounding_box
        string text_raw
        string text_cleaned
        array dialogue_tokens
        array lemmas
    }

    reviews {
        string _id PK
        string manga_id FK
        json content_json
        float score
        datetime created_at
        datetime updated_at
    }

    translation_jobs {
        string _id PK
        string manga_id FK
        string chapter_id FK
        string status
        string target_lang
        json profile_override
        int total_pages
        int processed_pages
        datetime created_at
        datetime updated_at
    }

    translation_page_bindings {
        string _id PK
        string manga_id FK
        string chapter_id FK
        int page_number
        string page_uid
        string status
        string target_lang
        string rendered_storage_key
        string mask_storage_key
        string translation_storage_key
        string active_job_id FK
        datetime created_at
        datetime updated_at
    }
```

---

## 4. Caching & Task State Policies

| Key Template | Store | TTL | Invalidation Trigger | Fallback on Failure |
|---|---|---|---|---|
| `manga:detail:{manga_id}` | Redis | 300s (5 min) | Manga update, chapter add/delete, rating edit | Direct read from MongoDB `mangas` |
| `reviews:manga:{manga_id}` | Redis | 180s (3 min) | Review create, update, or delete | Direct read from MongoDB `reviews` |
| `task:ocr:{task_id}` | Redis | 3,600s (queued/running)<br>86,400s (finished) | Natural TTL expiration | Returns ARQ job status or 404 |
| `trans:job:{job_id}` | Redis | 86,400s (24h) | Job completion or cancellation | Direct read from MongoDB `translation_jobs` |

---

## 5. Architectural Reality vs Coding Policy

| Layer | Strict Policy for New Code | Existing Reality in Legacy Code |
|---|---|---|
| **Routers** | Must contain NO direct DB queries or heavy computation. Input must be validated via Pydantic DTOs. | Some routers (e.g. [`backend/routers/reviews.py`](../backend/routers/reviews.py), [`backend/routers/creators.py`](../backend/routers/creators.py)) call `db.collection` directly. |
| **Services** | Dedicated home for all domain logic, transactions, and S3 media coordination. | Most domains have dedicated services (`manga_service`, `chapter_service`, `download_service`), but there is no `review_service.py`. |
| **Frontend** | Must use shadcn/ui components (`@/components/ui/`), semantic theme variables, and handle all 4 states (`Loading`, `Normal`, `Empty`, `Error`). | Legacy pages have been updated to use shadcn primitives, with TipTap custom extensions adhering to the design system. |
