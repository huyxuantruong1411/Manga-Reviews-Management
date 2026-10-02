# Vision Pipeline V3 Architecture & Governance

## 1. Overview & Baseline

- **Plan Reference**: [`ref/plan/Manga_Reviews_Management_Vision_Pipeline_V3_Plan.md`](../../ref/plan/Manga_Reviews_Management_Vision_Pipeline_V3_Plan.md)
- **Baseline Commit**: `3faafb0` (V2 Baseline)
- **Key Shift**: Move from *"panel as a crop containing OCR text"* to *"page as a semantic region graph: frame → balloon → text → OCR → language routing → conservative normalization → NLP"*.

---

## 2. Core Architectural Pillars

```text
Page bytes (MinIO)
      │
      ▼
Decode / normalize + Hash
      │
      ▼
Page classification + metadata gate (story, cover, toc, credits, etc.)
      │
      ▼
Semantic Manga Layout Analyzer (frame, text, balloon)
      │
      ├───────────────────────────────┐
      │                               │
      ▼                               ▼
Reading order (Kovanen RTL/LTR)   Region Association (Frame ↔ Balloon ↔ Text)
      │                               │
      └───────────────┬───────────────┘
                      ▼
               Region-level OCR (PP-OCR engine)
                      │
                      ▼
          Script & Language Routing (Unicode analysis: Latin, CJK, etc.)
                      │
                      ▼
          Conservative Text Normalization (No silent wordninja rewriting)
                      │
                      ▼
          Language-specific NLP (English spaCy, Vietnamese, Japanese passthrough)
                      │
                      ▼
          Confidence & Provenance Scoring
                      │
                      ▼
     MongoDB V3 Storage (`vision_page_analyses`, `vision_regions`)
```

---

## 3. Storage & Compatibility

1. **`vision_page_analyses`**: Page-level document containing layout metadata, dimensions, page type, model versions, and timings.
2. **`vision_regions`**: Individual region documents (`frame`, `balloon`, `text`) linking hierarchically.
3. **Compatibility Facade**: Legacy `manga_panels` and search queries are transparently supported via compatibility DTO adapters.

---

## 4. Guardrails & Acceptance Criteria

- **No Over-segmentation**: Cover pages do not produce dozens of fragmented story panels.
- **Unassigned Text Protection**: Text outside detected frames has `panel_id = null` and never fabricates fake panels.
- **Lexicon Protection**: Proper names (e.g. *Inio Asano*, *Bamboovian*, *senpai*, *Kinoko Takenoko*) are never mangled by wordninja.
- **Script Isolation**: CJK/Japanese text never passes into English spaCy.
- **Provenance Preservation**: `ocr_raw`, `normalized`, and `corrected` are tracked distinctly with explicit reasons and confidence scores.
