"""End-to-end test: OCR a sample manga page through the enhanced pipeline."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import cv2

from backend.services.manga_ocr_service import manga_ocr_service
from backend.services.vision_service import vision_service

img_path = r"ref\Panel-words-detector\backend\data\manga\Sample Manga\Chapter 001 - The Beginning\001.jpg"

img = cv2.imread(os.path.join(os.path.dirname(__file__), "..", "..", img_path))
if img is None:
    print("ERROR: Could not read image")
    sys.exit(1)

print("Image shape:", img.shape)
detections = vision_service.detect_text(img)
print("OCR detections:", len(detections))
for d in detections[:10]:
    conf = d["confidence"]
    text = d["text"]
    print(f"  [{conf:.2f}] {text}")

# Process through MangaOCRService
result = manga_ocr_service.process_detections(detections)
print("\n--- MangaOCRService Output ---")
print("raw_text:")
print(result["raw_text"][:400])
print("\nclean_text:")
print(result["clean_text"][:400])
print("\ndetected_tokens:", result["detected_tokens"][:20])
