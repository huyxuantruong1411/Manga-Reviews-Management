# Upstream Parity & Capability Matrix

> **Source Reference**: Upstream `meangrinch/MangaTranslator` at commit `924854a218dda3bc4a22c1a4e65dfe8dc9fa8ac0`  
> **Host Target**: `huyxuantruong1411/Manga-Reviews-Management`  
> **Last Updated**: 2026-10-05

---

## 1. Feature & Capability Parity

| Upstream MangaTranslator Feature | Native UI Representation | Engine Adapter Strategy | Milestone Priority | Status |
|---|---|---|---|---|
| **Single Image Translation** | Reader translation panel & Studio Demo Tab | Subprocess execution of `translate_and_render` | P0 / P1 | Designed |
| **Batch Folder / ZIP Processing** | Studio Jobs Tab & Chapter Bulk Action | Server-side job queue (`arq:translation`) with durable status | P1 | Designed |
| **Text Detection & Bubble Segmentation** | Profile Detection Settings | Dataclass mapping (`DetectionConfig`); validates local model availability | P0 / P2 | Designed |
| **Image Cleaning / Inpainting** | Profile Cleaning Settings | Core inpainting; exports clean image artifact for offline re-rendering | P0 / P1 | Designed |
| **Translation Providers & LLMs** | Profile Translation & Provider Registry | Server-side secret injection; supports Gemini, OpenAI-compatible | P0 / P1 | Designed |
| **Typography & Font Rendering** | Profile Typography & Font Manager | HarfBuzz / FreeType shaping; Vietnamese coverage verification | P0 / P1 | Designed |
| **Outside Bubble Text (OSB)** | Advanced Section in Profile Form | Gated by hardware capability; default off | P2 | Planned |
| **Resolution Upscaling** | Advanced Diagnostic Options | Explicit `operation_kind="upscale"`; distinct from standard translation | P2 | Planned |
| **Config Save / Reset** | Profile Drafts, Revisions & History | MongoDB immutable revisions; replaces local `CONFIG_FILE` | P1 | Designed |
| **Interactive Job Cancellation** | Reader / Studio Cancel Button | Process group / tree termination with commit fencing | P0 / P1 | Designed |
| **Result Export (ZIP / CBZ)** | Studio Export Modal | Server-side archive assembly from S3 artifacts; no presigned URLs in ZIP | P1 | Designed |

---

## 2. Configuration Field Mapping

### Detection & Segmentation
- `detector`: Default to installed compatible detector (`default` / `ctd`).
- `detection_size`: Bounded integer [512, 2048], default 1024.
- `box_threshold`: Float [0.1, 0.9], default 0.6.
- `unclip_ratio`: Float [1.0, 3.0], default 2.0.

### OCR Engine
- `ocr`: Mapping to installed engines (`manga_ocr`, `rapidocr`, `offline`).
- `source_lang`: ISO codes (`ja`, `en`, `ko`, `zh-CN`, `zh-TW`, `auto`). `auto` executes script detection with confidence fallback.

### Translation Provider
- `translator`: Abstracted provider reference (`gemini`, `openai_compatible`, `offline_stub`).
- `target_lang`: ISO codes (`vi`, `en`, `fr`, `es`, etc.). Default `vi`.
- `temperature`: Bounded float [0.0, 1.0], default 0.2.
- `high_quality_prompt`: Boolean toggle for dialogue-focused translation style.

### Cleaning & Inpainting
- `inpainter`: Mapping to supported inpainters (`lama_manga`, `sd`, `none`).
- `inpainting_size`: Bounded integer [512, 2048], default 1024.

### Typography & Rendering
- `font_path`: Resolved server-side from active `font_pack_id` revision in storage.
- `font_size_min` / `font_size_max`: Bounded integers [8, 72].
- `line_spacing`: Float [0.8, 2.0], default 1.1.
- `direction`: Auto-detected or forced (`auto`, `horizontal`, `vertical`).
