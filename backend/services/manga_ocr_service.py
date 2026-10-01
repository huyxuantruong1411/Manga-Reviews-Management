"""
manga_ocr_service.py – Enhanced OCR post-processing pipeline for comic/manga pages.

Wraps the existing RapidOCR engine (PP-OCRv4) with an advanced text cleaning
pipeline specifically tuned for comic-style lettering artefacts:

1. **Comic Font Error Correction** – common glyph-level misreadings by OCR
   on hand-lettered / stylised fonts (e.g. P- → d, rn → m, cl → d).
2. **De-hyphenation** – rejoin words split across lines with a trailing hyphen
   (COUNSEL-\\nOR → COUNSELOR) using vocabulary lookup.
3. **Stuck-Word Segmentation** – split tokens that OCR ran together due to
   tight kerning or missing gutter gaps (GOTALK → GO TALK) via *wordninja*.
4. **Punctuation / Whitespace Normalisation** – collapse redundant spaces,
   fix dashes, ellipses, and quotation marks.
5. **Structured Output** – every processed text block returns ``raw_text``
   (untouched OCR), ``clean_text`` (post-processed), and ``detected_tokens``
   (individual vocabulary tokens extracted from clean_text).
"""

import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("manga_ocr_service")

# ---------------------------------------------------------------------------
# Comic Font OCR Error Mapping
# ---------------------------------------------------------------------------
# These are common glyph-level confusions when OCR models try to read
# stylised comic lettering.  The substitution is applied *before* word-level
# analysis so that downstream dictionary lookup and segmentation receive
# corrected character sequences.
#
# Format:  (compiled regex pattern, replacement string)
# ---------------------------------------------------------------------------
_COMIC_FONT_CORRECTIONS: List[Tuple[re.Pattern, str]] = [
    # "rn" misread as "m" → reverse: OCR gives "m" where it should be "rn"
    # We do NOT blindly replace 'm' → 'rn'; instead we fix known reversed
    # patterns where the OCR outputs impossible bigrams.
    # "cl" → "d"  (common in italic/serif comic fonts)
    # e.g. OCR reads "clidn't" → should be "didn't"
    (re.compile(r"\bcl(?=idn)", re.IGNORECASE), "d"),
    # Backtick or accent where apostrophe should be: it`s → it's
    (re.compile(r"(?<=[A-Za-z])`(?=[A-Za-z])"), "'"),
    # Double-pipe or broken vertical bar read as "II" or "ll"
    (re.compile(r"\bII\b"), "II"),  # preserve roman numeral II
    # Zero read as capital O or vice-versa in numeric contexts
    (re.compile(r"(?<=\d)O(?=\d)"), "0"),
    (re.compile(r"(?<=\d)o(?=\d)"), "0"),
    # "1" misread as "l" or "I" inside numbers
    (re.compile(r"(?<=\d)[lI](?=\d)"), "1"),
]

# ---------------------------------------------------------------------------
# Common English contractions and short words for de-hyphenation scoring
# ---------------------------------------------------------------------------
_COMMON_WORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "is",
        "it",
        "in",
        "on",
        "at",
        "to",
        "of",
        "or",
        "and",
        "but",
        "for",
        "not",
        "you",
        "all",
        "can",
        "had",
        "her",
        "was",
        "one",
        "our",
        "out",
        "are",
        "has",
        "his",
        "how",
        "its",
        "may",
        "new",
        "now",
        "old",
        "see",
        "way",
        "who",
        "did",
        "get",
        "let",
        "say",
        "she",
        "too",
        "use",
        "him",
        "man",
        "own",
        "two",
        "any",
        "day",
        "got",
        "big",
        "end",
        "why",
        "put",
        "run",
        "set",
        "try",
        "ask",
        "men",
        "off",
        "still",
        "go",
        "no",
        "do",
        "my",
        "me",
        "we",
        "so",
        "if",
        "up",
        # common verb forms
        "been",
        "being",
        "have",
        "having",
        "what",
        "when",
        "will",
        "with",
        "your",
        "from",
        "they",
        "come",
        "each",
        "find",
        "give",
        "good",
        "just",
        "know",
        "like",
        "long",
        "look",
        "make",
        "many",
        "much",
        "must",
        "over",
        "such",
        "take",
        "than",
        "that",
        "them",
        "then",
        "this",
        "very",
        "want",
        "well",
        "work",
        "year",
        # comic-specific
        "counsel",
        "counselor",
        "wait",
        "talk",
        "going",
        "gonna",
        "gotta",
        "wanna",
        "about",
        "after",
        "again",
        "could",
        "every",
        "would",
        "should",
        "think",
        "thought",
        "through",
        "because",
    }
)


class MangaOCRService:
    """
    Enhanced OCR post-processing service for manga/comic text.

    This service does NOT replace the underlying OCR engine (RapidOCR).
    Instead it sits downstream and cleans up the raw OCR output to fix
    comic-specific artefacts before vocabulary extraction.
    """

    def __init__(self):
        self._wordninja_loaded = False
        self._wordninja = None
        self._en_vocab = None

    # ------------------------------------------------------------------
    # Lazy loaders
    # ------------------------------------------------------------------
    @property
    def wordninja(self):
        """Lazy-load wordninja to avoid import cost at startup."""
        if not self._wordninja_loaded:
            try:
                import wordninja as _wn

                self._wordninja = _wn
                self._wordninja_loaded = True
                logger.info("wordninja loaded successfully.")
            except ImportError:
                logger.warning("wordninja not installed – stuck-word segmentation disabled.")
                self._wordninja_loaded = True  # don't retry
        return self._wordninja

    @property
    def en_vocab(self) -> frozenset:
        """Lazy-load English vocabulary set from spaCy for lookup."""
        if self._en_vocab is None:
            vocab: set = set()
            try:
                import spacy

                nlp = spacy.load("en_core_web_sm")
                for word in nlp.vocab.strings:
                    if word and word.isalpha() and len(word) >= 2:
                        vocab.add(word.lower())
                logger.info("spaCy en_core_web_sm vocab loaded (%d entries).", len(vocab))
            except Exception as exc:
                logger.warning("Failed to load spaCy vocab: %s", exc)

            # Merge with common words fallback
            vocab.update(_COMMON_WORDS)
            self._en_vocab = frozenset(vocab)
        return self._en_vocab

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def process_ocr_text(
        self,
        raw_lines: List[str],
        language: str = "en",
    ) -> Dict[str, Any]:
        """
        Main entry point: take raw OCR text lines and return structured result.

        Parameters
        ----------
        raw_lines : list[str]
            Individual text lines as returned by the OCR engine per bubble/panel.
        language : str
            Language code ("en" or "vi").

        Returns
        -------
        dict with keys:
            raw_text       – untouched concatenation of OCR lines
            clean_text     – fully post-processed text
            detected_tokens – unique vocabulary tokens (lowercased)
        """
        raw_text = "\n".join(raw_lines).strip()
        if not raw_text:
            return {"raw_text": "", "clean_text": "", "detected_tokens": []}

        clean = self._pipeline(raw_text, language=language)

        tokens = self._extract_tokens(clean, language=language)

        return {
            "raw_text": raw_text,
            "clean_text": clean,
            "detected_tokens": tokens,
        }

    # ------------------------------------------------------------------
    # Pipeline stages
    # ------------------------------------------------------------------
    def _pipeline(self, text: str, language: str = "en") -> str:
        """Run the full cleaning pipeline on raw OCR text."""
        # 0. Unicode normalisation
        text = unicodedata.normalize("NFC", text)

        is_vi = (language or "en").lower() == "vi"

        # 1. Comic font error correction
        text = self._fix_comic_font_errors(text)

        # 2. Punctuation normalisation
        text = self._normalize_punctuation(text)

        # 3. De-hyphenation (rejoin words split across lines)
        text = self._dehyphenate(text, is_vi=is_vi)

        # 4. Collapse whitespace (but preserve single newlines)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = text.strip()

        # 5. Separate contractions stuck to adjacent words (English only)
        if not is_vi:
            text = self._separate_contractions(text)

        # 6. Stuck-word segmentation (English only)
        if not is_vi:
            text = self._segment_stuck_words(text)

        # 7. Sentence-case normalisation for ALL-CAPS text
        text = self._normalize_case(text, is_vi=is_vi)

        return text

    def _fix_comic_font_errors(self, text: str) -> str:
        """Apply comic font OCR error corrections."""
        for pattern, replacement in _COMIC_FONT_CORRECTIONS:
            text = pattern.sub(replacement, text)
        return text

    def _normalize_punctuation(self, text: str) -> str:
        """Fix common punctuation artefacts from comic OCR."""
        # Backtick → apostrophe
        text = text.replace("`", "'")

        # Curly/smart quotes → straight
        text = text.replace("\u2018", "'").replace("\u2019", "'")
        text = text.replace("\u201c", '"').replace("\u201d", '"')

        # En-dash / em-dash cleanup
        text = text.replace("\u2013", "-").replace("\u2014", "--")

        # Ellipsis normalisation: two or more dots → "..."
        text = re.sub(r"\.{2,}", "...", text)

        # Remove stray control characters
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

        return text

    def _dehyphenate(self, text: str, is_vi: bool = False) -> str:
        """
        Rejoin words split by a hyphen at line breaks.

        English strategy:
          1. Try joining the two fragments into a single word.
          2. If the joined word is in vocabulary → merge.
          3. Otherwise keep the hyphen (e.g. "multi-speed" stays).

        Vietnamese strategy:
          Vietnamese is monosyllabic, so hyphen-line-break always
          means a visual split → rejoin with a space.
        """
        if is_vi:
            # Vietnamese: always rejoin with space
            text = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1 \2", text)
            text = re.sub(r"-\s+", " ", text)
            return text

        vocab = self.en_vocab

        def _resolve(m: re.Match) -> str:
            left = m.group(1)
            right = m.group(2)

            # Try joined form
            joined = (left + right).lower()
            if joined in vocab:
                # Preserve original case of left part
                return left + right

            # Try as two separate words
            if left.lower() in vocab and right.lower() in vocab:
                return f"{left} {right}"

            # Keep hyphenated form (e.g. "well-known")
            return f"{left}-{right}"

        # Match: WORD- <optional whitespace/newline> WORD
        text = re.sub(
            r"(\w+)-\s*\n\s*(\w+)",
            _resolve,
            text,
        )

        # Also handle hyphen at end of line without newline (e.g. "COUNSEL- OR")
        text = re.sub(
            r"(\w{2,})-\s+(\w{2,})",
            _resolve,
            text,
        )

        return text

    def _separate_contractions(self, text: str) -> str:
        """
        Separate English contractions that OCR merged with adjacent words.

        Examples:
            LET'SHANGOUTAT  -> LET'S HANGOUTAT
            DON'TWORRY      -> DON'T WORRY
            andit's         -> and it's
            I'drecommend    -> I'd recommend
        """
        # Pattern 1: WORD'SUFFIX + stuck letters after contraction
        # e.g., LET'SHANGOUTAT → LET'S + HANGOUTAT
        # DON'TWORRY → DON'T + WORRY
        # Match: word + apostrophe + contraction suffix (S/T/D/M/LL/RE/VE) + remaining letters
        text = re.sub(
            r"\b([A-Za-z]+)'([STDMstdm])([A-Za-z]{2,})\b",
            lambda m: (
                f"{m.group(1)}'{m.group(2)} {m.group(3)}"
                if not m.group(3).lower().startswith(("nt", "ll", "re", "ve"))
                else m.group(0)
            ),
            text,
        )

        # Pattern 2: Common contraction suffixes that are 2+ chars (LL, RE, VE, NT)
        text = re.sub(
            r"\b([A-Za-z]+)'(LL|RE|VE|NT|ll|re|ve|nt)([A-Za-z]{2,})\b",
            r"\1'\2 \3",
            text,
        )

        # Pattern 3: Conjunction/pronoun stuck to contraction (andit's -> and it's)
        text = re.sub(
            r"\b(and|but|or|if|so|that|for|with|what)(it's|i'm|i'd|i'll|you're|we're|they're|he's|she's|there's|that's|what's|who's|don't|won't|can't|isn't|aren't|wasn't|weren't|didn't|hasn't|haven't|couldn't|wouldn't|shouldn't)\b",
            r"\1 \2",
            text,
            flags=re.IGNORECASE,
        )

        # Pattern 4: Contraction + word stuck (I'drecommend -> I'd recommend)
        text = re.sub(
            r"\b([A-Za-z]+'(?:d|m|ll|re|ve|s|t))([A-Za-z]{2,})\b",
            r"\1 \2",
            text,
        )

        return text

    def _segment_stuck_words(self, text: str) -> str:
        """
        Use wordninja to split tokens that OCR merged due to tight kerning.

        Examples:
            GOTALK           -> GO TALK
            WAITA            -> WAIT A
            HANGOUTAT        -> HANG OUT AT
            INCREDIBLETOME   -> INCREDIBLE TO ME
        """
        wn = self.wordninja
        if wn is None:
            return text

        vocab = self.en_vocab
        tokens = text.split()
        result: List[str] = []

        def _try_split(word: str, depth: int = 0) -> Optional[List[str]]:
            """Recursively try to split a word into valid vocabulary parts."""
            if depth > 3:
                return None
            if len(word) < 2:
                return [word] if word.lower() in {"a", "i"} else None
            if word.lower() in vocab:
                return [word]

            parts = wn.split(word.lower())
            if len(parts) <= 1:
                return None

            # Check if all parts are valid
            all_valid = all((len(p) > 1 or p.lower() in {"a", "i"}) and p.lower() in vocab for p in parts)
            if all_valid:
                return parts

            # Try recursive splitting of invalid parts
            expanded: List[str] = []
            for p in parts:
                if p.lower() in vocab:
                    expanded.append(p)
                else:
                    # Try further splitting this part
                    sub = _try_split(p, depth + 1)
                    if sub is not None:
                        expanded.extend(sub)
                    else:
                        # If the part is >= 3 chars, still accept it
                        # (wordninja may have found a valid but rare word)
                        if len(p) >= 3:
                            expanded.append(p)
                        else:
                            return None  # Give up on this split

            return expanded

        for token in tokens:
            # Extract leading/trailing punctuation
            m = re.match(r"^([^A-Za-z]*)([A-Za-z'-]+)([^A-Za-z]*)$", token)
            if not m:
                result.append(token)
                continue

            lead, core, trail = m.groups()

            # Skip short words, words with hyphens/apostrophes, valid vocab words
            if len(core) < 4:
                result.append(token)
                continue

            if "-" in core or "'" in core:
                result.append(token)
                continue

            core_lower = core.lower()

            # Special case: "I" + lowercase verb (Iwas, Ican, Iwent)
            is_i_prefix = core.startswith("I") and len(core) >= 3 and core[1].islower()

            if core_lower in vocab and not is_i_prefix:
                result.append(token)
                continue

            # Skip proper names (TitleCase) unless it's an I-prefix run
            if core.istitle() and not is_i_prefix:
                result.append(token)
                continue

            # Attempt segmentation with recursive splitting
            parts = _try_split(core_lower)
            if parts is not None and len(parts) > 1:
                # Validate: all parts must be real words (>1 char or "a"/"i")
                valid = all((len(p) > 1 or p.lower() in {"a", "i"}) for p in parts)
                if valid:
                    # Restore original case
                    if core.isupper():
                        parts = [p.upper() for p in parts]
                    elif core[0].isupper():
                        parts[0] = parts[0].capitalize()

                    segmented = " ".join(parts)
                    result.append(f"{lead}{segmented}{trail}")
                    continue

            result.append(token)

        return " ".join(result)

    def _normalize_case(self, text: str, is_vi: bool = False) -> str:
        """
        If the entire text is UPPERCASE (common in comics), convert to
        sentence-like case for better NLP lemmatisation downstream.
        """
        if not text.isupper() or len(text) <= 3:
            return text

        if is_vi:
            return text[0].upper() + text[1:].lower()

        words = text.split()
        normalised: List[str] = []
        for i, w in enumerate(words):
            if w == "I" or w.startswith("I'"):
                normalised.append(w.capitalize())
            elif i == 0:
                normalised.append(w.capitalize())
            else:
                normalised.append(w.lower())

        return " ".join(normalised)

    def _extract_tokens(self, text: str, language: str = "en") -> List[str]:
        """
        Extract unique vocabulary tokens from cleaned text.

        Returns a deduplicated, lowercased list of alphabetic tokens
        with length >= 2, excluding common stopwords.
        """
        if not text:
            return []

        # Extract alphabetic tokens
        raw_tokens = re.findall(r"[A-Za-zÀ-ỹĐđ]+", text)

        # Lowercase + deduplicate
        seen: set = set()
        tokens: List[str] = []
        for t in raw_tokens:
            t_low = t.lower()
            if len(t_low) < 2:
                continue
            if t_low in seen:
                continue
            seen.add(t_low)
            tokens.append(t_low)

        return tokens

    # ------------------------------------------------------------------
    # Convenience: process a list of OCR detection dicts
    # ------------------------------------------------------------------
    def process_detections(
        self,
        detections: List[Dict[str, Any]],
        language: str = "en",
    ) -> Dict[str, Any]:
        """
        Process a list of OCR detection dicts (as returned by VisionService.detect_text).

        Each detection is expected to have a "text" key.

        Returns the same structured dict as ``process_ocr_text``.
        """
        raw_lines = [d.get("text", "") for d in detections if d.get("text")]
        return self.process_ocr_text(raw_lines, language=language)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
manga_ocr_service = MangaOCRService()
