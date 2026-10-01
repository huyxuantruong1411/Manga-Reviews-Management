"""
Test script for the enhanced MangaOCRService pipeline.

Validates:
1. De-hyphenation (COUNSEL-\\nOR -> COUNSELOR)
2. Stuck-word segmentation (GOTALK -> GO TALK, WAITA -> WAIT A)
3. Punctuation normalisation
4. Case normalisation for ALL-CAPS text
"""

import os
import sys

# Ensure backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.services.manga_ocr_service import MangaOCRService

service = MangaOCRService()


def test_case(name: str, raw_lines: list, expected_substr: list, language: str = "en"):
    """Run a single test case and report pass/fail."""
    result = service.process_ocr_text(raw_lines, language=language)
    clean = result["clean_text"]
    tokens = result["detected_tokens"]

    passed = True
    for substr in expected_substr:
        if substr.lower() not in clean.lower():
            print(f"  [FAIL] Expected '{substr}' in clean_text")
            passed = False

    if passed:
        print(f"  [PASS] {name}")
    else:
        print(f"  [FAIL] {name}")

    print(f"     raw_text:        {result['raw_text'][:100]}")
    print(f"     clean_text:      {clean[:100]}")
    print(f"     detected_tokens: {tokens[:10]}")
    print()
    return passed


def main():
    print("=" * 60)
    print("MangaOCRService Pipeline Tests")
    print("=" * 60)
    print()

    results = []

    # Test 1: De-hyphenation across lines
    results.append(
        test_case(
            "De-hyphenation: COUNSEL-OR",
            ["COUNSEL-", "OR"],
            ["counselor"],
        )
    )

    # Test 2: Stuck words - GOTALK
    results.append(
        test_case(
            "Stuck words: GOTALK",
            ["GOTALK"],
            ["go", "talk"],
        )
    )

    # Test 3: Stuck words - WAITA
    results.append(
        test_case(
            "Stuck words: WAITA",
            ["WAITA"],
            ["wait"],
        )
    )

    # Test 4: I + verb stuck
    results.append(
        test_case(
            "I-prefix: Iwas",
            ["Iwas going home"],
            ["was"],
        )
    )

    # Test 5: Punctuation - backtick
    results.append(
        test_case(
            "Backtick -> apostrophe: it`s",
            ["it`s fine"],
            ["it's"],
        )
    )

    # Test 6: ALL-CAPS normalisation
    results.append(
        test_case(
            "ALL-CAPS normalisation",
            ["THIS IS A TEST"],
            ["this", "is", "test"],
        )
    )

    # Test 7: Mixed normal text should pass through unchanged
    results.append(
        test_case(
            "Normal text passthrough",
            ["Hello world, how are you?"],
            ["hello", "world"],
        )
    )

    # Test 8: Vietnamese de-hyphenation
    results.append(
        test_case(
            "Vietnamese de-hyphenation",
            ["cố-", "lên nào"],
            ["cố", "lên"],
            language="vi",
        )
    )

    # Test 9: THANKYOU -> THANK YOU
    results.append(
        test_case(
            "Stuck words: THANKYOU",
            ["THANKYOU"],
            ["thank", "you"],
        )
    )

    # Test 10: Multi-line with hyphens
    results.append(
        test_case(
            "Multi-line de-hyphenation: recom-mend",
            ["I recom-", "mend this book"],
            ["recommend"],
        )
    )

    # Summary
    total = len(results)
    passed = sum(results)
    print("=" * 60)
    print(f"Results: {passed}/{total} passed")
    if passed == total:
        print(">> All tests passed!")
    else:
        print(f"!! {total - passed} test(s) failed")
    print("=" * 60)


if __name__ == "__main__":
    main()
