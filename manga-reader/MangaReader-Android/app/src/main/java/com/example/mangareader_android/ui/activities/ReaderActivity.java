package com.example.mangareader_android.ui.activities;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.FrameLayout;
import androidx.activity.EdgeToEdge;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.PagerSnapHelper;
import androidx.recyclerview.widget.RecyclerView;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ChapterModels.*;
import com.example.mangareader_android.databinding.ActivityReaderBinding;
import com.example.mangareader_android.ui.adapters.ReaderPageAdapter;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.Locale;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class ReaderActivity extends AppCompatActivity {

    public static final String EXTRA_CHAPTER_ID = "extra_chapter_id";

    private static final int MODE_WEBTOON = 0;
    private static final int MODE_PAGED_LTR = 1;
    private static final int MODE_PAGED_RTL = 2;
    private static final long HUD_AUTO_HIDE_MS = 3200L;
    private static final long PROGRESS_DEBOUNCE_MS = 450L;

    private ActivityReaderBinding binding;
    private String currentChapterId;
    private ChapterPagesResponse chapterData;
    private ReaderPageAdapter adapter;
    private LinearLayoutManager layoutManager;
    private PagerSnapHelper pagerSnapHelper;

    private int dwellSeconds = 0;
    private boolean showOverlays = true;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable dwellRunnable;
    private final Runnable autoHideHudRunnable = () -> {
        if (showOverlays) {
            setOverlaysVisible(false);
        }
    };
    private Runnable pendingSyncRunnable;
    private int currentMode = MODE_WEBTOON;
    private boolean userToggledMode = false;
    private int currentPageNumber = 1;
    private int lastSyncedPage = -1;
    private boolean lastSyncedCompleted = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        binding = ActivityReaderBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.layoutReaderTopBar.setPadding(
                    binding.layoutReaderTopBar.getPaddingLeft(),
                    systemBars.top + 8,
                    binding.layoutReaderTopBar.getPaddingRight(),
                    binding.layoutReaderTopBar.getPaddingBottom());
            binding.layoutReaderBottomBar.setPadding(
                    binding.layoutReaderBottomBar.getPaddingLeft(),
                    binding.layoutReaderBottomBar.getPaddingTop(),
                    binding.layoutReaderBottomBar.getPaddingRight(),
                    systemBars.bottom + 10);
            FrameLayout.LayoutParams progressParams =
                    (FrameLayout.LayoutParams) binding.pbReaderProgress.getLayoutParams();
            progressParams.topMargin = systemBars.top;
            binding.pbReaderProgress.setLayoutParams(progressParams);
            return insets;
        });

        currentChapterId = getIntent().getStringExtra(EXTRA_CHAPTER_ID);
        if (currentChapterId == null || currentChapterId.isEmpty()) {
            finish();
            return;
        }

        setupViews();
        setupListeners();
        startDwellTimer();
        scheduleHudAutoHide();
        loadChapterPages(currentChapterId);
    }

    private void setupViews() {
        adapter = new ReaderPageAdapter(() -> {
            setOverlaysVisible(!showOverlays);
            if (showOverlays) {
                scheduleHudAutoHide();
            }
        });

        pagerSnapHelper = new PagerSnapHelper();
        applyReadingMode(MODE_WEBTOON, false);
        binding.rvReaderPages.setAdapter(adapter);

        binding.rvReaderPages.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView recyclerView, int dx, int dy) {
                super.onScrolled(recyclerView, dx, dy);
                updateVisiblePageProgress();
            }
        });
    }

    private void updateVisiblePageProgress() {
        if (chapterData == null || layoutManager == null || chapterData.page_count <= 0) {
            return;
        }
        int visiblePos = layoutManager.findLastCompletelyVisibleItemPosition();
        if (visiblePos == RecyclerView.NO_POSITION) {
            visiblePos = layoutManager.findFirstVisibleItemPosition();
        }
        if (visiblePos == RecyclerView.NO_POSITION) {
            return;
        }
        int pageNumber = Math.min(chapterData.page_count, Math.max(1, visiblePos + 1));
        boolean isCompleted = pageNumber >= chapterData.page_count;

        if (pageNumber != currentPageNumber || (isCompleted && !lastSyncedCompleted)) {
            currentPageNumber = pageNumber;
            updateProgressDisplay(pageNumber, chapterData.page_count);
            scheduleSyncProgress(pageNumber, isCompleted);
        }
    }

    private void updateProgressDisplay(int page, int total) {
        int safeTotal = Math.max(1, total);
        binding.tvReaderPageCount.setText(String.format(Locale.US, "Page %d / %d", page, safeTotal));
        binding.pbReaderProgress.setProgress(Math.round((page * 100f) / safeTotal));
    }

    private void setOverlaysVisible(boolean visible) {
        showOverlays = visible;
        handler.removeCallbacks(autoHideHudRunnable);
        UiMotionUtils.animateOverlayBar(binding.layoutReaderTopBar, visible, true);
        UiMotionUtils.animateOverlayBar(binding.layoutReaderBottomBar, visible, false);
    }

    private void scheduleHudAutoHide() {
        handler.removeCallbacks(autoHideHudRunnable);
        if (showOverlays) {
            handler.postDelayed(autoHideHudRunnable, HUD_AUTO_HIDE_MS);
        }
    }

    private void applyReadingMode(int mode, boolean preservePosition) {
        int savedPage = preservePosition ? Math.max(0, currentPageNumber - 1) : 0;
        currentMode = mode;

        if (pagerSnapHelper != null) {
            pagerSnapHelper.attachToRecyclerView(null);
        }

        if (mode == MODE_PAGED_LTR || mode == MODE_PAGED_RTL) {
            boolean reverse = (mode == MODE_PAGED_RTL);
            layoutManager = new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, reverse);
            binding.rvReaderPages.setLayoutManager(layoutManager);
            pagerSnapHelper.attachToRecyclerView(binding.rvReaderPages);
            adapter.setPagedMode(true);
            binding.btnReadingModeToggle.setText(reverse ? "← MANGA" : "PAGED →");
        } else {
            layoutManager = new LinearLayoutManager(this, LinearLayoutManager.VERTICAL, false);
            binding.rvReaderPages.setLayoutManager(layoutManager);
            adapter.setPagedMode(false);
            binding.btnReadingModeToggle.setText("WEBTOON");
        }

        if (preservePosition && adapter.getItemCount() > savedPage) {
            binding.rvReaderPages.scrollToPosition(savedPage);
        }
    }

    private void setupListeners() {
        binding.btnReaderBack.setOnClickListener(v -> finish());

        binding.btnReadingModeToggle.setOnClickListener(v -> {
            userToggledMode = true;
            int nextMode = (currentMode + 1) % 3;
            applyReadingMode(nextMode, true);
            scheduleHudAutoHide();
        });

        binding.btnReaderPrevChapter.setOnClickListener(v -> {
            if (chapterData != null && chapterData.prev_chapter_id != null) {
                flushPendingSync();
                loadChapterPages(chapterData.prev_chapter_id);
                scheduleHudAutoHide();
            }
        });

        binding.btnReaderNextChapter.setOnClickListener(v -> {
            if (chapterData != null && chapterData.next_chapter_id != null) {
                flushPendingSync();
                loadChapterPages(chapterData.next_chapter_id);
                scheduleHudAutoHide();
            }
        });
    }

    private void startDwellTimer() {
        dwellSeconds = 0;
        dwellRunnable = new Runnable() {
            @Override
            public void run() {
                dwellSeconds++;
                binding.tvReaderDwellTime.setText(String.format(Locale.US, "%ds dwell", dwellSeconds));
                handler.postDelayed(this, 1000L);
            }
        };
        handler.postDelayed(dwellRunnable, 1000L);
    }

    private void scheduleSyncProgress(int pageNumber, boolean isCompleted) {
        if (pendingSyncRunnable != null) {
            handler.removeCallbacks(pendingSyncRunnable);
        }
        pendingSyncRunnable = () -> syncProgressNow(pageNumber, isCompleted);
        if (isCompleted) {
            handler.post(pendingSyncRunnable);
        } else {
            handler.postDelayed(pendingSyncRunnable, PROGRESS_DEBOUNCE_MS);
        }
    }

    private void flushPendingSync() {
        if (pendingSyncRunnable != null) {
            handler.removeCallbacks(pendingSyncRunnable);
            pendingSyncRunnable = null;
        }
        if (chapterData != null && currentChapterId != null
                && (currentPageNumber != lastSyncedPage || !lastSyncedCompleted)) {
            syncProgressNow(currentPageNumber, currentPageNumber >= chapterData.page_count);
        }
    }

    private void syncProgressNow(int pageNumber, boolean isCompleted) {
        if (currentChapterId == null) {
            return;
        }
        if (pageNumber == lastSyncedPage && isCompleted == lastSyncedCompleted) {
            return;
        }
        lastSyncedPage = pageNumber;
        lastSyncedCompleted = isCompleted;

        RetrofitClient.getApi().recordProgress(
                currentChapterId,
                new RecordProgressRequest(pageNumber, isCompleted, dwellSeconds, 1)
        ).enqueue(new Callback<RecordProgressResponse>() {
            @Override
            public void onResponse(@NonNull Call<RecordProgressResponse> call, @NonNull Response<RecordProgressResponse> response) {
            }

            @Override
            public void onFailure(@NonNull Call<RecordProgressResponse> call, @NonNull Throwable t) {
            }
        });
    }

    private void loadChapterPages(String chapterId) {
        currentChapterId = chapterId;
        currentPageNumber = 1;
        lastSyncedPage = -1;
        lastSyncedCompleted = false;
        binding.pbReaderLoading.setVisibility(View.VISIBLE);

        RetrofitClient.getApi().getChapterPages(chapterId).enqueue(new Callback<ChapterPagesResponse>() {
            @Override
            public void onResponse(@NonNull Call<ChapterPagesResponse> call, @NonNull Response<ChapterPagesResponse> response) {
                if (isFinishing() || isDestroyed()) return;
                binding.pbReaderLoading.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    chapterData = response.body();
                    binding.tvReaderChapterTitle.setText(
                            String.format(Locale.US, "CHAPTER %s", chapterData.chapter_number));
                    updateProgressDisplay(1, chapterData.page_count);

                    if (!userToggledMode && chapterData.reader_settings != null) {
                        int serverMode = MODE_WEBTOON;
                        if ("paged".equalsIgnoreCase(chapterData.reader_settings.reading_mode)
                                || "horizontal".equalsIgnoreCase(chapterData.reader_settings.reading_mode)) {
                            serverMode = "rtl".equalsIgnoreCase(chapterData.reader_settings.reading_direction)
                                    ? MODE_PAGED_RTL
                                    : MODE_PAGED_LTR;
                        }
                        if (serverMode != currentMode) {
                            applyReadingMode(serverMode, false);
                        }
                    }

                    binding.btnReaderPrevChapter.setEnabled(chapterData.prev_chapter_id != null);
                    binding.btnReaderNextChapter.setEnabled(chapterData.next_chapter_id != null);
                    binding.btnReaderPrevChapter.setAlpha(chapterData.prev_chapter_id != null ? 1f : 0.45f);
                    binding.btnReaderNextChapter.setAlpha(chapterData.next_chapter_id != null ? 1f : 0.45f);

                    adapter.setPages(chapterData.pages);
                    binding.rvReaderPages.scrollToPosition(0);
                    scheduleSyncProgress(1, chapterData.page_count <= 1);
                } else {
                    UiMotionUtils.showError(
                            binding.getRoot(),
                            "Error loading chapter pages (" + response.code() + ")",
                            "RETRY",
                            v -> loadChapterPages(chapterId));
                }
            }

            @Override
            public void onFailure(@NonNull Call<ChapterPagesResponse> call, @NonNull Throwable t) {
                if (isFinishing() || isDestroyed()) return;
                binding.pbReaderLoading.setVisibility(View.GONE);
                UiMotionUtils.showError(
                        binding.getRoot(),
                        "Failed to connect to reader backend",
                        "RETRY",
                        v -> loadChapterPages(chapterId));
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        flushPendingSync();
    }

    @Override
    public void finish() {
        super.finish();
        UiMotionUtils.applyActivityCloseTransition(this);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
    }
}
