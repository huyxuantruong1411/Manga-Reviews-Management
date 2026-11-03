package com.example.mangareader_android.ui.activities;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.bumptech.glide.Glide;
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
    private final List<ChapterItem> rawChapters = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityMangaDetailBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        mangaSlug = getIntent().getStringExtra(EXTRA_SLUG);
        if (mangaSlug == null || mangaSlug.isEmpty()) {
            Toast.makeText(this, "Missing manga identifier", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        setupRecyclerViews();
        setupListeners();
        loadMangaDetails();
    }

    private void setupRecyclerViews() {
        // Chapters
        chapterAdapter = new ChapterAdapter(chapter -> {
            Intent intent = new Intent(this, ReaderActivity.class);
            intent.putExtra(ReaderActivity.EXTRA_CHAPTER_ID, chapter.poolChapterId);
            startActivity(intent);
        });
        binding.rvDetailChapters.setLayoutManager(new LinearLayoutManager(this));
        binding.rvDetailChapters.setAdapter(chapterAdapter);

        // Comments
        commentAdapter = new CommentAdapter(new CommentAdapter.OnCommentActionListener() {
            @Override
            public void onReaction(CommentItem comment, String reaction) {
                RetrofitClient.getApi().reactComment(comment.comment_id, new ReactCommentRequest(reaction))
                        .enqueue(new Callback<Map<String, Object>>() {
                            @Override
                            public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                if (response.isSuccessful()) {
                                    loadComments();
                                }
                            }

                            @Override
                            public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {}
                        });
            }

            @Override
            public void onReport(CommentItem comment) {
                showReportCommentDialog(comment);
            }
        });
        binding.rvDetailComments.setLayoutManager(new LinearLayoutManager(this));
        binding.rvDetailComments.setAdapter(commentAdapter);

        // Similar Titles
        similarAdapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(this, MangaDetailActivity.class);
            intent.putExtra(EXTRA_SLUG, manga.slug);
            startActivity(intent);
        });
        binding.rvSimilarTitles.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        binding.rvSimilarTitles.setAdapter(similarAdapter);
    }

    private void setupListeners() {
        binding.btnDetailBack.setOnClickListener(v -> finish());
        binding.btnDetailReport.setOnClickListener(v -> showReportMangaDialog());

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

    private void loadMangaDetails() {
        RetrofitClient.getApi().getMangaDetail(mangaSlug).enqueue(new Callback<MangaItem>() {
            @Override
            public void onResponse(@NonNull Call<MangaItem> call, @NonNull Response<MangaItem> response) {
                if (response.isSuccessful() && response.body() != null) {
                    currentManga = response.body();
                    bindMangaData(currentManga);
                    loadChapters();
                    loadComments();
                    loadSimilarTitles();
                } else {
                    Toast.makeText(MangaDetailActivity.this, "Manga not found", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<MangaItem> call, @NonNull Throwable t) {
                Toast.makeText(MangaDetailActivity.this, "Failed to connect to backend", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void bindMangaData(MangaItem manga) {
        binding.tvDetailBarTitle.setText(manga.title);
        binding.tvDetailTitle.setText(manga.title);
        if (manga.alt_titles != null && !manga.alt_titles.isEmpty()) {
            binding.tvDetailAltTitle.setText(manga.alt_titles.get(0));
            binding.tvDetailAltTitle.setVisibility(View.VISIBLE);
        } else {
            binding.tvDetailAltTitle.setVisibility(View.GONE);
        }

        binding.tvDetailStatusBadge.setText(manga.status != null ? manga.status.toUpperCase() : "ONGOING");
        binding.tvDetailDemographicBadge.setText(manga.publication_demographic != null ? manga.publication_demographic.toUpperCase() : "MANGA");
        binding.tvDetailRatingBadge.setText(String.format(Locale.US, "%.1f ★", manga.average_rating));
        binding.tvDetailStats.setText(String.format(Locale.US, "%d chapters • %d views", manga.chapter_count, manga.view_count));
        binding.tvDetailSynopsis.setText(manga.description != null && !manga.description.isEmpty() ? manga.description : "No description provided.");

        Glide.with(this)
                .load(manga.cover_url)
                .placeholder(R.color.surface_elevated)
                .into(binding.imgDetailCover);
    }

    private void loadChapters() {
        if (currentManga == null) return;
        RetrofitClient.getApi().getChapters(currentManga.poolMangaId, sortOrder, null, null)
                .enqueue(new Callback<ChapterListResponse>() {
                    @Override
                    public void onResponse(@NonNull Call<ChapterListResponse> call, @NonNull Response<ChapterListResponse> response) {
                        if (response.isSuccessful() && response.body() != null) {
                            rawChapters.clear();
                            rawChapters.addAll(response.body().items);
                            chapterAdapter.setChapters(rawChapters);
                            binding.tvChaptersHeader.setText(String.format(Locale.US, "CHAPTERS (%d)", rawChapters.size()));
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<ChapterListResponse> call, @NonNull Throwable t) {}
                });
    }

    private void loadComments() {
        if (currentManga == null) return;
        RetrofitClient.getApi().getComments(currentManga.poolMangaId, 1, 50).enqueue(new Callback<CommentListResponse>() {
            @Override
            public void onResponse(@NonNull Call<CommentListResponse> call, @NonNull Response<CommentListResponse> response) {
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
                if (response.isSuccessful() && response.body() != null && response.body().items != null && !response.body().items.isEmpty()) {
                    binding.layoutSimilarTitles.setVisibility(View.VISIBLE);
                    similarAdapter.setMangaList(response.body().items);
                } else {
                    binding.layoutSimilarTitles.setVisibility(View.GONE);
                }
            }

            @Override
            public void onFailure(@NonNull Call<RecommendationsResponse> call, @NonNull Throwable t) {
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
                    Intent intent = new Intent(MangaDetailActivity.this, ReaderActivity.class);
                    intent.putExtra(ReaderActivity.EXTRA_CHAPTER_ID, response.body().chapter_id);
                    startActivity(intent);
                } else if (!rawChapters.isEmpty()) {
                    ChapterItem first = rawChapters.get(rawChapters.size() - 1);
                    Intent intent = new Intent(MangaDetailActivity.this, ReaderActivity.class);
                    intent.putExtra(ReaderActivity.EXTRA_CHAPTER_ID, first.poolChapterId);
                    startActivity(intent);
                }
            }

            @Override
            public void onFailure(@NonNull Call<ReadPointerResponse> call, @NonNull Throwable t) {
                if (!rawChapters.isEmpty()) {
                    ChapterItem first = rawChapters.get(rawChapters.size() - 1);
                    Intent intent = new Intent(MangaDetailActivity.this, ReaderActivity.class);
                    intent.putExtra(ReaderActivity.EXTRA_CHAPTER_ID, first.poolChapterId);
                    startActivity(intent);
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
                    Intent intent = new Intent(MangaDetailActivity.this, ReaderActivity.class);
                    intent.putExtra(ReaderActivity.EXTRA_CHAPTER_ID, response.body().chapter_id);
                    startActivity(intent);
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
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            Toast.makeText(this, "Please sign in from the Account tab to submit a rating.", Toast.LENGTH_SHORT).show();
            return;
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Rate Manga (1 - 10)");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(50, 30, 50, 20);

        final TextView tvScore = new TextView(this);
        tvScore.setText("10 ★");
        tvScore.setTextSize(18);
        tvScore.setTextColor(getResources().getColor(R.color.accent_amber, null));
        layout.addView(tvScore);

        final SeekBar seekBar = new SeekBar(this);
        seekBar.setMax(9); // 0 to 9 -> 1 to 10
        seekBar.setProgress(9);
        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar s, int progress, boolean fromUser) {
                tvScore.setText(String.format(Locale.US, "%d ★", progress + 1));
            }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        layout.addView(seekBar);

        builder.setView(layout);
        builder.setPositiveButton("Submit", (dialog, which) -> {
            int score = seekBar.getProgress() + 1;
            RetrofitClient.getApi().rateManga(currentManga.poolMangaId, new RateMangaRequest(score))
                    .enqueue(new Callback<Map<String, Object>>() {
                        @Override
                        public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                            if (response.isSuccessful()) {
                                Toast.makeText(MangaDetailActivity.this, "Rating saved!", Toast.LENGTH_SHORT).show();
                                loadMangaDetails();
                            } else {
                                Toast.makeText(MangaDetailActivity.this, "Failed to submit rating", Toast.LENGTH_SHORT).show();
                            }
                        }

                        @Override
                        public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {
                            Toast.makeText(MangaDetailActivity.this, "Network error", Toast.LENGTH_SHORT).show();
                        }
                    });
        });
        builder.setNegativeButton("Cancel", null);
        builder.show();
    }

    private void showReportMangaDialog() {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            Toast.makeText(this, "Please sign in to submit content reports.", Toast.LENGTH_SHORT).show();
            return;
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Report Manga Content");

        final EditText etReason = new EditText(this);
        etReason.setHint("Violation reason (e.g. copyright, broken images)...");
        builder.setView(etReason);

        builder.setPositiveButton("Report", (dialog, which) -> {
            String reason = etReason.getText().toString().trim();
            if (!reason.isEmpty()) {
                RetrofitClient.getApi().reportManga(currentManga.poolMangaId, new ReportMangaRequest(reason, null))
                        .enqueue(new Callback<Map<String, Object>>() {
                            @Override
                            public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                if (response.isSuccessful()) {
                                    Toast.makeText(MangaDetailActivity.this, "Report queued for administrator review.", Toast.LENGTH_LONG).show();
                                }
                            }

                            @Override
                            public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {}
                        });
            }
        });
        builder.setNegativeButton("Cancel", null);
        builder.show();
    }

    private void showReportCommentDialog(CommentItem comment) {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            Toast.makeText(this, "Please sign in first.", Toast.LENGTH_SHORT).show();
            return;
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("Report Comment");

        final EditText etReason = new EditText(this);
        etReason.setHint("Reason (harassment, unmasked spoiler)...");
        builder.setView(etReason);

        builder.setPositiveButton("Submit", (dialog, which) -> {
            String reason = etReason.getText().toString().trim();
            if (!reason.isEmpty()) {
                RetrofitClient.getApi().reportComment(comment.comment_id, new ReportCommentRequest(reason, null))
                        .enqueue(new Callback<Map<String, Object>>() {
                            @Override
                            public void onResponse(@NonNull Call<Map<String, Object>> call, @NonNull Response<Map<String, Object>> response) {
                                if (response.isSuccessful()) {
                                    Toast.makeText(MangaDetailActivity.this, "Comment report submitted.", Toast.LENGTH_SHORT).show();
                                }
                            }

                            @Override
                            public void onFailure(@NonNull Call<Map<String, Object>> call, @NonNull Throwable t) {}
                        });
            }
        });
        builder.setNegativeButton("Cancel", null);
        builder.show();
    }

    private void handlePostComment() {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            Toast.makeText(this, "Please sign in to post comments.", Toast.LENGTH_SHORT).show();
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
                            Toast.makeText(MangaDetailActivity.this, "Comment posted", Toast.LENGTH_SHORT).show();
                        } else {
                            Toast.makeText(MangaDetailActivity.this, "Failed to post comment", Toast.LENGTH_SHORT).show();
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<CommentItem> call, @NonNull Throwable t) {
                        binding.btnSubmitComment.setEnabled(true);
                        Toast.makeText(MangaDetailActivity.this, "Network error", Toast.LENGTH_SHORT).show();
                    }
                });
    }
}

