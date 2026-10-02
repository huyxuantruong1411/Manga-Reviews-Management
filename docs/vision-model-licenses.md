# Vision Pipeline V3 Model Licenses & Vendor Audit

> **Purpose**: Governance record of model licenses, dependencies, and redistribution constraints for vision models considered or used in Manga Reviews Management V3.

---

## 1. Layout Segmentation Models

| Candidate Model | License | Training Data / Upstream | Architectural Notes |
|---|---|---|---|
| `ShadowB/Manga109-panel-balloon-text-yolov26-segmentation` | Open research / Apache 2.0 compatible | Manga109 dataset (Research use only) | Predicts `frame`, `text`, `balloon` with instance masks. |
| `deepghs/manga109_yolo` | Apache 2.0 | Manga109 dataset | Predicts `body`, `face`, `frame`, `text`. |
| `leoxs22/manga-panel-detector-yolo26n` | MIT / Apache 2.0 | Manga109-derived | Lightweight CPU/edge candidate. |
| OpenCV Fallback (`RETR_CCOMP` + morphological operations) | Apache 2.0 (OpenCV) | None (Pure heuristic algorithm) | Built-in zero-dependency fallback. |

---

## 2. OCR Engines

| Engine | License | Supported Scripts | Notes |
|---|---|---|---|
| RapidOCR (`PP-OCRv4` / `PP-OCRv6` ONNX) | Apache 2.0 | Multilingual (Latin, CJK, etc.) | Default production OCR engine. Run on text crops. |
| MangaOCR (`kha-white/manga-ocr`) | Apache 2.0 | Japanese | Fallback for low-confidence Japanese text crops. Generative attention model. |

---

## 3. NLP Processors

| Component | License | Notes |
|---|---|---|
| spaCy `en_core_web_sm` | MIT | English tokenization, lemmatization, and POS tagging. Used only for validated English text. |
| Wordninja | MIT | Limited, conservative stuck-word recovery. Disabled for protected proper names and non-English scripts. |
| Vietnamese regex + accent normalizer | MIT / Proprietary codebase | Safe tokenization with diacritic strip fallback. |
