"""
script_detector.py - Detects character script based on Unicode code point distribution.
"""

from typing import Tuple

from backend.services.vision.types import ScriptType


class ScriptDetector:
    """
    Fast and deterministic script detector based on Unicode block analysis.
    """

    def detect_script(self, text: str) -> Tuple[ScriptType, float]:
        """
        Inspect text characters and return (detected_script, confidence).
        """
        if not text or not text.strip():
            return "unknown", 0.0

        clean = "".join(c for c in text if not c.isspace())
        if not clean:
            return "unknown", 0.0

        total = len(clean)
        latin_count = 0
        hiragana_count = 0
        katakana_count = 0
        han_count = 0
        hangul_count = 0
        digit_sym_count = 0

        for char in clean:
            cp = ord(char)
            # Latin: Basic Latin, Latin-1, Latin Extended A/B, Latin Additional
            if (
                (0x0041 <= cp <= 0x005A)
                or (0x0061 <= cp <= 0x007A)
                or (0x00C0 <= cp <= 0x024F)
                or (0x1EA0 <= cp <= 0x1EFF)
            ):
                latin_count += 1
            # Hiragana
            elif 0x3040 <= cp <= 0x309F:
                hiragana_count += 1
            # Katakana
            elif 0x30A0 <= cp <= 0x30FF:
                katakana_count += 1
            # Han (Kanji / Hanzi)
            elif (0x4E00 <= cp <= 0x9FFF) or (0x3400 <= cp <= 0x4DBF):
                han_count += 1
            # Hangul
            elif 0xAC00 <= cp <= 0xD7AF:
                hangul_count += 1
            elif char.isdigit() or not char.isalnum():
                digit_sym_count += 1

        # Check dominant script
        cjk_total = hiragana_count + katakana_count + han_count

        if cjk_total > 0 and latin_count > 0:
            return "mixed", (cjk_total + latin_count) / total

        if hiragana_count > 0 and katakana_count > 0 and han_count > 0:
            return "mixed", cjk_total / total

        if latin_count / total >= 0.5:
            return "latin", latin_count / total

        if hiragana_count / total >= 0.3:
            return "hiragana", hiragana_count / total

        if katakana_count / total >= 0.3:
            return "katakana", katakana_count / total

        if han_count / total >= 0.3:
            return "han", han_count / total

        if hangul_count / total >= 0.3:
            return "hangul", hangul_count / total

        if digit_sym_count / total >= 0.7:
            return "numeric_symbol", digit_sym_count / total

        return "unknown", 0.5


script_detector = ScriptDetector()
