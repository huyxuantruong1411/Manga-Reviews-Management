package com.example.mangareader_android.data.model;

import com.google.gson.annotations.SerializedName;
import java.util.ArrayList;
import java.util.List;

public class MangaModels {

    public static class CreatorItem {
        public String creator_id;
        public String name;
    }

    public static class MangaItem {
        @SerializedName("pool_manga_id")
        public String poolMangaId;

        public String slug;
        public String title;
        public List<String> alt_titles = new ArrayList<>();
        public String description;
        public String status;
        public String content_rating;
        public String publication_demographic;
        public String cover_url;
        public int chapter_count;
        public double average_rating;
        public int rating_count;
        public long view_count;
        public boolean is_hidden;
        public List<String> tags = new ArrayList<>();
        public List<CreatorItem> authors = new ArrayList<>();
        public List<CreatorItem> artists = new ArrayList<>();
        public String updated_at;
        public String user_reading_status;
        public Integer user_rating;
    }

    public static class MangaListResponse {
        public int total;
        public int page;
        public int page_size;
        public List<MangaItem> items = new ArrayList<>();
    }

    public static class MangaSearchResponse {
        public int total;
        public List<MangaItem> items = new ArrayList<>();
    }

    public static class AutocompleteItem {
        public String pool_manga_id;
        public String title;
        public String slug;
    }

    public static class AutocompleteResponse {
        public List<AutocompleteItem> items = new ArrayList<>();
    }

    public static class RecommendationsResponse {
        public String model;
        public Boolean is_fallback;
        public List<MangaItem> items = new ArrayList<>();
    }

    public static class RateMangaRequest {
        public int score;

        public RateMangaRequest(int score) {
            this.score = score;
        }
    }

    public static class ReadingStatusRequest {
        public String status;

        public ReadingStatusRequest(String status) {
            this.status = status;
        }
    }

    public static class ReportMangaRequest {
        public String reason;
        public String details;

        public ReportMangaRequest(String reason, String details) {
            this.reason = reason;
            this.details = details;
        }
    }
}

