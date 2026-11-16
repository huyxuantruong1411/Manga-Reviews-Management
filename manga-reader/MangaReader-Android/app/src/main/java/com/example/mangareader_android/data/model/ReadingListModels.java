package com.example.mangareader_android.data.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ReadingListModels {

    public static class ReadingListDetail {
        public String list_id;
        public String owner_id;
        public String name;
        public String description;
        public String visibility;
        public int manga_count;
        public String created_at;
        public String updated_at;
    }

    public static class ReadingListsResponse {
        public int total;
        public List<ReadingListDetail> items = new ArrayList<>();
    }

    public static class CreateReadingListRequest {
        public String name;
        public String description;

        public CreateReadingListRequest(String name, String description) {
            this.name = name;
            this.description = description;
        }
    }

    public static class MergeListsRequest {
        public List<String> source_list_ids;
        public String new_list_name;
        public String description;
        public boolean delete_source_lists;
        public boolean confirm_empty;

        public MergeListsRequest(
                List<String> sourceListIds,
                String newListName,
                String description,
                boolean deleteSourceLists,
                boolean confirmEmpty) {
            this.source_list_ids = sourceListIds;
            this.new_list_name = newListName;
            this.description = description;
            this.delete_source_lists = deleteSourceLists;
            this.confirm_empty = confirmEmpty;
        }
    }

    public static class ReadingHistoryItem {
        public String manga_id;
        public String slug;
        public String title;
        public String cover_url;
        public boolean is_hidden;
        public String last_read_chapter_id;
        public String last_read_chapter_number;
        public int last_read_page_number = 1;
        public boolean is_chapter_completed;
        public String last_read_at;
        public List<String> read_chapter_ids = new ArrayList<>();
    }

    public static class ReadingHistoryResponse {
        public List<ReadingHistoryItem> items = new ArrayList<>();
        public int page = 1;
        public int page_size = 20;
    }

    public static class TopTagStat {
        public String slug;
        public String name;
        public int manga_count;
    }

    public static class ReadingFrequencyStats {
        public int last_7_days;
        public int last_30_days;
    }

    public static class ReadingAnalyticsResponse {
        public String user_id;
        public boolean is_empty;
        public int total_chapters_read;
        public int total_mangas_read;
        public List<TopTagStat> top_tags = new ArrayList<>();
        public ReadingFrequencyStats reading_frequency = new ReadingFrequencyStats();
        public Map<String, Integer> rating_distribution = new HashMap<>();
        public Double average_score_given;
        public int total_ratings_given;
    }
}

