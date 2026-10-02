"""
normalizer.py - Conservative text normalizer and error recovery with provenance tracking.
"""

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from typing import List, Optional, Set

from backend.services.vision.text.correction_rules import is_protected_token
from backend.services.vision.types import Correction

logger = logging.getLogger("text_normalizer")

# Comic Font Glitch Fixes
_COMIC_FONT_CORRECTIONS = [
    (re.compile(r"\bcl(?=idn)", re.IGNORECASE), "d"),
    (re.compile(r"(?<=[A-Za-z])`(?=[A-Za-z])"), "'"),
    (re.compile(r"(?<=\d)O(?=\d)"), "0"),
    (re.compile(r"(?<=\d)o(?=\d)"), "0"),
    (re.compile(r"(?<=\d)[lI](?=\d)"), "1"),
]


@dataclass
class NormalizationResult:
    raw_text: str
    normalized_text: str
    corrected_text: Optional[str] = None
    corrections: List[Correction] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class TextNormalizer:
    """
    Conservative normalizer that performs deterministic mechanical cleanups,
    restricts wordninja, and tracks all modifications as inspectable corrections.
    """

    def __init__(self):
        self._wn = None
        self._wn_loaded = False
        self._en_vocab: Optional[Set[str]] = None

    @property
    def wordninja(self):
        if not self._wn_loaded:
            self._wn_loaded = True
            try:
                import wordninja

                self._wn = wordninja
            except ImportError:
                logger.warning("wordninja not installed; stuck word splitting disabled.")
        return self._wn

    @property
    def en_vocab(self) -> Set[str]:
        if self._en_vocab is None:
            vocab: Set[str] = set()
            try:
                import spacy

                nlp = spacy.load("en_core_web_sm")
                for w in nlp.vocab.strings:
                    if w and w.isalpha() and len(w) >= 2:
                        vocab.add(w.lower())
            except Exception:
                pass
            self._en_vocab = vocab
        return self._en_vocab

    def normalize(
        self,
        raw_text: str,
        language: str = "en",
        enable_wordninja: bool = True,
    ) -> NormalizationResult:
        if not raw_text or not raw_text.strip():
            return NormalizationResult(raw_text="", normalized_text="")

        corrections: List[Correction] = []
        warnings: List[str] = []

        # 0. Unicode NFC normalization
        normalized = unicodedata.normalize("NFC", raw_text)

        # 1. Comic font error corrections
        for pat, repl in _COMIC_FONT_CORRECTIONS:
            if pat.search(normalized):
                before = normalized
                normalized = pat.sub(repl, normalized)
                corrections.append(
                    Correction(
                        type="comic_font_glyph",
                        before=before,
                        after=normalized,
                        confidence=0.95,
                        reason="Standard comic glyph OCR substitution",
                    )
                )

        # 2. Punctuation and whitespace normalization
        normalized = self._normalize_punctuation(normalized)

        # 3. De-hyphenation across line breaks
        normalized, dehyphen_corrections = self._dehyphenate(normalized, language=language)
        corrections.extend(dehyphen_corrections)

        # 4. Collapse redundant horizontal whitespace (preserving line breaks)
        normalized = re.sub(r"[ \t]+", " ", normalized)
        normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()

        # 5. English-specific cautious contraction separation
        if language == "en":
            before_contractions = normalized
            normalized = self._separate_contractions(normalized)
            if before_contractions != normalized:
                corrections.append(
                    Correction(
                        type="contraction_split",
                        before=before_contractions,
                        after=normalized,
                        confidence=0.92,
                        reason="Separated squished English contraction",
                    )
                )

        # 6. Stuck-word segmentation: strictly gated
        corrected: Optional[str] = None
        if language == "en" and enable_wordninja:
            segmented_text, split_corrections = self._cautious_segment_stuck_words(normalized)
            if split_corrections:
                corrected = segmented_text
                corrections.extend(split_corrections)

        return NormalizationResult(
            raw_text=raw_text,
            normalized_text=normalized,
            corrected_text=corrected,
            corrections=corrections,
            warnings=warnings,
        )

    def _normalize_punctuation(self, text: str) -> str:
        text = text.replace("`", "'")
        text = text.replace("\u2018", "'").replace("\u2019", "'")
        text = text.replace("\u201c", '"').replace("\u201d", '"')
        text = text.replace("\u2013", "-").replace("\u2014", "--")
        text = re.sub(r"\.{2,}", "...", text)
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
        return text

    def _dehyphenate(self, text: str, language: str) -> tuple[str, List[Correction]]:
        corrections: List[Correction] = []
        is_vi = language.lower() == "vi"

        if is_vi:
            text = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1 \2", text)
            return text, corrections

        vocab = self.en_vocab

        def _resolve(m: re.Match) -> str:
            w1 = m.group(1)
            w2 = m.group(2)
            joined = (w1 + w2).lower()
            if joined in vocab:
                corrections.append(
                    Correction(
                        type="dehyphenation",
                        before=f"{w1}-\\n{w2}",
                        after=w1 + w2,
                        confidence=0.98,
                        reason="Joined hyphenated word matched vocabulary",
                    )
                )
                return w1 + w2
            return f"{w1}-{w2}"

        res = re.sub(r"(\w+)-\s*\n\s*(\w+)", _resolve, text)
        return res, corrections

    def _separate_contractions(self, text: str) -> str:
        # Separate WORD'SUFFIX when stuck to next word: e.g. LET'SHANGOUTAT -> LET'S HANGOUTAT
        text = re.sub(
            r"\b([A-Za-z]+)'([STDMstdm])([A-Za-z]{2,})\b",
            lambda m: (
                f"{m.group(1)}'{m.group(2)} {m.group(3)}"
                if not m.group(3).lower().startswith(("nt", "ll", "re", "ve"))
                else m.group(0)
            ),
            text,
        )
        text = re.sub(
            r"\b([A-Za-z]+)'(LL|RE|VE|NT|ll|re|ve|nt)([A-Za-z]{2,})\b",
            r"\1'\2 \3",
            text,
        )
        return text

    def _cautious_segment_stuck_words(self, text: str) -> tuple[str, List[Correction]]:
        """
        Conservative stuck word splitting.
        Strictly preserves:
        - Words in PROTECTED_LEXICON
        - Proper nouns (TitleCase)
        - Non-English tokens
        """
        wn = self.wordninja
        if wn is None:
            return text, []

        tokens = text.split()
        result: List[str] = []
        corrections: List[Correction] = []
        vocab = self.en_vocab

        for tok in tokens:
            m = re.match(r"^([^A-Za-z]*)([A-Za-z'-]+)([^A-Za-z]*)$", tok)
            if not m:
                result.append(tok)
                continue

            lead, core, trail = m.groups()
            core_clean = core.replace("-", "").replace("'", "")

            # 1. Gate: protected lexicon check
            if is_protected_token(core_clean):
                result.append(tok)
                continue

            # 2. Gate: TitleCase proper name check (e.g. Inio, Asano, Bamboovian)
            if core.istitle() and not (core.startswith("I") and len(core) >= 3 and core[1].islower()):
                result.append(tok)
                continue

            # 3. Gate: Short words or words already in vocabulary
            if len(core) < 6 or core.lower() in vocab:
                result.append(tok)
                continue

            # 4. Attempt wordninja split
            parts = wn.split(core.lower())
            if len(parts) <= 1:
                result.append(tok)
                continue

            # Every part must be in vocabulary and valid (>1 char or 'a'/'i')
            if all((len(p) > 1 or p in {"a", "i"}) and (p in vocab) for p in parts):
                # Restore case
                if core.isupper():
                    parts = [p.upper() for p in parts]
                elif core[0].isupper():
                    parts[0] = parts[0].capitalize()

                joined = " ".join(parts)
                corrections.append(
                    Correction(
                        type="stuck_word_split",
                        before=tok,
                        after=f"{lead}{joined}{trail}",
                        confidence=0.88,
                        reason="Wordninja conservative stuck word split verified against vocabulary",
                    )
                )
                result.append(f"{lead}{joined}{trail}")
            else:
                result.append(tok)

        return " ".join(result), corrections


text_normalizer = TextNormalizer()
