package com.mangareader.app.data.api

import com.mangareader.app.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface MangaReaderApi {

    // Auth
    @POST("api/v1/auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<RegisterResponse>

    @POST("api/v1/auth/verify-email")
    suspend fun verifyEmail(@Body request: VerifyEmailRequest): Response<Map<String, Any>>

    @POST("api/v1/auth/resend-otp")
    suspend fun resendOtp(@Body request: ResendOtpRequest): Response<Map<String, Any>>

    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<TokenResponse>

    @GET("api/v1/users/me")
    suspend fun getMyProfile(): Response<UserProfile>

    @PATCH("api/v1/users/me/profile")
    suspend fun updateProfile(@Body request: UpdateProfileRequest): Response<UserProfile>

    @PUT("api/v1/users/me/password")
    suspend fun updatePassword(@Body request: UpdatePasswordRequest): Response<Map<String, Any>>

    // Manga Discovery & Catalog
    @GET("api/v1/mangas")
    suspend fun getMangas(
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 24,
        @Query("sort_by") sortBy: String? = null,
        @Query("status") status: String? = null,
        @Query("content_rating") contentRating: String? = null,
        @Query("demographic") demographic: String? = null,
        @Query("include_tags") includeTags: String? = null,
    ): Response<MangaListResponse>

    @GET("api/v1/mangas/search")
    suspend fun searchMangas(
        @Query("q") query: String,
        @Query("search_type") searchType: String = "title",
    ): Response<MangaSearchResponse>

    @GET("api/v1/mangas/autocomplete")
    suspend fun autocomplete(
        @Query("q") query: String,
    ): Response<AutocompleteResponse>

    @GET("api/v1/mangas/{idOrSlug}")
    suspend fun getMangaDetail(
        @Path("idOrSlug") idOrSlug: String,
    ): Response<MangaItem>

    // Recommendations
    @GET("api/v1/mangas/{mangaId}/recommendations/content-based")
    suspend fun getContentRecommendations(
        @Path("mangaId") mangaId: String,
    ): Response<RecommendationsResponse>

    @GET("api/v1/mangas/{mangaId}/recommendations/item-based")
    suspend fun getItemRecommendations(
        @Path("mangaId") mangaId: String,
    ): Response<RecommendationsResponse>

    @GET("api/v1/recommendations/user-based")
    suspend fun getUserRecommendations(): Response<RecommendationsResponse>

    // Chapters & Reader
    @GET("api/v1/mangas/{mangaId}/chapters")
    suspend fun getChapters(
        @Path("mangaId") mangaId: String,
        @Query("sort_order") sortOrder: String = "desc",
        @Query("read_filter") readFilter: String? = null,
        @Query("q") search: String? = null,
    ): Response<ChapterListResponse>

    @GET("api/v1/mangas/{mangaId}/read-first")
    suspend fun getReadFirst(
        @Path("mangaId") mangaId: String,
    ): Response<ReadPointerResponse>

    @GET("api/v1/mangas/{mangaId}/continue-reading")
    suspend fun getContinueReading(
        @Path("mangaId") mangaId: String,
    ): Response<ReadPointerResponse>

    @GET("api/v1/chapters/{chapterId}/pages")
    suspend fun getChapterPages(
        @Path("chapterId") chapterId: String,
    ): Response<ChapterPagesResponse>

    @POST("api/v1/chapters/{chapterId}/progress")
    suspend fun recordProgress(
        @Path("chapterId") chapterId: String,
        @Body request: RecordProgressRequest,
    ): Response<RecordProgressResponse>

    // Ratings & Status & Reports
    @POST("api/v1/mangas/{mangaId}/ratings")
    suspend fun rateManga(
        @Path("mangaId") mangaId: String,
        @Body request: RateMangaRequest,
    ): Response<Map<String, Any>>

    @DELETE("api/v1/mangas/{mangaId}/ratings")
    suspend fun deleteRating(
        @Path("mangaId") mangaId: String,
    ): Response<Map<String, Any>>

    @PUT("api/v1/users/me/reading-status/{mangaId}")
    suspend fun setReadingStatus(
        @Path("mangaId") mangaId: String,
        @Body request: ReadingStatusRequest,
    ): Response<Map<String, Any>>

    @POST("api/v1/mangas/{mangaId}/reports")
    suspend fun reportManga(
        @Path("mangaId") mangaId: String,
        @Body request: ReportMangaRequest,
    ): Response<Map<String, Any>>

    // Comments
    @GET("api/v1/mangas/{mangaId}/comments")
    suspend fun getComments(
        @Path("mangaId") mangaId: String,
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 20,
    ): Response<CommentListResponse>

    @POST("api/v1/mangas/{mangaId}/comments")
    suspend fun createComment(
        @Path("mangaId") mangaId: String,
        @Body request: CreateCommentRequest,
    ): Response<CommentItem>

    @POST("api/v1/comments/{commentId}/reactions")
    suspend fun reactComment(
        @Path("commentId") commentId: String,
        @Body request: ReactCommentRequest,
    ): Response<Map<String, Any>>

    @POST("api/v1/comments/{commentId}/reports")
    suspend fun reportComment(
        @Path("commentId") commentId: String,
        @Body request: ReportCommentRequest,
    ): Response<Map<String, Any>>

    // Reading Lists
    @GET("api/v1/reading-lists")
    suspend fun getReadingLists(): Response<ReadingListsResponse>

    @POST("api/v1/reading-lists")
    suspend fun createReadingList(
        @Body request: CreateReadingListRequest,
    ): Response<ReadingListDetail>

    @POST("api/v1/reading-lists/merge")
    suspend fun mergeReadingLists(
        @Body request: MergeListsRequest,
    ): Response<ReadingListDetail>

    @POST("api/v1/reading-lists/batch-add-manga")
    suspend fun batchAddManga(
        @Body request: BatchAddMangaRequest,
    ): Response<Map<String, Any>>

    @GET("api/v1/reading-lists/{listId}/items")
    suspend fun getListItems(
        @Path("listId") listId: String,
    ): Response<ListItemsResponse>

    // History & Stats
    @GET("api/v1/users/me/reading-history")
    suspend fun getReadingHistory(
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 20,
    ): Response<ReadingHistoryResponse>

    @GET("api/v1/users/{userId}/reading-analytics")
    suspend fun getReadingAnalytics(
        @Path("userId") userId: String,
    ): Response<ReadingAnalyticsResponse>
}

