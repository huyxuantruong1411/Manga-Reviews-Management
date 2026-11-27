# 07 — Insight Catalog: Research Questions, Evidence and Interpretation

This catalog describes what the workbench should answer. An insight is enabled only when the Phase 0 profile and Phase 2 Silver quality gates prove the required data is available.

## A. Taste calibration

**Question:** Which genres/tags, demographics, languages and creator roles are associated with consistently high personal ratings?

**Hypothesis candidates:**

- Some tag combinations may be associated with higher ratings than the library-wide baseline.
- The user's rated manga may be concentrated in a narrow subset of tags/demographics.
- A tag that appears often may not be one that receives high ratings.

**Transformations:** manga-tag bridge → deduplicated tag membership → rating population → group-level rating distribution → shrinkage estimate and confidence interval.

**Visuals:** ranked forest/dot plot with intervals, tag-pair matrix, rating distribution by selected attribute.

**Guardrails:** minimum rated sample, shrinkage, missing-rating coverage, FDR on many tested groups. No causal language.

## B. Tag synergy and niche combinations

**Question:** Which combinations of tags occur more often than independence would suggest, and how do their ratings compare with baseline?

**Transformations:** tag array dedupe → pair generation per manga → support/confidence/lift/PMI → rating subset → smoothing and multiple-testing correction.

**Visuals:** pair heatmap, network of supported pairs, sortable evidence table.

**Guardrails:** use support threshold tied to library size; do not rank a pair with tiny support; avoid claiming genre combination causes a higher score.

## C. Long-series completion friction

**Question:** Does expected published chapter count relate to observed completion/drop/on-hold distribution in this collection?

**Transformations:** verified declared chapter/volume counts → count buckets → read-status and verified completion events → maturity and publication-status stratification.

**Visuals:** status composition by length bucket; completion-latency distribution where event history supports it.

**Guardrails:** this is collection-level association, not “reader fatigue”; metadata counts may be stale and ongoing works are right-censored. No `pacing_fatigue` metric from reading-progress snapshots.

## D. Creator consistency

**Question:** Which creators have consistently high/low personal ratings across enough rated works?

**Transformations:** canonical creator bridge → role separation → rated manga aggregation → shrinkage/dispersion/interval → unresolved identity bucket.

**Visuals:** dot plot with interval and count; author/artist switch; creator work list drill-down.

**Guardrails:** canonical IDs or high-confidence matches only; minimum rated works; do not conflate author and artist roles.

## E. Review aspect profile

**Question:** Which aspects recur in reviews, and how do mention patterns differ across rating bands?

**Transformations:** TipTap JSON → plain text extraction → sentence/paragraph parsing → aspect dictionary or evaluated classifier → mention evidence aggregation.

**Visuals:** aspect mention matrix by rating band; review count by aspect; optional evidence IDs.

**Guardrails:** mention is not sentiment. Sentiment must pass a multilingual annotated evaluation gate. Do not infer personality, mental state or psychological traits. Raw review text remains private.

## F. Backlog and collection journey

**Question:** How fast does the collection move from acquisition into completed status, and how old is the active backlog?

**Transformations:** acquisition cohort → verified status transitions → event coverage → time-to-completion → censor-aware cohort curves and backlog age percentiles.

**Visuals:** cohort heatmap with immature cells blank; status transition flow; backlog age distribution.

**Guardrails:** active/uncompleted does not mean abandoned; use event coverage and maturity rules. `reading_progress.updated_at` is not a session duration.

## G. Metadata health and provenance

**Question:** Which metadata fields are missing, conflicting, stale or weakly attributed to a source?

**Transformations:** source fields + metadata provenance + locks → normalized field presence/conflict/freshness → health dimensions.

**Visuals:** field completeness grid; provenance distribution; stale/conflict list with manga drill-down.

**Guardrails:** completeness ≠ correctness. A field can be present and still be wrong/conflicting.

## H. Personal versus external consensus

**Question:** Which titles are meaningful outliers between personal rating and external consensus?

**Transformations:** separate provider aggregate metadata score from individual external-review scores → scale verification → dedupe reviews → sample/freshness qualification → score gap.

**Visuals:** personal-vs-external scatter with diagonal baseline; outlier table with review count/source/freshness.

**Guardrails:** crawled review corpus is not a random sample; do not blend MAL aggregate score with per-review score; external score can be missing/stale.

## I. OCR lexical atlas

**Question:** What vocabulary/grammatical patterns occur in the scanned portions of the manga library?

**Transformations:** current page scan join → page/hash coverage → vocabulary occurrence explosion → language/pipeline stratification → TF-IDF/MATTR/POS shares.

**Visuals:** coverage panel, distinctive terms, vocabulary growth across valid chapter order, POS distribution.

**Guardrails:** scan only; OCR quality bias; avoid comparing across language/model/mode without controls; token rows must not dominate by series length; no raw dialogue export by default.

## Excluded from MVP until instrumentation/data supports it

- Reading session duration, page dwell time, true reading speed and session pacing: require explicit session start/end and page/chapter progress events.
- Psychological profile or personality analysis from review text: out of scope and not a valid interpretation of this dataset.
- Causal effect of tags, creators, chapter length or themes on enjoyment: observational personal collection data cannot establish causality.
- Longitudinal tierlist movement: requires immutable tierlist version history, not just a mutable `revision` counter.
