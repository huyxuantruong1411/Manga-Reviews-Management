# Fixtures & Font Specifications for Translation Studio

---

## 1. Vietnamese Glyph Coverage Requirements

Vietnamese typography introduces unique challenges in comic typesetting: diacritical marks stacked on vowels (`ấ`, `ề`, `ổ`, `ự`), the letter `Đ`/`đ`, and combinations of horn/breve/circumflex accents with tone marks (sắc, huyền, hỏi, ngã, nặng).

### 1.1 Mandatory Glyph Set
Any uploaded or bundled font pack targeting Vietnamese (`target_language="vi"`) must pass automated glyph coverage inspection against:
1. **Alphabetical Characters**:
   - `a, ă, â, e, ê, i, o, ô, ơ, u, ư, y` (both lowercase and uppercase).
   - `đ, Đ`.
2. **Accented Variations & Tone Marks**:
   - `á, à, ả, ã, ạ`, `ắ, ằ, ẳ, ẵ, ặ`, `ấ, ầ, ẩ, ẫ, ậ`
   - `é, è, ẻ, ẽ, ẹ`, `ế, ề, ể, ễ, ệ`
   - `í, ì, ỉ, ĩ, ị`
   - `ó, ò, ỏ, õ, ọ`, `ố, ồ, ổ, ỗ, ộ`, `ớ, ờ, ở, ỡ, ợ`
   - `ú, ù, ủ, ũ, ụ`, `ứ, ừ, ử, ữ, ự`
   - `ý, ỳ, ỷ, ỹ, y`
3. **Punctuation & Symbols**:
   - Standard quotation marks (`“ ” ‘ ’ « »`), em-dash (`—`), ellipsis (`…`), exclamation mark (`!`), question mark (`?`).

### 1.2 Verification Sentences
Font packages are verified against standard diagnostic test strings:
- **Baseline Diagnostic**:
  > *"Đường phố vẫn sáng, nhưng lòng tôi đã đổi khác. Ừ, hãy bắt đầu!"*
- **Pangram Check**:
  > *"Do bạch kim rất quý nên qua thời gian người ta vẫn chuộng."*
  > *"Con chó vện cắn đứt xích chạy nhảy khắp vườn chuối."*

---

## 2. Synthetic Test Fixtures

To ensure privacy, licensing compliance, and avoid distributing copyrighted comic pages in version control or CI:
1. **Synthetic Comic Panels**:
   - Generated using Pillow or SVG vector rendering containing artificial speech bubbles, dark backgrounds, and vertical text.
   - Stored in `backend/tests/fixtures/translation/` or generated on-the-fly during tests.
2. **Deterministic Test Types**:
   - **Horizontal Dialogue**: Simple single-speaker dialogue bubble.
   - **Vertical Japanese / CJK**: Japanese text in vertical writing mode (`縦書き`).
   - **No-Text Panel**: Scenery / action panel with zero speech bubbles (validates `no_text/skipped` status).
   - **Colored Bubble**: Speech bubble with colored background or gradient (validates inpainter mask handling).
   - **Multi-region Overflow**: Long Vietnamese translation inside small bubble (validates word-wrapping and font autosizing).
