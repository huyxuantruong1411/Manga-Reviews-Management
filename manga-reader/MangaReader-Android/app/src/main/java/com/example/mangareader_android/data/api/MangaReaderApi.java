package com.example.mangareader_android.data.api;

import com.example.mangareader_android.data.model.AuthModels.*;
import com.example.mangareader_android.data.model.ChapterModels.*;
import com.example.mangareader_android.data.model.CommentModels.*;
import com.example.mangareader_android.data.model.MangaModels.*;
import com.example.mangareader_android.data.model.ReadingListModels.*;
import java.util.List;
import java.util.Map;
import retrofit2.Call;
import retrofit2.http.*;

public interface MangaReaderApi {

    // Auth
    @POST("api/v1/auth/register")
    Call<RegisterResponse> register(@Body RegisterRequest request);

    @POST("api/v1/auth/verify-email")
    Call<Map<String, Object>> verifyEmail(@Body VerifyEmailRequest request);

    @POST("api/v1/auth/resend-otp")
    Call<Map<String, Object>> resendOtp(@Body ResendOtpRequest request);

    @POST("api/v1/auth/login")
    Call<TokenResponse> login(@Body LoginRequest request);

    @GET("api/v1/users/me")
    Call<UserProfile> getMyProfile();

    @PATCH("api/v1/users/me/profile")
    Call<UserProfile> updateProfile(@Body UpdateProfileRequest request);

    @PUT("api/v1/users/me/password")
    Call<Map<String, Object>> updatePassword(@Body UpdatePasswordRequest request);

    // Manga Discovery & Catalog
    @GET("api/v1/mangas")
    Call<MangaListResponse> getMangas(
            @Query("page") int page,
            @Query("page_size") int pageSize,
            @Query("sort_by") String sortBy,
            @Query("status") String status,
            @Query("content_rating") String contentRating,
            @Query("demographic") String demographic,
            @Query("included_tags") String includedTags
    );

    @GET("api/v1/mangas/search")
    Call<MangaSearchResponse> searchMangas(
            @Query("q") String query,
            @Query("search_type") String searchType
    );

    @GET("api/v1/mangas/autocomplete")
    Call<AutocompleteResponse> autocomplete(@Query("q") String query);

    @GET("api/v1/mangas/{idOrSlug}")
    Call<MangaItem> getMangaDetail(@Path("idOrSlug") String idOrSlug);

    // Recommendations
    @GET("api/v1/mangas/{mangaId}/recommendations/content-based")
    Call<RecommendationsResponse> getContentRecommendations(@Path("mangaId") String mangaId);

    @GET("api/v1/mangas/{mangaId}/recommendations/item-based")
    Call<RecommendationsResponse> getItemRecommendations(@Path("mangaId") String mangaId);

    @GET("api/v1/recommendations/user-based")
    Call<RecommendationsResponse> getUserRecommendations();

    // Chapters & Reader
    @GET("api/v1/mangas/{mangaId}/chapters")
    Call<ChapterListResponse> getChapters(
            @Path("mangaId") String mangaId,
            @Query("sort_order") String sortOrder,
            @Query("read_filter") String readFilter,
            @Query("q") String search
    );

    @GET("api/v1/mangas/{mangaId}/read-first")
    Call<ReadPointerResponse> getReadFirst(@Path("mangaId") String mangaId);

    @GET("api/v1/mangas/{mangaId}/continue-reading")
    Call<ReadPointerResponse> getContinueReading(@Path("mangaId") String mangaId);

    @GET("api/v1/chapters/{chapterId}/pages")
    Call<ChapterPagesResponse> getChapterPages(@Path("chapterId") String chapterId);

    @POST("api/v1/chapters/{chapterId}/progress")
    Call<RecordProgressResponse> recordProgress(
            @Path("chapterId") String chapterId,
            @Body RecordProgressRequest request
    );

    // Ratings & Status & Reports
    @POST("api/v1/mangas/{mangaId}/ratings")
    Call<Map<String, Object>> rateManga(
            @Path("mangaId") String mangaId,
            @Body RateMangaRequest request
    );

    @DELETE("api/v1/mangas/{mangaId}/ratings")
    Call<Map<String, Object>> deleteRating(@Path("mangaId") String mangaId);

    @PUT("api/v1/users/me/reading-status/{mangaId}")
    Call<Map<String, Object>> setReadingStatus(
            @Path("mangaId") String mangaId,
            @Body ReadingStatusRequest request
    );

    @POST("api/v1/mangas/{mangaId}/reports")
    Call<Map<String, Object>> reportManga(
            @Path("mangaId") String mangaId,
            @Body ReportMangaRequest request
    );

    // Comments
    @GET("api/v1/mangas/{mangaId}/comments")
    Call<CommentListResponse> getComments(
            @Path("mangaId") String mangaId,
            @Query("page") int page,
            @Query("page_size") int pageSize
    );

    @POST("api/v1/mangas/{mangaId}/comments")
    Call<CommentItem> createComment(
            @Path("mangaId") String mangaId,
            @Body CreateCommentRequest request
    );

    @POST("api/v1/comments/{commentId}/reactions")
    Call<Map<String, Object>> reactComment(
            @Path("commentId") String commentId,
            @Body ReactCommentRequest request
    );

    @POST("api/v1/comments/{commentId}/reports")
    Call<Map<String, Object>> reportComment(
            @Path("commentId") String commentId,
            @Body ReportCommentRequest request
    );

    // Reading Lists
    @GET("api/v1/reading-lists")
    Call<ReadingListsResponse> getReadingLists();

    @POST("api/v1/reading-lists")
    Call<ReadingListDetail> createReadingList(@Body CreateReadingListRequest request);

    @POST("api/v1/reading-lists/merge")
    Call<ReadingListDetail> mergeReadingLists(@Body MergeListsRequest request);

    // History & Stats
    @GET("api/v1/users/me/reading-history")
    Call<List<ReadingHistoryItem>> getReadingHistory();

    @GET("api/v1/users/{userId}/reading-analytics")
    Call<ReadingAnalyticsResponse> getReadingAnalytics(@Path("userId") String userId);
}

