package com.example.mangareader_android.ui.activities;

import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.activity.EdgeToEdge;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.bumptech.glide.Glide;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ChapterModels.*;
import com.example.mangareader_android.data.model.CommentModels.*;
import com.example.mangareader_android.data.model.MangaModels.*;
import com.example.mangareader_android.databinding.ActivityMangaDetailBinding;
import com.example.mangareader_android.ui.adapters.ChapterAdapter;
import com.example.mangareader_android.ui.adapters.CommentAdapter;
import com.example.mangareader_android.ui.adapters.MangaAdapter;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class MangaDetailActivity extends AppCompatActivity {

    public static final String EXTRA_SLUG = "extra_manga_slug";

    private ActivityMangaDetailBinding binding;
    private String mangaSlug;
    private MangaItem currentManga;

    private ChapterAdapter chapterAdapter;
    private CommentAdapter commentAdapter;
    private MangaAdapter similarAdapter;

    private String sortOrder = "desc";
    private boolean synopsisExpanded = false;
    private final List<ChapterItem> rawChapters = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        binding = ActivityMangaDetailBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        mangaSlug = getIntent().getStringExtra(EXTRA_SLUG);
        if (mangaSlug == null || mangaSlug.isEmpty()) {
            finish();
            return;
        }

        setupRecyclerViews();
        setupListeners();
        loadMangaDetails();
    }

    private void setupRecyclerViews() {
        chapterAdapter = new ChapterAdapter(chapter -> {
            int startPage = chapter.last_read_page_number != null ? Math.max(1, chapter.last_read_page_number) : 1;
            openReaderChapter(chapter.poolChapterId, startPage);
        });
        binding.rvDetailChapters.setLayoutManager(new LinearLayoutManager(this));
        binding.rvDetailChapters.setAdapter(chapterAdapter);

        commentAdapter = new CommentAdapter(new CommentAdapter.OnCommentActionListener() {
            @Override
            public void onReaction(CommentItem comment, String reaction) {
                RetrofitClient.getApi().reactComment(comment.comment_id, new ReactCommentRequest(reaction))
                        .enqueue(new Callback<Map<String, Object>>() {
                            @Override
                            public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                if (response.isSuccessful()) {
                                    loadComments();
                                } else {
                                    UiMotionUtils.showError(binding.getRoot(), "Sign in to react to comments", null, null);
                                }
                            }

                            @Override
                            public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                                UiMotionUtils.showError(binding.getRoot(), "Network error updating reaction", null, null);
                            }
                        });
            }

            @Override
            public void onReport(CommentItem comment) {
                showReportCommentDialog(comment);
            }
        });
        binding.rvDetailComments.setLayoutManager(new LinearLayoutManager(this));
        binding.rvDetailComments.setAdapter(commentAdapter);

        similarAdapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(this, MangaDetailActivity.class);
            intent.putExtra(EXTRA_SLUG, manga.slug);
            startActivity(intent);
            UiMotionUtils.applyActivityOpenTransition(this);
        });
        binding.rvSimilarTitles.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        binding.rvSimilarTitles.setAdapter(similarAdapter);
    }

    private void openReaderChapter(String chapterId) {
        openReaderChapter(chapterId, 1);
    }

    private void openReaderChapter(String chapterId, int initialPage) {
        Intent intent = new Intent(this, ReaderActivity.class);
        intent.putExtra(ReaderActivity.EXTRA_CHAPTER_ID, chapterId);
        intent.putExtra(ReaderActivity.EXTRA_INITIAL_PAGE, Math.max(1, initialPage));
        startActivity(intent);
        UiMotionUtils.applyActivityOpenTransition(this);
    }

    private void setupListeners() {
        binding.btnDetailBack.setOnClickListener(v -> finish());
        binding.btnDetailReport.setOnClickListener(v -> showReportMangaDialog());

        binding.layoutSynopsisCard.setOnClickListener(v -> toggleSynopsis());

        binding.btnReadFirst.setOnClickListener(v -> handleReadFirst());
        binding.btnContinueReading.setOnClickListener(v -> handleContinueReading());
        binding.btnRateManga.setOnClickListener(v -> showRatingDialog());

        binding.btnSortOrderToggle.setOnClickListener(v -> {
            sortOrder = "desc".equals(sortOrder) ? "asc" : "desc";
            binding.btnSortOrderToggle.setText("desc".equals(sortOrder) ? "DESCENDING ↓" : "ASCENDING ↑");
            loadChapters();
        });

        binding.etChapterSearch.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                chapterAdapter.filter(s.toString());
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });

        binding.btnSubmitComment.setOnClickListener(v -> handlePostComment());
    }

    private void toggleSynopsis() {
        if (binding.tvSynopsisToggle.getVisibility() != View.VISIBLE && !synopsisExpanded) {
            return;
        }
        synopsisExpanded = !synopsisExpanded;
        UiMotionUtils.transitionLayout(binding.layoutDetailRoot);
        binding.tvDetailSynopsis.setMaxLines(synopsisExpanded ? Integer.MAX_VALUE : 4);
        binding.tvSynopsisToggle.setText(synopsisExpanded ? "COLLAPSE ▴" : "EXPAND ▾");
    }

    private void loadMangaDetails() {
        RetrofitClient.getApi().getMangaDetail(mangaSlug).enqueue(new Callback<MangaItem>() {
            @Override
            public void onResponse(@NonNull Call<MangaItem> call, @NonNull Response<MangaItem> response) {
                if (isFinishing() || isDestroyed()) return;
                if (response.isSuccessful() && response.body() != null) {
                    currentManga = response.body();
                    bindMangaData(currentManga);
                    loadChapters();
                    loadComments();
                    loadSimilarTitles();
                } else {
                    UiMotionUtils.showError(
                            binding.getRoot(),
                            "Manga not found (" + response.code() + ")",
                            "RETRY",
                            v -> loadMangaDetails());
                }
            }

            @Override
            public void onFailure(@NonNull Call<MangaItem> call, @NonNull Throwable t) {
                if (isFinishing() || isDestroyed()) return;
                UiMotionUtils.showError(
                        binding.getRoot(),
                        "Failed to connect to backend",
                        "RETRY",
                        v -> loadMangaDetails());
            }
        });
    }

    private void bindMangaData(MangaItem manga) {
        UiMotionUtils.transitionLayout(binding.layoutDetailRoot);
        binding.tvDetailBarTitle.setText(manga.title);
        binding.tvDetailTitle.setText(manga.title);
        if (manga.alt_titles != null && !manga.alt_titles.isEmpty()) {
            binding.tvDetailAltTitle.setText(manga.alt_titles.get(0));
            binding.tvDetailAltTitle.setVisibility(View.VISIBLE);
        } else {
            binding.tvDetailAltTitle.setVisibility(View.GONE);
        }

        binding.tvDetailStatusBadge.setText(
                manga.status != null ? manga.status.toUpperCase(Locale.US) : "ONGOING");
        binding.tvDetailDemographicBadge.setText(
                manga.publication_demographic != null
                        ? manga.publication_demographic.toUpperCase(Locale.US)
                        : "MANGA");
        binding.tvDetailRatingBadge.setText(
                String.format(Locale.US, "★ %.1f", manga.average_rating));
        binding.tvDetailStats.setText(
                String.format(Locale.US, "%d chapters • %d views", manga.chapter_count, manga.view_count));

        String synopsis = (manga.description != null && !manga.description.isEmpty())
                ? manga.description
                : "No description provided.";
        synopsisExpanded = false;
        binding.tvDetailSynopsis.setMaxLines(4);
        binding.tvDetailSynopsis.setText(synopsis);
        binding.tvSynopsisToggle.setVisibility(synopsis.length() > 160 ? View.VISIBLE : View.GONE);
        binding.tvSynopsisToggle.setText("EXPAND ▾");

        Glide.with(this)
                .load(MangaReaderApp.resolveMediaUrl(manga.cover_url))
                .placeholder(R.drawable.bg_cover_placeholder)
                .error(R.drawable.bg_cover_placeholder)
                .transition(DrawableTransitionOptions.withCrossFade(180))
                .into(binding.imgDetailCover);
    }

    private void loadChapters() {
        if (currentManga == null) return;
        RetrofitClient.getApi().getChapters(currentManga.poolMangaId, sortOrder, null, null)
                .enqueue(new Callback<ChapterListResponse>() {
                    @Override
                    public void onResponse(@NonNull Call<ChapterListResponse> call, @NonNull Response<ChapterListResponse> response) {
                        if (isFinishing() || isDestroyed()) return;
                        if (response.isSuccessful() && response.body() != null) {
                            rawChapters.clear();
                            rawChapters.addAll(response.body().items);
                            chapterAdapter.setChapters(rawChapters);
                            UiMotionUtils.replayLayoutAnimation(binding.rvDetailChapters);
                            binding.tvChaptersHeader.setText(String.format(Locale.US, "CHAPTERS (%d)", rawChapters.size()));
                        } else {
                            UiMotionUtils.showError(
                                    binding.getRoot(),
                                    "Could not load chapters",
                                    "RETRY",
                                    v -> loadChapters());
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<ChapterListResponse> call, @NonNull Throwable t) {
                        if (isFinishing() || isDestroyed()) return;
                        UiMotionUtils.showError(
                                binding.getRoot(),
                                "Chapter network error",
                                "RETRY",
                                v -> loadChapters());
                    }
                });
    }

    private void loadComments() {
        if (currentManga == null) return;
        RetrofitClient.getApi().getComments(currentManga.poolMangaId, 1, 50).enqueue(new Callback<CommentListResponse>() {
            @Override
            public void onResponse(@NonNull Call<CommentListResponse> call, @NonNull Response<CommentListResponse> response) {
                if (isFinishing() || isDestroyed()) return;
                if (response.isSuccessful() && response.body() != null) {
                    commentAdapter.setComments(response.body().items);
                }
            }

            @Override
            public void onFailure(@NonNull Call<CommentListResponse> call, @NonNull Throwable t) {}
        });
    }

    private void loadSimilarTitles() {
        if (currentManga == null) return;
        RetrofitClient.getApi().getContentRecommendations(currentManga.poolMangaId).enqueue(new Callback<RecommendationsResponse>() {
            @Override
            public void onResponse(@NonNull Call<RecommendationsResponse> call, @NonNull Response<RecommendationsResponse> response) {
                if (isFinishing() || isDestroyed()) return;
                if (response.isSuccessful() && response.body() != null && response.body().items != null && !response.body().items.isEmpty()) {
                    UiMotionUtils.transitionLayout(binding.layoutDetailRoot);
                    binding.layoutSimilarTitles.setVisibility(View.VISIBLE);
                    similarAdapter.setMangaList(response.body().items);
                } else {
                    binding.layoutSimilarTitles.setVisibility(View.GONE);
                }
            }

            @Override
            public void onFailure(@NonNull Call<RecommendationsResponse> call, @NonNull Throwable t) {
                if (isFinishing() || isDestroyed()) return;
                binding.layoutSimilarTitles.setVisibility(View.GONE);
            }
        });
    }

    private void handleReadFirst() {
        if (currentManga == null) return;
        RetrofitClient.getApi().getReadFirst(currentManga.poolMangaId).enqueue(new Callback<ReadPointerResponse>() {
            @Override
            public void onResponse(@NonNull Call<ReadPointerResponse> call, @NonNull Response<ReadPointerResponse> response) {
                if (response.isSuccessful() && response.body() != null) {
                    openReaderChapter(response.body().chapter_id, Math.max(1, response.body().page_number));
                } else if (!rawChapters.isEmpty()) {
                    openReaderChapter(rawChapters.get(rawChapters.size() - 1).poolChapterId, 1);
                }
            }

            @Override
            public void onFailure(@NonNull Call<ReadPointerResponse> call, @NonNull Throwable t) {
                if (!rawChapters.isEmpty()) {
                    openReaderChapter(rawChapters.get(rawChapters.size() - 1).poolChapterId, 1);
                }
            }
        });
    }

    private void handleContinueReading() {
        if (currentManga == null) return;
        RetrofitClient.getApi().getContinueReading(currentManga.poolMangaId).enqueue(new Callback<ReadPointerResponse>() {
            @Override
            public void onResponse(@NonNull Call<ReadPointerResponse> call, @NonNull Response<ReadPointerResponse> response) {
                if (response.isSuccessful() && response.body() != null) {
                    openReaderChapter(response.body().chapter_id, Math.max(1, response.body().page_number));
                } else {
                    handleReadFirst();
                }
            }

            @Override
            public void onFailure(@NonNull Call<ReadPointerResponse> call, @NonNull Throwable t) {
                handleReadFirst();
            }
        });
    }

    private void showRatingDialog() {
        if (currentManga == null) return;
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            UiMotionUtils.showInfo(binding.getRoot(), "Please sign in from the Account tab to submit a rating.");
            return;
        }

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(56, 32, 56, 20);

        final TextView tvScore = new TextView(this);
        tvScore.setText("★ 10 / 10");
        tvScore.setTextSize(18f);
        tvScore.setTextColor(ContextCompat.getColor(this, R.color.accent_amber));
        layout.addView(tvScore);

        final SeekBar seekBar = new SeekBar(this);
        seekBar.setMax(9);
        seekBar.setProgress(9);
        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar s, int progress, boolean fromUser) {
                tvScore.setText(String.format(Locale.US, "★ %d / 10", progress + 1));
            }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        layout.addView(seekBar);

        UiMotionUtils.dialogBuilder(this)
                .setTitle("Rate Manga (1 - 10)")
                .setView(layout)
                .setPositiveButton("Submit", (dialog, which) -> {
                    int score = seekBar.getProgress() + 1;
                    RetrofitClient.getApi().rateManga(currentManga.poolMangaId, new RateMangaRequest(score))
                            .enqueue(new Callback<Map<String, Object>>() {
                                @Override
                                public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                    if (response.isSuccessful()) {
                                        UiMotionUtils.showInfo(binding.getRoot(), "Rating saved!");
                                        loadMangaDetails();
                                    } else {
                                        UiMotionUtils.showError(binding.getRoot(), "Failed to submit rating", null, null);
                                    }
                                }

                                @Override
                                public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                                    UiMotionUtils.showError(binding.getRoot(), "Network error", null, null);
                                }
                            });
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showReportMangaDialog() {
        if (currentManga == null) return;
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            UiMotionUtils.showInfo(binding.getRoot(), "Please sign in to submit content reports.");
            return;
        }

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(44, 24, 44, 16);

        final Spinner spCategory = new Spinner(this);
        final String[] codes = {"broken_images", "wrong_chapter_order", "inappropriate_content", "copyright", "other"};
        ArrayAdapter<String> codeAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, codes);
        spCategory.setAdapter(codeAdapter);
        container.addView(spCategory);

        final EditText etReason = new EditText(this);
        etReason.setHint("Optional details...");
        etReason.setTextColor(ContextCompat.getColor(this, R.color.text_primary));
        container.addView(etReason);

        UiMotionUtils.dialogBuilder(this)
                .setTitle("Report Manga Content")
                .setView(container)
                .setPositiveButton("Report", (dialog, which) -> {
                    String reasonCode = codes[Math.max(0, spCategory.getSelectedItemPosition())];
                    String desc = etReason.getText().toString().trim();
                    RetrofitClient.getApi().reportManga(
                                    currentManga.poolMangaId,
                                    new ReportMangaRequest(reasonCode, desc.isEmpty() ? null : desc))
                            .enqueue(new Callback<Map<String, Object>>() {
                                @Override
                                public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                    if (response.isSuccessful()) {
                                        UiMotionUtils.showInfo(binding.getRoot(), "Report queued for administrator review.");
                                    } else {
                                        UiMotionUtils.showError(binding.getRoot(), "Report failed (" + response.code() + ")", null, null);
                                    }
                                }

                                @Override
                                public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                                    UiMotionUtils.showError(binding.getRoot(), "Network error submitting report", null, null);
                                }
                            });
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showReportCommentDialog(CommentItem comment) {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            UiMotionUtils.showInfo(binding.getRoot(), "Please sign in first.");
            return;
        }

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(44, 24, 44, 16);

        final Spinner spCategory = new Spinner(this);
        final String[] codes = {"unmarked_spoiler", "spam", "harassment", "hate_speech", "other"};
        ArrayAdapter<String> codeAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, codes);
        spCategory.setAdapter(codeAdapter);
        container.addView(spCategory);

        final EditText etReason = new EditText(this);
        etReason.setHint("Optional details...");
        etReason.setTextColor(ContextCompat.getColor(this, R.color.text_primary));
        container.addView(etReason);

        UiMotionUtils.dialogBuilder(this)
                .setTitle("Report Comment")
                .setView(container)
                .setPositiveButton("Submit", (dialog, which) -> {
                    String reasonCode = codes[Math.max(0, spCategory.getSelectedItemPosition())];
                    String desc = etReason.getText().toString().trim();
                    RetrofitClient.getApi().reportComment(
                                    comment.comment_id,
                                    new ReportCommentRequest(reasonCode, desc.isEmpty() ? null : desc))
                            .enqueue(new Callback<Map<String, Object>>() {
                                @Override
                                public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                    if (response.isSuccessful()) {
                                        UiMotionUtils.showInfo(binding.getRoot(), "Comment report submitted.");
                                    } else {
                                        UiMotionUtils.showError(binding.getRoot(), "Report failed (" + response.code() + ")", null, null);
                                    }
                                }

                                @Override
                                public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                                    UiMotionUtils.showError(binding.getRoot(), "Network error submitting report", null, null);
                                }
                            });
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void handlePostComment() {
        if (currentManga == null) return;
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            UiMotionUtils.showInfo(binding.getRoot(), "Please sign in to post comments.");
            return;
        }

        String content = binding.etNewCommentContent.getText().toString().trim();
        if (content.isEmpty()) return;

        boolean isSpoiler = binding.cbIsSpoiler.isChecked();
        binding.btnSubmitComment.setEnabled(false);

        RetrofitClient.getApi().createComment(currentManga.poolMangaId, new CreateCommentRequest(content, null, null, isSpoiler))
                .enqueue(new Callback<CommentItem>() {
                    @Override
                    public void onResponse(@NonNull Call<CommentItem> call, @NonNull Response<CommentItem> response) {
                        binding.btnSubmitComment.setEnabled(true);
                        if (response.isSuccessful()) {
                            binding.etNewCommentContent.setText("");
                            binding.cbIsSpoiler.setChecked(false);
                            loadComments();
                            UiMotionUtils.showInfo(binding.getRoot(), "Comment posted");
                        } else {
                            UiMotionUtils.showError(binding.getRoot(), "Failed to post comment", null, null);
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<CommentItem> call, @NonNull Throwable t) {
                        binding.btnSubmitComment.setEnabled(true);
                        UiMotionUtils.showError(binding.getRoot(), "Network error posting comment", null, null);
                    }
                });
    }

    @Override
    public void finish() {
        super.finish();
        UiMotionUtils.applyActivityCloseTransition(this);
    }
}
