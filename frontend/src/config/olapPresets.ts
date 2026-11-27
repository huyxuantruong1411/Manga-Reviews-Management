import type { ViewerConfigUpdate } from "@perspective-dev/viewer";

export interface OlapInsightPreset {
	id: string;
	datasetName: string;
	tabLabel: string;
	title: string;
	question: string;
	denominatorDesc: string;
	formulaNotes: string;
	caveats: string;
	defaultConfig: ViewerConfigUpdate;
	gridFallbackConfig: ViewerConfigUpdate;
}

export const OLAP_INSIGHT_PRESETS: OlapInsightPreset[] = [
	{
		id: "taste-calibration",
		datasetName: "gld_taste_calibration",
		tabLabel: "Taste Calibration",
		title: "A. Taste Calibration (Shrinkage vs Raw Mean)",
		question:
			"Which tags, demographics, languages, and content ratings are associated with higher personal ratings after accounting for small sample sizes?",
		denominatorDesc:
			"rated_manga_count / total_manga_count within cohort_scope (all_library vs completed_only).",
		formulaNotes:
			"shrunk_mean = (n * raw_mean + 10 * global_mean) / (n + 10). Shows raw mean beside shrunk estimate.",
		caveats:
			"Observational association only; small groups shrink strongly toward the library baseline.",
		defaultConfig: {
			plugin: "Y Bar",
			group_by: ["dimension_value"],
			split_by: [],
			columns: ["shrunk_mean_personal_rating", "raw_mean_personal_rating"],
			filter: [
				["cohort_scope", "==", "all_library"],
				["dimension_type", "==", "tag"],
				["rated_manga_count", ">=", 5],
			],
			sort: [["shrunk_mean_personal_rating", "desc"]],
			aggregates: {
				shrunk_mean_personal_rating: "avg",
				raw_mean_personal_rating: "avg",
			},
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"dimension_type",
				"dimension_value",
				"cohort_scope",
				"total_manga_count",
				"rated_manga_count",
				"rating_coverage_rate",
				"raw_mean_personal_rating",
				"shrunk_mean_personal_rating",
				"shrunk_lift_vs_baseline",
				"reliability_status",
			],
			filter: [["rated_manga_count", ">=", 3]],
			sort: [["shrunk_mean_personal_rating", "desc"]],
		},
	},
	{
		id: "tag-synergy",
		datasetName: "gld_tag_synergy",
		tabLabel: "Tag Synergy",
		title: "B. Tag Synergy & Co-Occurrence Lift",
		question:
			"Which unordered tag pairs co-occur more often than independence suggests, and how do their rated subsets compare with baseline?",
		denominatorDesc:
			"Unordered tag pairs with co_occurrence_count >= 5 out of eligible_manga_count (N=2,864); min_support_met requires >= 15.",
		formulaNotes:
			"lift = P(A,B) / (P(A)P(B)); smoothed_pmi = ln(((nAB + 0.5)*(N + 1)) / ((nA + 0.5)*(nB + 0.5))).",
		caveats:
			"Exploratory unadjusted pair ranking across many pairs; positive rating lift is not causal.",
		defaultConfig: {
			plugin: "X/Y Scatter",
			group_by: [],
			split_by: [],
			columns: [
				"smoothed_pmi",
				"shrunk_rating_lift",
				"reliability_status",
				"co_occurrence_count",
				"tag_label_a",
			],
			filter: [
				["min_support_met", "==", true],
				["rated_pair_count", ">=", 5],
			],
			sort: [["smoothed_pmi", "desc"]],
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"tag_label_a",
				"tag_label_b",
				"co_occurrence_count",
				"support",
				"lift",
				"smoothed_pmi",
				"rated_pair_count",
				"pair_raw_mean_rating",
				"shrunk_pair_mean_rating",
				"shrunk_rating_lift",
				"reliability_status",
			],
			filter: [["min_support_met", "==", true]],
			sort: [["smoothed_pmi", "desc"]],
		},
	},
	{
		id: "completion-friction",
		datasetName: "gld_series_completion_friction",
		tabLabel: "Series Length",
		title: "C. Long-Series Completion Friction",
		question:
			"Does external declared chapter count relate to observed completion, drop/on-hold, or unread shares across publication cohorts?",
		denominatorDesc:
			"Completed / dropped / active manga divided by eligible_manga_count in each length_bucket x publication_status_cohort.",
		formulaNotes:
			"Wilson 95% CI on observed_completion_share; ongoing works stratified separately from completed publications.",
		caveats:
			"Uses external metadata declared chapter counts (not local downloaded chapters); unread/reading works are right-censored.",
		defaultConfig: {
			plugin: "Y Bar",
			group_by: ["length_bucket"],
			split_by: ["publication_status_cohort"],
			columns: ["observed_completion_share"],
			filter: [
				["demographic_scope", "==", "all"],
				[
					"publication_status_cohort",
					"in",
					["completed_publication", "ongoing_or_hiatus"],
				],
			],
			sort: [["length_bucket", "asc"]],
			aggregates: { observed_completion_share: "avg" },
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"length_bucket",
				"publication_status_cohort",
				"demographic_scope",
				"eligible_manga_count",
				"completed_count",
				"observed_completion_share",
				"completion_ci95_lower",
				"completion_ci95_upper",
				"drop_or_hold_share",
				"right_censored_active_share",
				"median_acquisition_to_completion_days",
				"reliability_status",
			],
			filter: [["demographic_scope", "==", "all"]],
			sort: [["length_bucket_order", "asc"]],
		},
	},
	{
		id: "creator-consistency",
		datasetName: "gld_creator_consistency",
		tabLabel: "Creator Consistency",
		title: "D. Creator Rating Consistency (Canonical UUID)",
		question:
			"Which authors and artists have consistently high or low personal ratings across multiple rated works?",
		denominatorDesc:
			"Canonical creator x role pairs with distinct_manga_count >= 2 or rated_work_count >= 1; ranked requires high identity confidence and >= 3 rated works.",
		formulaNotes:
			"Authors and artists are kept separate; shrinkage prior k=5 toward library mean.",
		caveats:
			"Never merges creators by fuzzy display name; small portfolios remain marked low/insufficient_data.",
		defaultConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"creator_name",
				"role",
				"distinct_manga_count",
				"rated_work_count",
				"rating_coverage_rate",
				"raw_mean_rating",
				"shrunk_mean_rating",
				"rating_stddev",
				"rating_iqr",
				"high_rated_share",
				"identity_confidence",
				"reliability_status",
			],
			filter: [["is_ranked_eligible", "==", true]],
			sort: [["shrunk_mean_rating", "desc"]],
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"creator_name",
				"role",
				"distinct_manga_count",
				"rated_work_count",
				"raw_mean_rating",
				"shrunk_mean_rating",
				"rating_stddev",
				"reliability_status",
			],
			filter: [["rated_work_count", ">=", 2]],
			sort: [["shrunk_mean_rating", "desc"]],
		},
	},
	{
		id: "review-aspects",
		datasetName: "gld_review_aspect_profile",
		tabLabel: "Review Aspects",
		title: "E. Review Aspect Profile (Mention-Only)",
		question:
			"Which manga critique aspects recur across personal reviews, and how do mention rates vary across personal rating bands?",
		denominatorDesc:
			"aspect_review_count / active_review_count within review_cohort x rating_band (rates do not sum to 100% since reviews mention multiple aspects).",
		formulaNotes:
			"Bilingual EN+VI dictionary matcher v1.0.0 over TipTap plain text; Wilson 95% CI on mention rate.",
		caveats:
			"Observable aspect mentions only; sentiment shares are disabled pending multilingual evaluation; zero psychological inference.",
		defaultConfig: {
			plugin: "Y Bar",
			group_by: ["aspect"],
			split_by: ["rating_band"],
			columns: ["aspect_mention_rate"],
			filter: [
				["review_cohort", "==", "all_active"],
				["rating_band", "!=", "unrated"],
			],
			sort: [["aspect_mention_rate", "desc"]],
			aggregates: { aspect_mention_rate: "avg" },
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"aspect",
				"rating_band",
				"review_cohort",
				"active_review_count",
				"aspect_review_count",
				"aspect_mention_rate",
				"mention_ci95_lower",
				"mention_ci95_upper",
				"aspect_evidence_count",
				"avg_associated_manga_rating",
				"sentiment_enabled",
				"reliability_status",
			],
			filter: [["review_cohort", "==", "all_active"]],
			sort: [["aspect_mention_rate", "desc"]],
		},
	},
	{
		id: "backlog-velocity",
		datasetName: "gld_backlog_velocity",
		tabLabel: "Backlog Velocity",
		title: "F. Backlog Velocity & Cohort Completion",
		question:
			"How quickly do monthly acquisition cohorts reach completion at 30/90/180-day horizons, and how old is the unread backlog?",
		denominatorDesc:
			"completed_within_window_count / mature_eligible_count; immature cohorts return NULL cohort_completion_rate.",
		formulaNotes:
			"Uses earliest audit completion event or manga.completed_at; reports status_event_coverage_rate beside completion.",
		caveats:
			"Status audit coverage is partial (34.99% overall); unread items are active backlog, not permanently abandoned.",
		defaultConfig: {
			plugin: "Heatmap",
			group_by: ["cohort_month"],
			split_by: ["milestone_window_days"],
			columns: ["cohort_completion_rate"],
			filter: [["is_cohort_matured", "==", true]],
			sort: [["cohort_month", "asc"]],
			aggregates: { cohort_completion_rate: "avg" },
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"cohort_month",
				"milestone_window_days",
				"cohort_acquisition_count",
				"mature_eligible_count",
				"is_cohort_matured",
				"completed_within_window_count",
				"cohort_completion_rate",
				"status_event_coverage_rate",
				"current_unread_count",
				"median_unread_backlog_age_days",
				"p90_unread_backlog_age_days",
				"reliability_status",
			],
			filter: [],
			sort: [
				["cohort_month", "asc"],
				["milestone_window_days", "asc"],
			],
		},
	},
	{
		id: "metadata-health",
		datasetName: "gld_metadata_health",
		tabLabel: "Metadata Health",
		title: "G. Metadata Completeness & Provenance Health",
		question:
			"Which metadata dimensions are incomplete, stale, locked, or missing provenance across language slices?",
		denominatorDesc:
			"present_count / eligible_manga_count per field_name x slice_group.",
		formulaNotes:
			"Tracks presence separately from provenance attribution, locks, staleness (>30d), and unresolved tag/creator links.",
		caveats:
			"Field presence does not prove accuracy; a populated field can still conflict across sources.",
		defaultConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"slice_group",
				"field_name",
				"field_category",
				"eligible_manga_count",
				"present_count",
				"missing_or_null_count",
				"field_presence_rate",
				"completeness_tier",
				"provenance_attributed_count",
				"locked_manga_count",
				"stale_count",
				"unresolved_or_low_conf_links",
				"reliability_status",
			],
			filter: [["slice_group", "==", "all_mangas"]],
			sort: [["field_presence_rate", "asc"]],
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"slice_group",
				"field_name",
				"field_presence_rate",
				"completeness_tier",
				"missing_or_null_count",
				"stale_count",
			],
			filter: [],
			sort: [["field_presence_rate", "asc"]],
		},
	},
	{
		id: "external-consensus",
		datasetName: "gld_external_consensus_gap",
		tabLabel: "External Consensus",
		title: "H. Personal vs External Consensus Gap",
		question:
			"Which manga show material gaps between personal rating and MAL/AniList aggregate scores or crawled external reviews?",
		denominatorDesc:
			"manga_id x provider_source (myanimelist_aggregate, anilist_aggregate, myanimelist_reviews).",
		formulaNotes:
			"AniList 0-100 normalized to 0-10; aggregate scores never blended with individual crawled reviews.",
		caveats:
			"Sparse sample (41 tracker-enriched, 23 individual reviews across 9 manga); crawled reviews are a convenience sample.",
		defaultConfig: {
			plugin: "X/Y Scatter",
			group_by: [],
			split_by: [],
			columns: [
				"external_score_normalized_10",
				"personal_rating",
				"provider_source",
				"abs_gap",
				"manga_title",
			],
			filter: [["personal_rating", "is not null", null]],
			sort: [["abs_gap", "desc"]],
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"manga_title",
				"provider_source",
				"score_kind",
				"personal_rating",
				"external_score_raw",
				"external_score_scale",
				"external_score_normalized_10",
				"personal_external_gap",
				"abs_gap",
				"external_sample_count",
				"recommendation_share",
				"freshness_days",
				"reliability_status",
			],
			filter: [],
			sort: [["abs_gap", "desc"]],
		},
	},
	{
		id: "ocr-lexical-atlas",
		datasetName: "gld_ocr_lexical_atlas",
		tabLabel: "OCR Lexical Atlas",
		title: "I. OCR Lexical Atlas (Coverage-Gated)",
		question:
			"What vocabulary volume, lemma diversity, and POS shares appear in OCR-scanned chapter pages?",
		denominatorDesc:
			"current_scanned_pages / eligible_downloaded_pages per manga_id x language x scan_mode x pipeline_version.",
		formulaNotes:
			"token_occurrence_count sums vocabulary[].frequency; unique_lemma_count counts distinct lemmas[].",
		caveats:
			"Covers scanned pages only (currently 1 manga, 30 of 64,014 pages = 0.047%); marked insufficient_data.",
		defaultConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"manga_title",
				"language",
				"scan_mode",
				"pipeline_version",
				"eligible_downloaded_pages",
				"current_scanned_pages",
				"stale_scanned_pages",
				"page_scan_coverage_rate",
				"panel_count",
				"token_occurrence_count",
				"unique_lemma_count",
				"type_token_ratio",
				"tokens_per_scanned_page",
				"noun_share",
				"verb_share",
				"adj_share",
				"reliability_status",
			],
			filter: [],
			sort: [["current_scanned_pages", "desc"]],
		},
		gridFallbackConfig: {
			plugin: "Datagrid",
			group_by: [],
			split_by: [],
			columns: [
				"manga_title",
				"language",
				"scan_mode",
				"pipeline_version",
				"current_scanned_pages",
				"page_scan_coverage_rate",
				"token_occurrence_count",
				"unique_lemma_count",
				"reliability_status",
			],
			filter: [],
			sort: [["current_scanned_pages", "desc"]],
		},
	},
];
