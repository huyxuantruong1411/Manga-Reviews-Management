"""
metrics.py - Evaluation metrics for Manga Vision Pipeline V3.

Implements:
- Character Error Rate (CER) and Word Error Rate (WER)
- Intersection over Union (IoU) for bounding boxes
- Reading Order Kendall Tau and Pairwise Order Accuracy
- Precision, Recall, and F1 metrics for classification
"""

from typing import Any, Dict, List, Sequence, Tuple


def levenshtein_distance(s1: Sequence[Any], s2: Sequence[Any]) -> int:
    """Compute the Levenshtein edit distance between two sequences (chars or tokens)."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def calculate_cer(reference: str, hypothesis: str) -> float:
    """
    Calculate Character Error Rate (CER).
    CER = Levenshtein(ref, hyp) / max(1, len(ref))
    """
    ref = reference.strip()
    hyp = hypothesis.strip()
    if not ref:
        return 0.0 if not hyp else 1.0
    dist = levenshtein_distance(ref, hyp)
    return dist / len(ref)


def calculate_wer(reference: str, hypothesis: str) -> float:
    """
    Calculate Word Error Rate (WER).
    WER = Levenshtein(ref_words, hyp_words) / max(1, len(ref_words))
    """
    ref_words = reference.strip().split()
    hyp_words = hypothesis.strip().split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0
    dist = levenshtein_distance(ref_words, hyp_words)
    return dist / len(ref_words)


def calculate_iou(
    box_a: Tuple[float, float, float, float],
    box_b: Tuple[float, float, float, float],
) -> float:
    """
    Calculate Intersection over Union (IoU) between two bounding boxes: (x1, y1, x2, y2).
    """
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    intersection = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - intersection

    if union <= 0.0:
        return 0.0
    return intersection / union


def calculate_pairwise_order_accuracy(
    gold_order: List[str],
    pred_order: List[str],
) -> float:
    """
    Calculate pairwise ranking order accuracy between predicted and gold region sequences.
    For each pair (A, B) in gold where A appears before B, checks if A appears before B in pred.
    Returns float in range [0.0, 1.0].
    """
    if len(gold_order) <= 1:
        return 1.0

    pred_index = {item_id: idx for idx, item_id in enumerate(pred_order)}
    common_items = [item for item in gold_order if item in pred_index]

    if len(common_items) <= 1:
        return 1.0

    total_pairs = 0
    correct_pairs = 0

    for i in range(len(common_items)):
        for j in range(i + 1, len(common_items)):
            a = common_items[i]
            b = common_items[j]
            total_pairs += 1
            if pred_index[a] < pred_index[b]:
                correct_pairs += 1

    return correct_pairs / total_pairs if total_pairs > 0 else 1.0


def calculate_classification_metrics(
    gold_labels: List[str],
    pred_labels: List[str],
) -> Dict[str, float]:
    """Calculate micro/macro precision, recall, and F1 for classification."""
    if len(gold_labels) != len(pred_labels) or not gold_labels:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    classes = sorted(list(set(gold_labels).union(set(pred_labels))))
    f1_scores = []
    precisions = []
    recalls = []

    for c in classes:
        tp = sum(1 for g, p in zip(gold_labels, pred_labels, strict=False) if g == c and p == c)
        fp = sum(1 for g, p in zip(gold_labels, pred_labels, strict=False) if g != c and p == c)
        fn = sum(1 for g, p in zip(gold_labels, pred_labels, strict=False) if g == c and p != c)

        prec = tp / (tp + fp) if (tp + fp) > 0 else (1.0 if fn == 0 else 0.0)
        rec = tp / (tp + fn) if (tp + fn) > 0 else 1.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        precisions.append(prec)
        recalls.append(rec)
        f1_scores.append(f1)

    return {
        "macro_precision": sum(precisions) / len(precisions) if precisions else 0.0,
        "macro_recall": sum(recalls) / len(recalls) if recalls else 0.0,
        "macro_f1": sum(f1_scores) / len(f1_scores) if f1_scores else 0.0,
    }
