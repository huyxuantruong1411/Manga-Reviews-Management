# API Routes Reference

> **Generated Statically**: Do not edit manually.
> Run `python scripts/generate_api_routes.py` to regenerate.

Total Endpoints Discovered: **126**

| Method | Path | Handler | Tags | Source File | In Schema |
|:---|:---|:---|:---|:---|:---:|
| `POST` | `/api/ai/generate` | `generate_ai_content` | AI | [`ai.py:90`](../../backend/routers/ai.py#L90) | Yes |
| `POST` | `/api/ai/preview` | `preview_ai_request` | AI | [`ai.py:47`](../../backend/routers/ai.py#L47) | Yes |
| `GET` | `/api/analytics` | `get_all_analytics` | Analytics | [`analytics.py:83`](../../backend/routers/analytics.py#L83) | Yes |
| `GET` | `/api/analytics/completed-timeline` | `get_completed_timeline` | Analytics | [`analytics.py:408`](../../backend/routers/analytics.py#L408) | Yes |
| `GET` | `/api/analytics/creators-details` | `get_creators_details` | Analytics | [`analytics.py:512`](../../backend/routers/analytics.py#L512) | Yes |
| `GET` | `/api/analytics/manga-timeline` | `get_manga_timeline` | Analytics | [`analytics.py:299`](../../backend/routers/analytics.py#L299) | Yes |
| `GET` | `/api/analytics/overview` | `get_overview` | Analytics | [`analytics.py:155`](../../backend/routers/analytics.py#L155) | Yes |
| `GET` | `/api/analytics/review-timeline` | `get_review_timeline` | Analytics | [`analytics.py:352`](../../backend/routers/analytics.py#L352) | Yes |
| `GET` | `/api/analytics/score-distribution` | `get_score_distribution` | Analytics | [`analytics.py:203`](../../backend/routers/analytics.py#L203) | Yes |
| `GET` | `/api/analytics/tags-details` | `get_tags_details` | Analytics | [`analytics.py:464`](../../backend/routers/analytics.py#L464) | Yes |
| `GET` | `/api/analytics/top-tags` | `get_top_tags` | Analytics | [`analytics.py:251`](../../backend/routers/analytics.py#L251) | Yes |
| `GET` | `/api/audit-logs` | `list_audit_logs` | audit-logs | [`audit_logs.py:28`](../../backend/routers/audit_logs.py#L28) | Yes |
| `GET` | `/api/audit-logs/actions` | `get_audit_actions` | audit-logs | [`audit_logs.py:63`](../../backend/routers/audit_logs.py#L63) | Yes |
| `GET` | `/api/audit-logs/stats` | `get_audit_stats` | audit-logs | [`audit_logs.py:69`](../../backend/routers/audit_logs.py#L69) | Yes |
| `GET` | `/api/audit-logs/{log_id}` | `get_audit_log_by_id` | audit-logs | [`audit_logs.py:75`](../../backend/routers/audit_logs.py#L75) | Yes |
| `DELETE` | `/api/chapters/{chapter_id}` | `delete_chapter` | Chapters & Reader | [`chapters.py:63`](../../backend/routers/chapters.py#L63) | Yes |
| `GET` | `/api/chapters/{chapter_id}` | `get_chapter` | Chapters & Reader | [`chapters.py:48`](../../backend/routers/chapters.py#L48) | Yes |
| `POST` | `/api/chapters/{chapter_id}/delete-pages` | `delete_chapter_pages` | Chapters & Reader | [`chapters.py:89`](../../backend/routers/chapters.py#L89) | Yes |
| `GET` | `/api/creators/suggestions` | `get_suggestions` | Creators | [`creators.py:12`](../../backend/routers/creators.py#L12) | Yes |
| `GET` | `/api/creators/{name}` | `get_creator` | Creators | [`creators.py:22`](../../backend/routers/creators.py#L22) | Yes |
| `GET` | `/api/dictionary/define/{word}` | `define_word` | vision | [`vision.py:512`](../../backend/routers/vision.py#L512) | Yes |
| `GET` | `/api/downloads/base-path` | `get_base_path` | Downloads | [`downloads.py:21`](../../backend/routers/downloads.py#L21) | Yes |
| `PUT` | `/api/downloads/base-path` | `update_base_path` | Downloads | [`downloads.py:34`](../../backend/routers/downloads.py#L34) | Yes |
| `GET` | `/api/downloads/tasks` | `list_download_tasks` | Downloads | [`downloads.py:252`](../../backend/routers/downloads.py#L252) | Yes |
| `DELETE` | `/api/downloads/tasks/{task_id}` | `delete_download_task` | Downloads | [`downloads.py:285`](../../backend/routers/downloads.py#L285) | Yes |
| `GET` | `/api/downloads/tasks/{task_id}` | `get_download_task` | Downloads | [`downloads.py:258`](../../backend/routers/downloads.py#L258) | Yes |
| `POST` | `/api/downloads/tasks/{task_id}/cancel` | `cancel_download_task` | Downloads | [`downloads.py:267`](../../backend/routers/downloads.py#L267) | Yes |
| `POST` | `/api/downloads/tasks/{task_id}/resume` | `resume_download_task` | Downloads | [`downloads.py:276`](../../backend/routers/downloads.py#L276) | Yes |
| `POST` | `/api/downloads/verify-path` | `verify_download_path` | Downloads | [`downloads.py:66`](../../backend/routers/downloads.py#L66) | Yes |
| `POST` | `/api/image-tools/convert-format` | `convert_format` | Image Tools | [`image_tools.py:119`](../../backend/routers/image_tools.py#L119) | Yes |
| `POST` | `/api/image-tools/delete-duplicates` | `delete_duplicates` | Image Tools | [`image_tools.py:102`](../../backend/routers/image_tools.py#L102) | Yes |
| `GET` | `/api/image-tools/file` | `get_local_image_file` | Image Tools | [`image_tools.py:153`](../../backend/routers/image_tools.py#L153) | Yes |
| `GET` | `/api/image-tools/manga/{manga_id}/download-path` | `get_manga_download_path` | Image Tools | [`image_tools.py:127`](../../backend/routers/image_tools.py#L127) | Yes |
| `POST` | `/api/image-tools/scan-duplicates` | `scan_duplicates` | Image Tools | [`image_tools.py:93`](../../backend/routers/image_tools.py#L93) | Yes |
| `POST` | `/api/image-tools/scan-format` | `scan_format` | Image Tools | [`image_tools.py:110`](../../backend/routers/image_tools.py#L110) | Yes |
| `GET` | `/api/image-tools/scan-progress` | `get_scan_progress` | Image Tools | [`image_tools.py:87`](../../backend/routers/image_tools.py#L87) | Yes |
| `GET` | `/api/manga` | `list_mangas` | Manga | [`manga.py:38`](../../backend/routers/manga.py#L38) | Yes |
| `GET` | `/api/manga` | `list_mangas` | Manga | [`manga.py:38`](../../backend/routers/manga.py#L38) | No (Alias) |
| `POST` | `/api/manga/dex` | `add_manga_from_dex` | Manga | [`manga.py:119`](../../backend/routers/manga.py#L119) | Yes |
| `POST` | `/api/manga/import-from-recommendation` | `import_manga_from_rec` | Recommendations | [`recommendations.py:51`](../../backend/routers/recommendations.py#L51) | Yes |
| `POST` | `/api/manga/manual` | `add_manga_manually` | Manga | [`manga.py:156`](../../backend/routers/manga.py#L156) | Yes |
| `GET` | `/api/manga/resolve-reference/{identifier}` | `resolve_manga_reference` | Manga | [`manga.py:110`](../../backend/routers/manga.py#L110) | Yes |
| `DELETE` | `/api/manga/{manga_id}` | `delete_manga` | Manga | [`manga.py:204`](../../backend/routers/manga.py#L204) | Yes |
| `GET` | `/api/manga/{manga_id}` | `get_manga` | Manga | [`manga.py:101`](../../backend/routers/manga.py#L101) | Yes |
| `PUT` | `/api/manga/{manga_id}` | `update_manga` | Manga | [`manga.py:177`](../../backend/routers/manga.py#L177) | Yes |
| `GET` | `/api/manga/{manga_id}/chapters` | `get_manga_chapters` | Chapters & Reader | [`chapters.py:35`](../../backend/routers/chapters.py#L35) | Yes |
| `POST` | `/api/manga/{manga_id}/chapters/sync-metadata` | `sync_manga_chapters_metadata` | Chapters & Reader | [`chapters.py:78`](../../backend/routers/chapters.py#L78) | Yes |
| `POST` | `/api/manga/{manga_id}/cleanup-latest-chapter` | `cleanup_latest_chapter` | Chapters & Reader | [`chapters.py:204`](../../backend/routers/chapters.py#L204) | Yes |
| `DELETE` | `/api/manga/{manga_id}/covers` | `delete_manga_covers` | Cover Arts | [`cover_arts.py:33`](../../backend/routers/cover_arts.py#L33) | Yes |
| `GET` | `/api/manga/{manga_id}/covers` | `get_manga_covers` | Cover Arts | [`cover_arts.py:9`](../../backend/routers/cover_arts.py#L9) | Yes |
| `POST` | `/api/manga/{manga_id}/covers/sync` | `sync_manga_covers` | Cover Arts | [`cover_arts.py:21`](../../backend/routers/cover_arts.py#L21) | Yes |
| `POST` | `/api/manga/{manga_id}/download` | `download_manga_chapters` | Downloads | [`downloads.py:149`](../../backend/routers/downloads.py#L149) | Yes |
| `POST` | `/api/manga/{manga_id}/enrich-trackers` | `enrich_manga_tracker_metadata` | Manga | [`manga.py:222`](../../backend/routers/manga.py#L222) | Yes |
| `GET` | `/api/manga/{manga_id}/history` | `get_manga_history` | Manga | [`manga.py:234`](../../backend/routers/manga.py#L234) | Yes |
| `POST` | `/api/manga/{manga_id}/import-folder` | `import_local_folder` | Chapters & Reader | [`chapters.py:113`](../../backend/routers/chapters.py#L113) | Yes |
| `POST` | `/api/manga/{manga_id}/import-folder-stream` | `import_local_folder_stream` | Chapters & Reader | [`chapters.py:133`](../../backend/routers/chapters.py#L133) | Yes |
| `DELETE` | `/api/manga/{manga_id}/panels` | `delete_manga_panels` | vision | [`vision.py:237`](../../backend/routers/vision.py#L237) | Yes |
| `GET` | `/api/manga/{manga_id}/panels/report` | `generate_manga_panels_report` | vision | [`vision.py:330`](../../backend/routers/vision.py#L330) | Yes |
| `GET` | `/api/manga/{manga_id}/panels/search` | `search_manga_panels` | vision | [`vision.py:289`](../../backend/routers/vision.py#L289) | Yes |
| `GET` | `/api/manga/{manga_id}/panels/stats` | `get_manga_panels_stats` | vision | [`vision.py:319`](../../backend/routers/vision.py#L319) | Yes |
| `GET` | `/api/manga/{manga_id}/reading-progress` | `get_reading_progress` | Chapters & Reader | [`chapters.py:173`](../../backend/routers/chapters.py#L173) | Yes |
| `POST` | `/api/manga/{manga_id}/reading-progress` | `save_reading_progress` | Chapters & Reader | [`chapters.py:183`](../../backend/routers/chapters.py#L183) | Yes |
| `GET` | `/api/manga/{manga_id}/recommendations` | `get_recommendations` | Recommendations | [`recommendations.py:15`](../../backend/routers/recommendations.py#L15) | Yes |
| `POST` | `/api/manga/{manga_id}/recommendations/sync` | `force_sync_recommendations` | Recommendations | [`recommendations.py:27`](../../backend/routers/recommendations.py#L27) | Yes |
| `GET` | `/api/manga/{manga_id}/reviews` | `list_reviews` | Reviews | [`reviews.py:52`](../../backend/routers/reviews.py#L52) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews` | `create_review` | Reviews | [`reviews.py:72`](../../backend/routers/reviews.py#L72) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-image` | `upload_review_image` | Reviews | [`reviews.py:297`](../../backend/routers/reviews.py#L297) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-image-url` | `upload_image_from_url` | Reviews | [`reviews.py:340`](../../backend/routers/reviews.py#L340) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-media` | `upload_review_media` | Reviews | [`reviews.py:460`](../../backend/routers/reviews.py#L460) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/upload-video` | `upload_review_video` | Reviews | [`reviews.py:390`](../../backend/routers/reviews.py#L390) | Yes |
| `DELETE` | `/api/manga/{manga_id}/reviews/{review_id}` | `delete_review` | Reviews | [`reviews.py:175`](../../backend/routers/reviews.py#L175) | Yes |
| `PUT` | `/api/manga/{manga_id}/reviews/{review_id}` | `update_review` | Reviews | [`reviews.py:128`](../../backend/routers/reviews.py#L128) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/{review_id}/cleanup` | `cleanup_review_tabs` | Reviews | [`reviews.py:208`](../../backend/routers/reviews.py#L208) | Yes |
| `POST` | `/api/manga/{manga_id}/reviews/{review_id}/finalize` | `finalize_review` | Reviews | [`reviews.py:550`](../../backend/routers/reviews.py#L550) | Yes |
| `POST` | `/api/manga/{manga_id}/scan-folder` | `scan_local_folder` | Chapters & Reader | [`chapters.py:102`](../../backend/routers/chapters.py#L102) | Yes |
| `POST` | `/api/manga/{manga_id}/scan-panels` | `trigger_manga_scan` | vision | [`vision.py:195`](../../backend/routers/vision.py#L195) | Yes |
| `POST` | `/api/manga/{manga_id}/scan-panels/cancel` | `cancel_manga_panels_scan` | vision | [`vision.py:227`](../../backend/routers/vision.py#L227) | Yes |
| `GET` | `/api/manga/{manga_id}/scan-progress` | `stream_scan_progress` | vision | [`vision.py:257`](../../backend/routers/vision.py#L257) | Yes |
| `GET` | `/api/manga/{manga_id}/scan-status` | `get_scan_status` | vision | [`vision.py:251`](../../backend/routers/vision.py#L251) | Yes |
| `POST` | `/api/manga/{manga_id}/scan/cancel` | `cancel_manga_panels_scan` | vision | [`vision.py:227`](../../backend/routers/vision.py#L227) | Yes |
| `GET` | `/api/manga/{manga_id}/storage-duplicates` | `get_storage_duplicates` | Chapters & Reader | [`chapters.py:151`](../../backend/routers/chapters.py#L151) | Yes |
| `POST` | `/api/manga/{manga_id}/storage-duplicates/cleanup` | `cleanup_storage_duplicates` | Chapters & Reader | [`chapters.py:162`](../../backend/routers/chapters.py#L162) | Yes |
| `POST` | `/api/manga/{manga_id}/sync` | `sync_manga_metadata` | Manga | [`manga.py:213`](../../backend/routers/manga.py#L213) | Yes |
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
| `POST` | `/api/sync/abort-active` | `abort_active_syncs` | Sync Manager | [`sync_manager.py:208`](../../backend/routers/sync_manager.py#L208) | Yes |
| `POST` | `/api/sync/batch` | `sync_batch` | Sync Manager | [`sync_manager.py:199`](../../backend/routers/sync_manager.py#L199) | Yes |
| `GET` | `/api/sync/logs` | `get_logs` | Sync Manager | [`sync_manager.py:218`](../../backend/routers/sync_manager.py#L218) | Yes |
| `GET` | `/api/sync/pools` | `get_pools` | Sync Manager | [`sync_manager.py:106`](../../backend/routers/sync_manager.py#L106) | Yes |
| `POST` | `/api/sync/pools` | `create_pool` | Sync Manager | [`sync_manager.py:115`](../../backend/routers/sync_manager.py#L115) | Yes |
| `DELETE` | `/api/sync/pools/{pool_id}` | `delete_pool` | Sync Manager | [`sync_manager.py:154`](../../backend/routers/sync_manager.py#L154) | Yes |
| `GET` | `/api/sync/pools/{pool_id}` | `get_pool` | Sync Manager | [`sync_manager.py:124`](../../backend/routers/sync_manager.py#L124) | Yes |
| `PUT` | `/api/sync/pools/{pool_id}` | `update_pool` | Sync Manager | [`sync_manager.py:140`](../../backend/routers/sync_manager.py#L140) | Yes |
| `POST` | `/api/sync/pools/{pool_id}/execute` | `execute_pool` | Sync Manager | [`sync_manager.py:175`](../../backend/routers/sync_manager.py#L175) | Yes |
| `POST` | `/api/sync/pools/{pool_id}/preview` | `preview_pool` | Sync Manager | [`sync_manager.py:166`](../../backend/routers/sync_manager.py#L166) | Yes |
| `GET` | `/api/sync/runs` | `get_sync_runs` | Sync Manager | [`sync_manager.py:289`](../../backend/routers/sync_manager.py#L289) | Yes |
| `POST` | `/api/sync/runs` | `create_sync_run` | Sync Manager | [`sync_manager.py:236`](../../backend/routers/sync_manager.py#L236) | Yes |
| `PUT` | `/api/sync/runs/{run_id}` | `update_sync_run` | Sync Manager | [`sync_manager.py:261`](../../backend/routers/sync_manager.py#L261) | Yes |
| `GET` | `/api/sync/settings` | `get_system_settings` | Sync Manager | [`sync_manager.py:77`](../../backend/routers/sync_manager.py#L77) | Yes |
| `PUT` | `/api/sync/settings` | `update_system_settings` | Sync Manager | [`sync_manager.py:90`](../../backend/routers/sync_manager.py#L90) | Yes |
| `POST` | `/api/sync/single` | `sync_single` | Sync Manager | [`sync_manager.py:185`](../../backend/routers/sync_manager.py#L185) | Yes |
| `GET` | `/api/sync/stats` | `get_stats` | Sync Manager | [`sync_manager.py:227`](../../backend/routers/sync_manager.py#L227) | Yes |
| `GET` | `/api/tags` | `list_tags` | Tags | [`tags.py:15`](../../backend/routers/tags.py#L15) | Yes |
| `POST` | `/api/tags` | `create_custom_tag` | Tags | [`tags.py:44`](../../backend/routers/tags.py#L44) | Yes |
| `DELETE` | `/api/tags/{tag_id}` | `delete_custom_tag` | Tags | [`tags.py:74`](../../backend/routers/tags.py#L74) | Yes |
| `PUT` | `/api/tags/{tag_id}` | `update_tag` | Tags | [`tags.py:95`](../../backend/routers/tags.py#L95) | Yes |
| `POST` | `/api/tasks/ocr` | `enqueue_ocr_task` | Tasks | [`tasks.py:128`](../../backend/routers/tasks.py#L128) | No (Alias) |
| `GET` | `/api/tasks/{task_id}` | `get_task_status` | Tasks | [`tasks.py:110`](../../backend/routers/tasks.py#L110) | No (Alias) |
| `GET` | `/health` | `health_check` | - | [`main.py:107`](../../backend/main.py#L107) | Yes |
| `POST` | `/tasks/ocr` | `enqueue_ocr_task` | Tasks | [`tasks.py:128`](../../backend/routers/tasks.py#L128) | Yes |
| `GET` | `/tasks/{task_id}` | `get_task_status` | Tasks | [`tasks.py:110`](../../backend/routers/tasks.py#L110) | Yes |
