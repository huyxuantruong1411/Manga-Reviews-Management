# API Routes Reference

> **Generated Statically**: Do not edit manually.
> Run `python scripts/generate_api_routes.py` to regenerate.

Total Endpoints Discovered: **190**

| Method | Path | Handler | Tags | Source File | In Schema |
|:---|:---|:---|:---|:---|:---:|
| `POST` | `/api/ai/generate` | `generate_ai_content` | AI | [`ai.py:90`](../../backend/routers/ai.py#L90) | Yes |
| `POST` | `/api/ai/preview` | `preview_ai_request` | AI | [`ai.py:47`](../../backend/routers/ai.py#L47) | Yes |
| `GET` | `/api/analytics` | `get_all_analytics` | Analytics | [`analytics.py:93`](../../backend/routers/analytics.py#L93) | Yes |
| `GET` | `/api/analytics/completed-timeline` | `get_completed_timeline` | Analytics | [`analytics.py:418`](../../backend/routers/analytics.py#L418) | Yes |
| `GET` | `/api/analytics/creators-details` | `get_creators_details` | Analytics | [`analytics.py:522`](../../backend/routers/analytics.py#L522) | Yes |
| `GET` | `/api/analytics/manga-timeline` | `get_manga_timeline` | Analytics | [`analytics.py:309`](../../backend/routers/analytics.py#L309) | Yes |
| `GET` | `/api/analytics/overview` | `get_overview` | Analytics | [`analytics.py:165`](../../backend/routers/analytics.py#L165) | Yes |
| `GET` | `/api/analytics/review-corpus/download` | `download_review_corpus` | Analytics | [`analytics.py:593`](../../backend/routers/analytics.py#L593) | Yes |
| `POST` | `/api/analytics/review-corpus/export` | `export_review_corpus` | Analytics | [`analytics.py:580`](../../backend/routers/analytics.py#L580) | Yes |
| `GET` | `/api/analytics/review-corpus/summary` | `get_review_corpus_summary` | Analytics | [`analytics.py:570`](../../backend/routers/analytics.py#L570) | Yes |
| `GET` | `/api/analytics/review-timeline` | `get_review_timeline` | Analytics | [`analytics.py:362`](../../backend/routers/analytics.py#L362) | Yes |
| `GET` | `/api/analytics/reviews-management` | `get_reviews_management` | Analytics | [`analytics.py:657`](../../backend/routers/analytics.py#L657) | Yes |
| `GET` | `/api/analytics/score-distribution` | `get_score_distribution` | Analytics | [`analytics.py:213`](../../backend/routers/analytics.py#L213) | Yes |
| `GET` | `/api/analytics/tags-details` | `get_tags_details` | Analytics | [`analytics.py:474`](../../backend/routers/analytics.py#L474) | Yes |
| `GET` | `/api/analytics/top-tags` | `get_top_tags` | Analytics | [`analytics.py:261`](../../backend/routers/analytics.py#L261) | Yes |
| `GET` | `/api/audit-logs` | `list_audit_logs` | audit-logs | [`audit_logs.py:28`](../../backend/routers/audit_logs.py#L28) | Yes |
| `GET` | `/api/audit-logs/actions` | `get_audit_actions` | audit-logs | [`audit_logs.py:63`](../../backend/routers/audit_logs.py#L63) | Yes |
| `GET` | `/api/audit-logs/stats` | `get_audit_stats` | audit-logs | [`audit_logs.py:69`](../../backend/routers/audit_logs.py#L69) | Yes |
| `GET` | `/api/audit-logs/{log_id}` | `get_audit_log_by_id` | audit-logs | [`audit_logs.py:75`](../../backend/routers/audit_logs.py#L75) | Yes |
| `PUT` | `/api/chapter-slots/{slot_id}/preferred` | `set_preferred_slot_release` | Chapters & Reader | [`chapters.py:101`](../../backend/routers/chapters.py#L101) | Yes |
| `DELETE` | `/api/chapters/{chapter_id}` | `delete_chapter` | Chapters & Reader | [`chapters.py:136`](../../backend/routers/chapters.py#L136) | Yes |
| `GET` | `/api/chapters/{chapter_id}` | `get_chapter` | Chapters & Reader | [`chapters.py:121`](../../backend/routers/chapters.py#L121) | Yes |
| `PATCH` | `/api/chapters/{chapter_id}` | `update_single_chapter_metadata` | Chapters & Reader | [`chapters.py:155`](../../backend/routers/chapters.py#L155) | Yes |
| `POST` | `/api/chapters/{chapter_id}/delete-pages` | `delete_chapter_pages` | Chapters & Reader | [`chapters.py:202`](../../backend/routers/chapters.py#L202) | Yes |
| `GET` | `/api/creators/suggestions` | `get_suggestions` | Creators | [`creators.py:12`](../../backend/routers/creators.py#L12) | Yes |
| `GET` | `/api/creators/{creator_name}/tierlists` | `list_creator_tierlists` | Creator Tierlists | [`tierlists.py:104`](../../backend/routers/tierlists.py#L104) | Yes |
| `POST` | `/api/creators/{creator_name}/tierlists` | `create_creator_tierlist` | Creator Tierlists | [`tierlists.py:118`](../../backend/routers/tierlists.py#L118) | Yes |
| `GET` | `/api/creators/{creator_name}/tierlists/compare` | `compare_creator_tierlists` | Creator Tierlists | [`tierlists.py:83`](../../backend/routers/tierlists.py#L83) | Yes |
| `GET` | `/api/creators/{name}` | `get_creator` | Creators | [`creators.py:22`](../../backend/routers/creators.py#L22) | Yes |
| `GET` | `/api/datasources` | `list_datasources` | Datasources | [`datasources.py:29`](../../backend/routers/datasources.py#L29) | Yes |
| `POST` | `/api/datasources/resolve` | `resolve_source_work` | Datasources | [`datasources.py:38`](../../backend/routers/datasources.py#L38) | Yes |
| `GET` | `/api/datasources/{provider_name}/releases/{work_id}` | `list_source_releases` | Datasources | [`datasources.py:72`](../../backend/routers/datasources.py#L72) | Yes |
| `GET` | `/api/dictionary/define/{word}` | `define_word` | vision | [`vision.py:512`](../../backend/routers/vision.py#L512) | Yes |
| `GET` | `/api/download-plans/{plan_id}` | `get_download_plan` | Downloads | [`downloads.py:338`](../../backend/routers/downloads.py#L338) | Yes |
| `POST` | `/api/download-plans/{plan_id}/execute` | `execute_download_plan` | Downloads | [`downloads.py:349`](../../backend/routers/downloads.py#L349) | Yes |
| `GET` | `/api/downloads/base-path` | `get_base_path` | Downloads | [`downloads.py:29`](../../backend/routers/downloads.py#L29) | Yes |
| `PUT` | `/api/downloads/base-path` | `update_base_path` | Downloads | [`downloads.py:42`](../../backend/routers/downloads.py#L42) | Yes |
| `GET` | `/api/downloads/tasks` | `list_download_tasks` | Downloads | [`downloads.py:260`](../../backend/routers/downloads.py#L260) | Yes |
| `DELETE` | `/api/downloads/tasks/{task_id}` | `delete_download_task` | Downloads | [`downloads.py:293`](../../backend/routers/downloads.py#L293) | Yes |
| `GET` | `/api/downloads/tasks/{task_id}` | `get_download_task` | Downloads | [`downloads.py:266`](../../backend/routers/downloads.py#L266) | Yes |
| `POST` | `/api/downloads/tasks/{task_id}/cancel` | `cancel_download_task` | Downloads | [`downloads.py:275`](../../backend/routers/downloads.py#L275) | Yes |
| `POST` | `/api/downloads/tasks/{task_id}/resume` | `resume_download_task` | Downloads | [`downloads.py:284`](../../backend/routers/downloads.py#L284) | Yes |
| `POST` | `/api/downloads/verify-path` | `verify_download_path` | Downloads | [`downloads.py:74`](../../backend/routers/downloads.py#L74) | Yes |
| `POST` | `/api/image-tools/convert-format` | `convert_format` | Image Tools | [`image_tools.py:119`](../../backend/routers/image_tools.py#L119) | Yes |
| `POST` | `/api/image-tools/delete-duplicates` | `delete_duplicates` | Image Tools | [`image_tools.py:102`](../../backend/routers/image_tools.py#L102) | Yes |
| `GET` | `/api/image-tools/file` | `get_local_image_file` | Image Tools | [`image_tools.py:153`](../../backend/routers/image_tools.py#L153) | Yes |
| `GET` | `/api/image-tools/manga/{manga_id}/download-path` | `get_manga_download_path` | Image Tools | [`image_tools.py:127`](../../backend/routers/image_tools.py#L127) | Yes |
| `POST` | `/api/image-tools/scan-duplicates` | `scan_duplicates` | Image Tools | [`image_tools.py:93`](../../backend/routers/image_tools.py#L93) | Yes |
| `POST` | `/api/image-tools/scan-format` | `scan_format` | Image Tools | [`image_tools.py:110`](../../backend/routers/image_tools.py#L110) | Yes |
| `GET` | `/api/image-tools/scan-progress` | `get_scan_progress` | Image Tools | [`image_tools.py:87`](../../backend/routers/image_tools.py#L87) | Yes |
| `GET` | `/api/manga` | `list_mangas` | Manga | [`manga.py:41`](../../backend/routers/manga.py#L41) | Yes |
| `GET` | `/api/manga` | `list_mangas` | Manga | [`manga.py:41`](../../backend/routers/manga.py#L41) | No (Alias) |
| `POST` | `/api/manga/dex` | `add_manga_from_dex` | Manga | [`manga.py:122`](../../backend/routers/manga.py#L122) | Yes |
| `POST` | `/api/manga/import-from-recommendation` | `import_manga_from_rec` | Recommendations | [`recommendations.py:51`](../../backend/routers/recommendations.py#L51) | Yes |
| `POST` | `/api/manga/manual` | `add_manga_manually` | Manga | [`manga.py:159`](../../backend/routers/manga.py#L159) | Yes |
| `GET` | `/api/manga/resolve-reference/{identifier}` | `resolve_manga_reference` | Manga | [`manga.py:113`](../../backend/routers/manga.py#L113) | Yes |
| `DELETE` | `/api/manga/{manga_id}` | `delete_manga` | Manga | [`manga.py:207`](../../backend/routers/manga.py#L207) | Yes |
| `GET` | `/api/manga/{manga_id}` | `get_manga` | Manga | [`manga.py:104`](../../backend/routers/manga.py#L104) | Yes |
| `PUT` | `/api/manga/{manga_id}` | `update_manga` | Manga | [`manga.py:180`](../../backend/routers/manga.py#L180) | Yes |
| `GET` | `/api/manga/{manga_id}/chapter-slots` | `get_manga_chapter_slots` | Chapters & Reader | [`chapters.py:76`](../../backend/routers/chapters.py#L76) | Yes |
| `GET` | `/api/manga/{manga_id}/chapter-slots/coverage` | `get_manga_chapter_slots_coverage` | Chapters & Reader | [`chapters.py:89`](../../backend/routers/chapters.py#L89) | Yes |
| `GET` | `/api/manga/{manga_id}/chapters` | `get_manga_chapters` | Chapters & Reader | [`chapters.py:63`](../../backend/routers/chapters.py#L63) | Yes |
| `POST` | `/api/manga/{manga_id}/chapters/batch-metadata` | `batch_update_chapters_metadata` | Chapters & Reader | [`chapters.py:171`](../../backend/routers/chapters.py#L171) | Yes |
| `POST` | `/api/manga/{manga_id}/chapters/sync-metadata` | `sync_manga_chapters_metadata` | Chapters & Reader | [`chapters.py:191`](../../backend/routers/chapters.py#L191) | Yes |
| `POST` | `/api/manga/{manga_id}/cleanup-latest-chapter` | `cleanup_latest_chapter` | Chapters & Reader | [`chapters.py:317`](../../backend/routers/chapters.py#L317) | Yes |
| `DELETE` | `/api/manga/{manga_id}/covers` | `delete_manga_covers` | Cover Arts | [`cover_arts.py:33`](../../backend/routers/cover_arts.py#L33) | Yes |
| `GET` | `/api/manga/{manga_id}/covers` | `get_manga_covers` | Cover Arts | [`cover_arts.py:9`](../../backend/routers/cover_arts.py#L9) | Yes |
| `POST` | `/api/manga/{manga_id}/covers/sync` | `sync_manga_covers` | Cover Arts | [`cover_arts.py:21`](../../backend/routers/cover_arts.py#L21) | Yes |
| `POST` | `/api/manga/{manga_id}/download` | `download_manga_chapters` | Downloads | [`downloads.py:157`](../../backend/routers/downloads.py#L157) | Yes |
| `POST` | `/api/manga/{manga_id}/download-plans` | `create_manga_download_plan` | Downloads | [`downloads.py:307`](../../backend/routers/downloads.py#L307) | Yes |
| `POST` | `/api/manga/{manga_id}/enrich-trackers` | `enrich_manga_tracker_metadata` | Manga | [`manga.py:230`](../../backend/routers/manga.py#L230) | Yes |
| `GET` | `/api/manga/{manga_id}/export/download/{export_id}` | `download_manga_export` | Chapters & Reader | [`chapters.py:348`](../../backend/routers/chapters.py#L348) | Yes |
| `POST` | `/api/manga/{manga_id}/export/open-folder` | `open_export_folder_in_explorer` | Chapters & Reader | [`chapters.py:362`](../../backend/routers/chapters.py#L362) | Yes |
| `POST` | `/api/manga/{manga_id}/export/stream` | `export_manga_chapters_stream` | Chapters & Reader | [`chapters.py:334`](../../backend/routers/chapters.py#L334) | Yes |
| `GET` | `/api/manga/{manga_id}/history` | `get_manga_history` | Manga | [`manga.py:242`](../../backend/routers/manga.py#L242) | Yes |
| `POST` | `/api/manga/{manga_id}/import-folder` | `import_local_folder` | Chapters & Reader | [`chapters.py:226`](../../backend/routers/chapters.py#L226) | Yes |
| `POST` | `/api/manga/{manga_id}/import-folder-stream` | `import_local_folder_stream` | Chapters & Reader | [`chapters.py:246`](../../backend/routers/chapters.py#L246) | Yes |
| `POST` | `/api/manga/{manga_id}/metadata/apply` | `apply_metadata_merge` | Metadata | [`metadata.py:61`](../../backend/routers/metadata.py#L61) | Yes |
| `GET` | `/api/manga/{manga_id}/metadata/locks` | `get_metadata_locks` | Metadata | [`metadata.py:93`](../../backend/routers/metadata.py#L93) | Yes |
| `PUT` | `/api/manga/{manga_id}/metadata/locks` | `update_metadata_locks` | Metadata | [`metadata.py:114`](../../backend/routers/metadata.py#L114) | Yes |
| `POST` | `/api/manga/{manga_id}/metadata/preview` | `preview_metadata_merge` | Metadata | [`metadata.py:33`](../../backend/routers/metadata.py#L33) | Yes |
| `DELETE` | `/api/manga/{manga_id}/panels` | `delete_manga_panels` | vision | [`vision.py:237`](../../backend/routers/vision.py#L237) | Yes |
| `GET` | `/api/manga/{manga_id}/panels/report` | `generate_manga_panels_report` | vision | [`vision.py:330`](../../backend/routers/vision.py#L330) | Yes |
| `GET` | `/api/manga/{manga_id}/panels/search` | `search_manga_panels` | vision | [`vision.py:289`](../../backend/routers/vision.py#L289) | Yes |
| `GET` | `/api/manga/{manga_id}/panels/stats` | `get_manga_panels_stats` | vision | [`vision.py:319`](../../backend/routers/vision.py#L319) | Yes |
| `GET` | `/api/manga/{manga_id}/reading-progress` | `get_reading_progress` | Chapters & Reader | [`chapters.py:286`](../../backend/routers/chapters.py#L286) | Yes |
| `POST` | `/api/manga/{manga_id}/reading-progress` | `save_reading_progress` | Chapters & Reader | [`chapters.py:296`](../../backend/routers/chapters.py#L296) | Yes |
| `GET` | `/api/manga/{manga_id}/recommendations` | `get_recommendations` | Recommendations | [`recommendations.py:15`](../../backend/routers/recommendations.py#L15) | Yes |
| `POST` | `/api/manga/{manga_id}/recommendations/sync` | `force_sync_recommendations` | Recommendations | [`recommendations.py:27`](../../backend/routers/recommendations.py#L27) | Yes |
| `GET` | `/api/manga/{manga_id}/reviews` | `list_reviews` | Reviews | [`reviews.py:59`](../../backend/routers/reviews.py#L59) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews` | `create_review` | Reviews | [`reviews.py:79`](../../backend/routers/reviews.py#L79) | Yes |
| `GET` | `/api/manga/{manga_id}/reviews/media/{bucket}/{filename:path}` | `get_review_media` | Reviews | [`reviews.py:273`](../../backend/routers/reviews.py#L273) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-image` | `upload_review_image` | Reviews | [`reviews.py:282`](../../backend/routers/reviews.py#L282) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-image-url` | `upload_image_from_url` | Reviews | [`reviews.py:320`](../../backend/routers/reviews.py#L320) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-media` | `upload_review_media` | Reviews | [`reviews.py:440`](../../backend/routers/reviews.py#L440) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-video` | `upload_review_video` | Reviews | [`reviews.py:370`](../../backend/routers/reviews.py#L370) | Yes |
| `DELETE` | `/api/manga/{manga_id}/reviews/{review_id}` | `delete_review` | Reviews | [`reviews.py:165`](../../backend/routers/reviews.py#L165) | Yes |
| `PUT` | `/api/manga/{manga_id}/reviews/{review_id}` | `update_review` | Reviews | [`reviews.py:118`](../../backend/routers/reviews.py#L118) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/{review_id}/cleanup` | `cleanup_review_tabs` | Reviews | [`reviews.py:198`](../../backend/routers/reviews.py#L198) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/{review_id}/finalize` | `finalize_review` | Reviews | [`reviews.py:532`](../../backend/routers/reviews.py#L532) | Yes |
| `POST` | `/api/manga/{manga_id}/scan-folder` | `scan_local_folder` | Chapters & Reader | [`chapters.py:215`](../../backend/routers/chapters.py#L215) | Yes |
| `POST` | `/api/manga/{manga_id}/scan-panels` | `trigger_manga_scan` | vision | [`vision.py:195`](../../backend/routers/vision.py#L195) | Yes |
| `POST` | `/api/manga/{manga_id}/scan-panels/cancel` | `cancel_manga_panels_scan` | vision | [`vision.py:227`](../../backend/routers/vision.py#L227) | Yes |
| `GET` | `/api/manga/{manga_id}/scan-progress` | `stream_scan_progress` | vision | [`vision.py:257`](../../backend/routers/vision.py#L257) | Yes |
| `GET` | `/api/manga/{manga_id}/scan-status` | `get_scan_status` | vision | [`vision.py:251`](../../backend/routers/vision.py#L251) | Yes |
| `POST` | `/api/manga/{manga_id}/scan/cancel` | `cancel_manga_panels_scan` | vision | [`vision.py:227`](../../backend/routers/vision.py#L227) | Yes |
| `GET` | `/api/manga/{manga_id}/sources` | `get_manga_sources` | Manga | [`manga.py:249`](../../backend/routers/manga.py#L249) | Yes |
| `POST` | `/api/manga/{manga_id}/sources` | `link_manga_source` | Manga | [`manga.py:255`](../../backend/routers/manga.py#L255) | Yes |
| `DELETE` | `/api/manga/{manga_id}/sources/{source}` | `unlink_manga_source` | Manga | [`manga.py:275`](../../backend/routers/manga.py#L275) | Yes |
| `GET` | `/api/manga/{manga_id}/storage-duplicates` | `get_storage_duplicates` | Chapters & Reader | [`chapters.py:264`](../../backend/routers/chapters.py#L264) | Yes |
| `POST` | `/api/manga/{manga_id}/storage-duplicates/cleanup` | `cleanup_storage_duplicates` | Chapters & Reader | [`chapters.py:275`](../../backend/routers/chapters.py#L275) | Yes |
| `POST` | `/api/manga/{manga_id}/sync` | `sync_manga_metadata` | Manga | [`manga.py:221`](../../backend/routers/manga.py#L221) | Yes |
| `GET` | `/api/mangadex/manga/{mangadex_id}/basic-info` | `get_external_manga_basic_info` | Recommendations | [`recommendations.py:39`](../../backend/routers/recommendations.py#L39) | Yes |
| `GET` | `/api/mangadex/manga/{mangadex_id}/chapters` | `get_manga_chapters` | MangaDex Proxy | [`mangadex.py:29`](../../backend/routers/mangadex.py#L29) | Yes |
| `GET` | `/api/mangadex/manga/{mangadex_id}/languages` | `get_manga_languages` | MangaDex Proxy | [`mangadex.py:19`](../../backend/routers/mangadex.py#L19) | Yes |
| `GET` | `/api/mangadex/search` | `search_mangadex` | MangaDex Proxy | [`mangadex.py:9`](../../backend/routers/mangadex.py#L9) | Yes |
| `DELETE` | `/api/panels/all` | `delete_all_panels` | vision | [`vision.py:133`](../../backend/routers/vision.py#L133) | Yes |
| `GET` | `/api/panels/mangas` | `get_scanned_manga_list` | vision | [`vision.py:97`](../../backend/routers/vision.py#L97) | Yes |
| `POST` | `/api/panels/scan` | `trigger_global_library_scan` | vision | [`vision.py:107`](../../backend/routers/vision.py#L107) | Yes |
| `GET` | `/api/panels/scan-progress` | `stream_global_scan_progress` | vision | [`vision.py:160`](../../backend/routers/vision.py#L160) | Yes |
| `GET` | `/api/panels/scan-status` | `get_global_scan_status` | vision | [`vision.py:154`](../../backend/routers/vision.py#L154) | Yes |
| `POST` | `/api/panels/scan/cancel` | `cancel_global_library_scan` | vision | [`vision.py:144`](../../backend/routers/vision.py#L144) | Yes |
| `GET` | `/api/panels/search` | `search_all_panels` | vision | [`vision.py:56`](../../backend/routers/vision.py#L56) | Yes |
| `GET` | `/api/panels/stats` | `get_global_panels_stats` | vision | [`vision.py:86`](../../backend/routers/vision.py#L86) | Yes |
| `GET` | `/api/panels/{panel_id}` | `get_panel_detail` | vision | [`vision.py:378`](../../backend/routers/vision.py#L378) | Yes |
| `GET` | `/api/panels/{panel_id}/crop` | `get_panel_crop` | vision | [`vision.py:423`](../../backend/routers/vision.py#L423) | Yes |
| `POST` | `/api/panels/{panel_id}/narrate` | `narrate_panel` | vision | [`vision.py:528`](../../backend/routers/vision.py#L528) | Yes |
| `POST` | `/api/panels/{panel_id}/ocr-async` | `enqueue_panel_ocr_by_id` | Tasks | [`tasks.py:172`](../../backend/routers/tasks.py#L172) | Yes |
| `GET` | `/api/panels/{panel_id}/page-image` | `get_panel_page_raw` | vision | [`vision.py:473`](../../backend/routers/vision.py#L473) | Yes |
| `POST` | `/api/sync/abort-active` | `abort_active_syncs` | Sync Manager | [`sync_manager.py:212`](../../backend/routers/sync_manager.py#L212) | Yes |
| `POST` | `/api/sync/batch` | `sync_batch` | Sync Manager | [`sync_manager.py:203`](../../backend/routers/sync_manager.py#L203) | Yes |
| `GET` | `/api/sync/logs` | `get_logs` | Sync Manager | [`sync_manager.py:222`](../../backend/routers/sync_manager.py#L222) | Yes |
| `GET` | `/api/sync/pools` | `get_pools` | Sync Manager | [`sync_manager.py:106`](../../backend/routers/sync_manager.py#L106) | Yes |
| `POST` | `/api/sync/pools` | `create_pool` | Sync Manager | [`sync_manager.py:115`](../../backend/routers/sync_manager.py#L115) | Yes |
| `DELETE` | `/api/sync/pools/{pool_id}` | `delete_pool` | Sync Manager | [`sync_manager.py:158`](../../backend/routers/sync_manager.py#L158) | Yes |
| `GET` | `/api/sync/pools/{pool_id}` | `get_pool` | Sync Manager | [`sync_manager.py:126`](../../backend/routers/sync_manager.py#L126) | Yes |
| `PUT` | `/api/sync/pools/{pool_id}` | `update_pool` | Sync Manager | [`sync_manager.py:142`](../../backend/routers/sync_manager.py#L142) | Yes |
| `POST` | `/api/sync/pools/{pool_id}/execute` | `execute_pool` | Sync Manager | [`sync_manager.py:179`](../../backend/routers/sync_manager.py#L179) | Yes |
| `POST` | `/api/sync/pools/{pool_id}/preview` | `preview_pool` | Sync Manager | [`sync_manager.py:170`](../../backend/routers/sync_manager.py#L170) | Yes |
| `GET` | `/api/sync/runs` | `get_sync_runs` | Sync Manager | [`sync_manager.py:293`](../../backend/routers/sync_manager.py#L293) | Yes |
| `POST` | `/api/sync/runs` | `create_sync_run` | Sync Manager | [`sync_manager.py:240`](../../backend/routers/sync_manager.py#L240) | Yes |
| `PUT` | `/api/sync/runs/{run_id}` | `update_sync_run` | Sync Manager | [`sync_manager.py:265`](../../backend/routers/sync_manager.py#L265) | Yes |
| `GET` | `/api/sync/settings` | `get_system_settings` | Sync Manager | [`sync_manager.py:77`](../../backend/routers/sync_manager.py#L77) | Yes |
| `PUT` | `/api/sync/settings` | `update_system_settings` | Sync Manager | [`sync_manager.py:90`](../../backend/routers/sync_manager.py#L90) | Yes |
| `POST` | `/api/sync/single` | `sync_single` | Sync Manager | [`sync_manager.py:189`](../../backend/routers/sync_manager.py#L189) | Yes |
| `GET` | `/api/sync/stats` | `get_stats` | Sync Manager | [`sync_manager.py:231`](../../backend/routers/sync_manager.py#L231) | Yes |
| `GET` | `/api/tags` | `list_tags` | Tags | [`tags.py:15`](../../backend/routers/tags.py#L15) | Yes |
| `POST` | `/api/tags` | `create_custom_tag` | Tags | [`tags.py:44`](../../backend/routers/tags.py#L44) | Yes |
| `DELETE` | `/api/tags/{tag_id}` | `delete_custom_tag` | Tags | [`tags.py:74`](../../backend/routers/tags.py#L74) | Yes |
| `PUT` | `/api/tags/{tag_id}` | `update_tag` | Tags | [`tags.py:95`](../../backend/routers/tags.py#L95) | Yes |
| `POST` | `/api/tasks/ocr` | `enqueue_ocr_task` | Tasks | [`tasks.py:128`](../../backend/routers/tasks.py#L128) | No (Alias) |
| `GET` | `/api/tasks/{task_id}` | `get_task_status` | Tasks | [`tasks.py:110`](../../backend/routers/tasks.py#L110) | No (Alias) |
| `GET` | `/api/tierlists/manga/{manga_id}/cover-image` | `stream_cover_image` | Creator Tierlists | [`tierlists.py:47`](../../backend/routers/tierlists.py#L47) | Yes |
| `GET` | `/api/tierlists/manga/{manga_id}/cover-options` | `get_manga_cover_options` | Creator Tierlists | [`tierlists.py:35`](../../backend/routers/tierlists.py#L35) | Yes |
| `DELETE` | `/api/tierlists/{tierlist_id}` | `delete_tierlist` | Creator Tierlists | [`tierlists.py:199`](../../backend/routers/tierlists.py#L199) | Yes |
| `GET` | `/api/tierlists/{tierlist_id}` | `get_tierlist` | Creator Tierlists | [`tierlists.py:136`](../../backend/routers/tierlists.py#L136) | Yes |
| `PUT` | `/api/tierlists/{tierlist_id}` | `update_tierlist` | Creator Tierlists | [`tierlists.py:148`](../../backend/routers/tierlists.py#L148) | Yes |
| `POST` | `/api/tierlists/{tierlist_id}/auto-seed` | `auto_seed_tierlist` | Creator Tierlists | [`tierlists.py:187`](../../backend/routers/tierlists.py#L187) | Yes |
| `POST` | `/api/tierlists/{tierlist_id}/clone` | `clone_tierlist` | Creator Tierlists | [`tierlists.py:169`](../../backend/routers/tierlists.py#L169) | Yes |
| `POST` | `/api/translation/assets/cleanup` | `preview_or_run_cleanup` | Translation Studio | [`translation.py:240`](../../backend/routers/translation.py#L240) | Yes |
| `GET` | `/api/translation/assets/resolve-url` | `resolve_asset_url` | Translation Studio | [`translation.py:260`](../../backend/routers/translation.py#L260) | Yes |
| `POST` | `/api/translation/assets/upload-demo` | `upload_demo_asset` | Translation Studio | [`translation.py:246`](../../backend/routers/translation.py#L246) | Yes |
| `GET` | `/api/translation/assets/usage` | `get_storage_usage` | Translation Studio | [`translation.py:234`](../../backend/routers/translation.py#L234) | Yes |
| `GET` | `/api/translation/bindings/{chapter_id}` | `get_chapter_bindings` | Translation Studio | [`translation.py:270`](../../backend/routers/translation.py#L270) | Yes |
| `GET` | `/api/translation/capabilities` | `get_capabilities` | Translation Studio | [`translation.py:51`](../../backend/routers/translation.py#L51) | Yes |
| `GET` | `/api/translation/export/{chapter_id}` | `export_chapter_translation` | Translation Studio | [`translation.py:406`](../../backend/routers/translation.py#L406) | Yes |
| `GET` | `/api/translation/fonts` | `list_fonts` | Translation Studio | [`translation.py:193`](../../backend/routers/translation.py#L193) | Yes |
| `POST` | `/api/translation/fonts` | `upload_font` | Translation Studio | [`translation.py:199`](../../backend/routers/translation.py#L199) | Yes |
| `POST` | `/api/translation/fonts/import-local` | `import_local_fonts` | Translation Studio | [`translation.py:218`](../../backend/routers/translation.py#L218) | Yes |
| `GET` | `/api/translation/jobs` | `list_jobs` | Translation Studio | [`translation.py:63`](../../backend/routers/translation.py#L63) | Yes |
| `POST` | `/api/translation/jobs` | `create_translation_job` | Translation Studio | [`translation.py:57`](../../backend/routers/translation.py#L57) | Yes |
| `GET` | `/api/translation/jobs/{job_id}` | `get_job_status` | Translation Studio | [`translation.py:76`](../../backend/routers/translation.py#L76) | Yes |
| `POST` | `/api/translation/jobs/{job_id}/cancel` | `cancel_translation_job` | Translation Studio | [`translation.py:91`](../../backend/routers/translation.py#L91) | Yes |
| `GET` | `/api/translation/jobs/{job_id}/pages` | `get_job_pages` | Translation Studio | [`translation.py:85`](../../backend/routers/translation.py#L85) | Yes |
| `POST` | `/api/translation/jobs/{job_id}/retry` | `retry_translation_job` | Translation Studio | [`translation.py:97`](../../backend/routers/translation.py#L97) | Yes |
| `GET` | `/api/translation/profiles` | `list_profiles` | Translation Studio | [`translation.py:106`](../../backend/routers/translation.py#L106) | Yes |
| `POST` | `/api/translation/profiles` | `create_profile` | Translation Studio | [`translation.py:116`](../../backend/routers/translation.py#L116) | Yes |
| `GET` | `/api/translation/profiles/{profile_id}` | `get_profile` | Translation Studio | [`translation.py:122`](../../backend/routers/translation.py#L122) | Yes |
| `PUT` | `/api/translation/profiles/{profile_id}` | `update_profile` | Translation Studio | [`translation.py:131`](../../backend/routers/translation.py#L131) | Yes |
| `GET` | `/api/translation/profiles/{profile_id}/diff` | `diff_profile_revisions` | Translation Studio | [`translation.py:156`](../../backend/routers/translation.py#L156) | Yes |
| `GET` | `/api/translation/profiles/{profile_id}/export` | `export_profile` | Translation Studio | [`translation.py:169`](../../backend/routers/translation.py#L169) | Yes |
| `GET` | `/api/translation/profiles/{profile_id}/revisions` | `get_profile_revisions` | Translation Studio | [`translation.py:150`](../../backend/routers/translation.py#L150) | Yes |
| `GET` | `/api/translation/providers` | `list_providers` | Translation Studio | [`translation.py:184`](../../backend/routers/translation.py#L184) | Yes |
| `GET` | `/api/translation/results/{result_id}` | `get_translation_result` | Translation Studio | [`translation.py:323`](../../backend/routers/translation.py#L323) | Yes |
| `POST` | `/api/translation/results/{result_id}/publish` | `publish_result` | Translation Studio | [`translation.py:385`](../../backend/routers/translation.py#L385) | Yes |
| `POST` | `/api/translation/results/{result_id}/regions` | `update_result_regions` | Translation Studio | [`translation.py:343`](../../backend/routers/translation.py#L343) | Yes |
| `POST` | `/api/translation/results/{result_id}/rerender` | `rerender_result` | Translation Studio | [`translation.py:362`](../../backend/routers/translation.py#L362) | Yes |
| `GET` | `/health` | `health_check` | - | [`main.py:119`](../../backend/main.py#L119) | Yes |
| `POST` | `/tasks/ocr` | `enqueue_ocr_task` | Tasks | [`tasks.py:128`](../../backend/routers/tasks.py#L128) | Yes |
| `GET` | `/tasks/{task_id}` | `get_task_status` | Tasks | [`tasks.py:110`](../../backend/routers/tasks.py#L110) | Yes |
