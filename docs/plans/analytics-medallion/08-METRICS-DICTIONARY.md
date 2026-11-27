# 08 — Metrics Dictionary and Statistical Rules

All metric names, definitions and denominator rules must be versioned. SQL model aliases should match the stable names in this file. A metric without an explicit denominator is not ready for Gold.

## General statistical conventions

- `count`: count unique entities at the stated grain, not raw joined rows.
- `coverage_rate`: numerator / eligible denominator; expose both counts.
- NULL means unavailable/unknown. Zero means observed none.
- Never divide by zero; return NULL plus a quality state.
- Report `n` and denominator beside rate/mean.
- For proportions, prefer Wilson intervals over normal approximations when sample sizes are modest.
- For subgroup mean ratings, consider shrinkage toward the global mean. Always show raw mean and shrunk estimate side by side.
- When ranking many tags/creators/pairs, use a minimum sample threshold and false-discovery control (e.g. Benjamini–Hochberg) or label results exploratory.
- No observational metric is causal.

## Taste metrics

### `rated_manga_count`
Distinct manga in scope with non-NULL `personal_rating`.

### `rating_coverage_rate`
`rated_manga_count / eligible_manga_count`.

### `raw_mean_personal_rating`
Arithmetic mean of valid personal ratings in scope. Rating scale must remain at verified 0–10 (0.5 step) unless Phase 0 proves otherwise.

### `shrunk_mean_personal_rating`
A reliability-adjusted group mean shrunk toward library/global mean. Store prior strength `k` in model metadata and test behavior with tiny and large sample groups.

### `rating_lift_vs_baseline`
`group_mean_rating - baseline_mean_rating`; use both raw and shrunk variant. Not causal.

## Tag synergy metrics

For a manga set of size `N`, tag A count `nA`, tag B count `nB`, pair count `nAB`:

- `support(A,B) = nAB / N`
- `confidence(A→B) = nAB / nA`
- `confidence(B→A) = nAB / nB`
- `lift(A,B) = (nAB / N) / ((nA / N) * (nB / N))`
- `pmi(A,B) = log((nAB * N) / (nA * nB))`, with smoothing when necessary.

Exclude same-tag pairs and duplicate tag IDs inside one manga. Publish pair count, support and eligible manga count.

## Long-series metrics

### `declared_chapter_count`
External metadata declared number of chapters on the manga record. Never substitute local downloaded chapter count.

### `length_bucket`
Explicitly versioned bucket definitions, calibrated after profiling (avoid arbitrary fixed buckets if library distribution is skewed).

### `observed_completion_share`
Completed manga / eligible manga in bucket, for a defined population. Ongoing/unreleased or immature titles must be separated or explicitly handled.

### `acquisition_to_completion_days`
Selected valid completion event time minus `added_at`. Only positive/zero intervals with valid event and timestamp coverage qualify. This is collection lifecycle time, not active reading time.

## Creator metrics

### `creator_rated_work_count`
Distinct manga with valid rating linked to the canonical creator/role.

### `creator_rating_dispersion`
IQR or standard deviation of personal ratings. Always provide n.

### `creator_shrunk_rating`
Shrinkage-adjusted mean using a shared prior. Do not rank creators below the minimum rated work threshold.

## Review aspect metrics

### `aspect_review_count`
Distinct active personal reviews with at least one matched mention of an aspect.

### `aspect_mention_rate`
`aspect_review_count / active_review_count` within the eligible scope. One review may mention many aspects, so rates across aspects need not sum to 100%.

### `aspect_evidence_count`
Number of matched spans/evidence units. Keep separate from distinct reviews.

### `aspect_positive_share` / `aspect_negative_share`
Only enabled after classifier validation. Denominator is classified evidence units (positive + neutral + negative); unknown/uncertain is excluded and reported. Do not present as user's psychological state.

## Backlog and cohort metrics

### `backlog_age_days`
`as_of_date - added_at` for manga currently in the configured backlog states. Define whether `on_hold` and `dropped` are included; do not silently combine them with unread/plan-to-read.

### `cohort_completion_rate_at_age_t`
For acquisition cohort `c`, numerator is manga completed by cohort age `t`; denominator is only manga with sufficient follow-up to observe the full age window, unless a formal survival estimator is used. If cohort age is not mature, return NULL/`not_matured`, not 0%.

### `status_transition_count`
Distinct valid audit events transitioning `from_status → to_status` in the period. Normalize enums but preserve raw values.

### `status_event_coverage_rate`
Manga with usable event history / eligible manga. Report by cohort/creation period; older data may have weaker coverage.

## Metadata quality metrics

### `field_presence_rate`
Documents with a non-empty valid value / eligible documents for that field.

### `field_conflict_rate`
Documents where verified source values conflict / documents with more than one comparable source value.

### `field_freshness_days`
`as_of_date - source_updated_at` where a valid source timestamp is present. Never substitute manga `updated_at` for source-specific freshness without evidence.

### `creator_resolution_rate`
Manga-creator bridge rows resolved to canonical creator IDs / all eligible creator bridge rows. Expose confidence tiers.

## External consensus metrics

### `external_review_mean` / `external_review_median`
Mean/median valid `external_reviews.overall_rating` per manga × source. Exclude NULL/invalid scores; show n. Do not confuse with provider aggregate score.

### `provider_aggregate_score`
Separate metadata score (e.g. provider aggregate in tracker metadata) with provider, scale and `last_enriched_at`.

### `personal_external_gap`
`personal_rating - external_score_on_same_scale`. If scales differ, normalize only with verified mapping and retain original scales. Missing source score → NULL.

### `recommendation_share`
`recommended / count(reviews with known recommendation_status)`. Unknown excluded from denominator; preliminary/spoiler flags remain filterable.

## OCR metrics

### `eligible_page_count`
Distinct pages in locally available chapter page inventory for selected manga/source/language scope. Not all pages published by the external source.

### `current_scanned_page_count`
Distinct eligible pages with scan state that matches current page hash/revision and is accepted under the selected pipeline version.

### `page_scan_coverage_rate`
`current_scanned_page_count / eligible_page_count`.

### `token_occurrence_count`
Sum of normalized `vocabulary[]` token occurrences. Verify the `frequency` semantics before using `sum(frequency)`; if each list item is one token, count rows.

### `unique_lemma_count`
Distinct non-empty normalized lemma, partitioned by language and NLP pipeline version.

### `POS_share`
Token occurrences with a POS label / token occurrences with known POS. Report unknown POS separately.

### `MATTR(w)`
For an ordered token sequence of length `T` and window width `w`:

`MATTR(w) = average(unique(token[i:i+w]) / w)` for every contiguous window.

Only calculate when `T >= w`, token order is verified, and all tokens use compatible normalization. Choose and version `w`; it is not directly comparable across languages without calibration.

### `distinctive_term_tfidf`
Use document = manga or chapter and define corpus scope, language, pipeline version and minimum document frequency. TF-IDF measures distinctiveness within the selected scanned corpus, not thematic importance in the full manga.

## Tierlist metrics

### `tier_position_index`
Zero-based row order from the current tierlist document (or one-based, but choose one and document). Do not map tier labels S/A/B to numeric scores unless configured by the user.

### `spearman_rating_tier_rho`
Spearman correlation between personal rating and tier order for rated manga in one creator/tierlist scope. Since lower row index normally means a higher tier, define direction explicitly. Require minimum paired sample and show n.

## Reliability status

Define thresholds after Phase 0 profiling. A candidate starting policy for review by the agent:

- `insufficient_data`: denominator or sample below minimum.
- `low`: sample meets minimum but source coverage/identity confidence is poor or interval is wide.
- `medium`: usable sample and quality coverage, with moderate uncertainty.
- `high`: sufficiently large sample, robust coverage and stable interval under sensitivity checks.

Do not hard-code universal minimum `n=5` or `n=10` without assessing the dataset. Store thresholds/config and sensitivity results with the mart.
