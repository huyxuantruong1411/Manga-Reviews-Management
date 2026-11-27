# 04 — Phase 3: Gold Insight Marts

## Objective

Build a small set of flat, documented, stable Gold datasets that answer the questions in `07-INSIGHT-CATALOG.md`. Every mart reads Silver only and is suitable for export to Perspective.

## Gold contract

Every mart must carry or be described by:

- `as_of_date`, `release_id`, `metric_definition_version`;
- explicit row grain and natural key;
- denominator and eligible population where relevant;
- `sample_size` / `entity_count` and source coverage;
- `reliability_status` (`insufficient_data`, `low`, `medium`, `high`) with thresholds documented;
- `quality_warning_count` or specific quality flags;
- no raw private text, media URL or nested source object.

Use flat columns. Keep calculations in DuckDB `DOUBLE`/integer/date/time types; round only for presentation/export. No nested arrays or structs in Arrow mart schema.

## 3.1 `gld_taste_calibration`

**Question:** Which attributes are associated with high or low personal ratings, and are these differences stable enough to trust?

**Candidate grains:** one row per `dimension_type × dimension_value × cohort/filter bucket` (for example tag, demographic, language, creator role).

Measures:

- manga rated count, total manga count, rating coverage;
- raw mean/median rating;
- global mean/median baseline;
- Bayesian/shrinkage mean toward global baseline;
- rating dispersion and confidence interval;
- completed-only and all-rated variants where meaningful.

Do not call a tag a “preference” where sample size is very small or rating coverage is poor. Show raw mean and shrunk estimate together. Do not equate correlation with causation.

## 3.2 `gld_tag_synergy`

**Question:** Which tag pairs co-occur unusually often, and which combinations are associated with rating differences?

**Grain:** one row per unordered tag pair within eligible manga population.

Measures: co-occurrence count, support, confidence(A→B), confidence(B→A), lift, smoothed PMI/log-lift, number of rated items, pair mean rating, baseline rating difference and uncertainty.

Rules:

- deduplicate tags within manga before pair generation;
- require minimum pair support calibrated from Phase 0 counts;
- apply smoothing and minimum denominator thresholds;
- use Benjamini–Hochberg/FDR or clearly label exploratory unadjusted ranking when many pairs are tested;
- do not describe a positive rating lift as “tag causes better manga”.

## 3.3 `gld_series_completion_friction`

**Question:** Are long-running or metadata-heavy series associated with a higher observed drop/on-hold/unread share or slower completion in this library?

This replaces unsupported `gld_pacing_fatigue`.

**Grain:** one row per chapter-count bucket × publication status × optional demographic.

Potential features: declared external chapter count, declared volume count, publication status, year, personal read status, completed-event presence and acquisition-to-completion days where valid.

Rules:

- explicitly label chapter/volume counts as metadata estimates, not local downloaded chapter counts;
- exclude or separately stratify ongoing/incomplete works from completed publication cohorts;
- handle right-censoring: unread/reading manga have not necessarily failed to complete;
- show denominator, sample size, and maturity window;
- do not call this “fatigue” or infer a psychological cause.

## 3.4 `gld_creator_consistency`

**Question:** How consistent are personal ratings across works by the same author/artist, and which creators have enough evidence to stand out?

**Grain:** one row per canonical creator × role.

Measures: distinct manga, rated manga, rating coverage, mean/median, within-creator standard deviation/IQR, Bayesian/shrinkage mean, interval, high/low rating share.

Rules:

- author vs artist roles stay separate; a creator may have both;
- use only high-confidence creator identity links for ranked comparisons; show unresolved names separately;
- enforce minimum rated-manga count;
- do not collapse creators by name-only fuzzy matching.

## 3.5 `gld_review_aspect_profile`

**Question:** What subjects recur in the user's reviews, and what aspect-level evidence tends to appear in reviews of higher- or lower-rated manga?

This replaces over-strong `gld_review_psychology`.

**Grain:** one row per aspect × rating band × review-status cohort, plus optional review-level evidence table with IDs only.

Measures: reviews mentioning aspect, manga count, mention rate, evidence count, sentiment share only after validation, average associated manga rating and confidence.

Rules:

- do not classify user personality, psychology or mental health;
- no sentiment share before annotated evaluation passes per language;
- distinguish “mention” from “praise/criticism”; neutral mentions must not be forced positive/negative;
- review text remains private in the local warehouse; Arrow receives only aggregates and opaque IDs;
- aspect taxonomy version and classifier method are exposed.

## 3.6 `gld_backlog_velocity`

**Question:** How does the manga collection move from acquisition to reading/completion, and how old is the current backlog?

**Grain:** cohort month × age bucket or status transition month × destination status.

Measures: acquisition count, observed completion count, completion curve at eligible cohort ages, median acquisition-to-completion days, backlog age percentiles, status transition counts, audit coverage.

Rules:

- use audit event timestamps or verified status timestamps; document source precedence;
- do not interpret manga currently not completed as permanently abandoned;
- cohort age windows must be mature; return NULL/`not_matured` where insufficient observation time;
- report event-history coverage alongside completion metrics.

## 3.7 `gld_metadata_health`

**Question:** Which metadata dimensions are incomplete, conflicting, stale or weakly sourced?

**Grain:** one row per field × source × optional content group, plus per-manga quality flags.

Measures: presence rate, null/missing rate, source provenance distribution, locked-field rate, conflict rate, unresolved creator/tag links, stale source freshness and completeness score.

Keep field completeness and data correctness separate. A filled value may still conflict with another source.

## 3.8 `gld_external_consensus_gap`

**Question:** Which manga have personal ratings materially above/below the available external consensus, and how robust is that gap?

**Grain:** one row per manga × provider source.

Keep separate:

- provider aggregate score (e.g. enriched MAL `score` in manga tracker metadata if present);
- individual `external_reviews.overall_rating` mean/median;
- personal `mangas.personal_rating`.

Measures: personal score, external aggregate score, individual-review mean/median, external review count, recommendation share, preliminary/spoiler share, score gap, last sync time and reliability label.

Rules:

- scale-normalize only after verifying source scale;
- do not blend aggregate MAL score and individual review mean into one score;
- external crawled reviews are a convenience sample, not a random community sample;
- require sample size and freshness thresholds; show missing external data as NULL, not zero.

## 3.9 `gld_ocr_lexical_atlas`

**Question:** What vocabulary, grammatical and lexical patterns appear in the portions of manga actually scanned?

**Grain:** manga × language × scan mode × pipeline version, optionally chapter-level drill-down.

Measures: eligible/scanned pages, coverage, panel count, OCR text presence, token occurrences, unique lemma count, POS distribution, MATTR when sequence/order is valid, distinctive-term TF-IDF, vocabulary growth over valid chapter order.

Rules:

- compare only compatible language, model/pipeline version and scan mode;
- distinguish token occurrence from lemma membership;
- normalize by scanned page/token coverage; never compare raw count alone across uneven scan sizes;
- use source sequence order only when OCR reading order is available and validated;
- do not call OCR corpus “the full manga text”.

## Verification gate — Phase 3

- [ ] Nine mart definitions and their grains are documented.
- [ ] Every Gold mart reads Silver only.
- [ ] Every mart has denominator/sample-size/reliability fields or a clear dimension-only contract.
- [ ] Tag pair support, multiple comparisons and shrinkage behavior are tested.
- [ ] Cohort curves handle immature cohorts and right-censored items.
- [ ] Creator scoring uses canonical/high-confidence identities.
- [ ] Review aspect analysis has an evaluation gate; no unsupported psychology claim.
- [ ] Personal vs external aggregate vs external individual-review scores remain separate.
- [ ] OCR analysis reports scan coverage and compatible pipeline dimensions.
- [ ] All Gold marts have flat, stable column schemas and dbt tests.
