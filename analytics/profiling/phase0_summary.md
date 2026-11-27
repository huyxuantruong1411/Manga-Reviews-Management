# Phase 0 Readiness Summary

| Insight Family | Target Gold Mart | Schema Support | Live Data Volume | Readiness Status | Key Caveats & Controls |
|---|---|---|---|---|---|
| A. Taste calibration | `gld_taste_calibration` | Verified | 2,864 manga, 574 rated, 79 tags, 3,035 creators | **Ready** | 20.04% rating coverage; must expose Bayesian shrinkage + raw mean + denominator |
| B. Tag synergy | `gld_tag_synergy` | Verified | 2,864 manga, 19,574 tag links (0 dangling) | **Ready** | Dedupe tags per manga; enforce minimum pair support & BH/FDR adjustment |
| C. Series completion friction | `gld_series_completion_friction` | Verified | 1,795 manga with declared `chapters` | **Ready** | `chapters` is external metadata count; stratify ongoing vs completed; right-censored |
| D. Creator consistency | `gld_creator_consistency` | Verified | 6,258 embedded refs, 6,232 matched canonical UUIDs | **Ready** | Keep author/artist roles separate; 6 duplicate names require UUID joins |
| E. Review aspect profile | `gld_review_aspect_profile` | Verified | 603 active reviews across 481 manga | **Ready (mention-only)** | Deterministic dictionary mentions only; sentiment shares gated; raw prose stays private |
| F. Backlog velocity | `gld_backlog_velocity` | Verified | 2,864 manga, 1,108 `update_status` audits (34.99%) | **Ready (partial history)** | Report `status_event_coverage_rate`; mask immature cohort cells |
| G. Metadata health | `gld_metadata_health` | Verified | 2,864 manga (`published_*` ~52%, `provenance` 6) | **Ready** | Separate presence/null rates from provenance & cross-source conflicts |
| H. External consensus gap | `gld_external_consensus_gap` | Verified | 41 tracker-enriched + 23 ext reviews (9 manga) | **Degraded / Sparse** | Separate MAL/AniList aggregate (0–10 vs 0–100) from `external_reviews`; low-n flags |
| I. OCR lexical atlas | `gld_ocr_lexical_atlas` | Verified | 80 panels, 30 scanned pages, 1 manga | **Insufficient Data** | Only 0.047% of 64,014 pages scanned; build model with explicit `insufficient_data` guard |

## Excluded Capabilities (Not Supported by Source Data)
- Reading speed, dwell time, session duration, pacing fatigue (`reading_progress` is snapshot-only).
- Review-derived personality or psychological profiling.
- Causal inference from observational collection ratings.
- Longitudinal tierlist rank movement (`creator_tierlists` has mutable `revision` counter only, 2 boards).
