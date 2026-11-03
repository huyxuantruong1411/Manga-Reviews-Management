package com.example.mangareader_android.ui.activities;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ChapterModels.*;
import com.example.mangareader_android.databinding.ActivityReaderBinding;
import com.example.mangareader_android.ui.adapters.ReaderPageAdapter;
import java.util.Locale;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class ReaderActivity extends AppCompatActivity {

    public static final String EXTRA_CHAPTER_ID = "extra_chapter_id";

    private ActivityReaderBinding binding;
    private String currentChapterId;
    private ChapterPagesResponse chapterData;
    private ReaderPageAdapter adapter;

    private int dwellSeconds = 0;
    private final Handler dwellHandler = new Handler(Looper.getMainLooper());
    private Runnable dwellRunnable;

    private boolean showOverlays = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivityReaderBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        currentChapterId = getIntent().getStringExtra(EXTRA_CHAPTER_ID);
        if (currentChapterId == null || currentChapterId.isEmpty()) {
            Toast.makeText(this, "Missing chapter ID", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        setupViews();
        setupListeners();
        startDwellTimer();
        loadChapterPages(currentChapterId);
    }

    private void setupViews() {
        adapter = new ReaderPageAdapter(() -> {
            showOverlays = !showOverlays;
            binding.layoutReaderTopBar.setVisibility(showOverlays ? View.VISIBLE : View.GONE);
            binding.layoutReaderBottomBar.setVisibility(showOverlays ? View.VISIBLE : View.GONE);
        });

        LinearLayoutManager layoutManager = new LinearLayoutManager(this);
        binding.rvReaderPages.setLayoutManager(layoutManager);
        binding.rvReaderPages.setAdapter(adapter);

        binding.rvReaderPages.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView recyclerView, int dx, int dy) {
                super.onScrolled(recyclerView, dx, dy);
                if (chapterData != null) {
                    int firstVisible = layoutManager.findFirstVisibleItemPosition();
                    int pageNumber = firstVisible + 1;
                    boolean isCompleted = pageNumber >= chapterData.page_count;
                    syncProgress(pageNumber, isCompleted);
                }
            }
        });
    }

    private void setupListeners() {
        binding.btnReaderBack.setOnClickListener(v -> finish());

        binding.btnReaderPrevChapter.setOnClickListener(v -> {
            if (chapterData != null && chapterData.prev_chapter_id != null) {
                loadChapterPages(chapterData.prev_chapter_id);
            }
        });

        binding.btnReaderNextChapter.setOnClickListener(v -> {
            if (chapterData != null && chapterData.next_chapter_id != null) {
                loadChapterPages(chapterData.next_chapter_id);
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
                dwellHandler.postDelayed(this, 1000);
            }
        };
        dwellHandler.postDelayed(dwellRunnable, 1000);
    }

    private void syncProgress(int pageNumber, boolean isCompleted) {
        if (currentChapterId == null) return;
        RetrofitClient.getApi().recordProgress(
                currentChapterId,
                new RecordProgressRequest(pageNumber, isCompleted, dwellSeconds, 1)
        ).enqueue(new Callback<RecordProgressResponse>() {
            @Override
            public void onResponse(@NonNull Call<RecordProgressResponse> call, @NonNull Response<RecordProgressResponse> response) {}
            @Override
            public void onFailure(@NonNull Call<RecordProgressResponse> call, @NonNull Throwable t) {}
        });
    }

    private void loadChapterPages(String chapterId) {
        currentChapterId = chapterId;
        binding.pbReaderLoading.setVisibility(View.VISIBLE);

        RetrofitClient.getApi().getChapterPages(chapterId).enqueue(new Callback<ChapterPagesResponse>() {
            @Override
            public void onResponse(@NonNull Call<ChapterPagesResponse> call, @NonNull Response<ChapterPagesResponse> response) {
                binding.pbReaderLoading.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    chapterData = response.body();
                    binding.tvReaderChapterTitle.setText(String.format(Locale.US, "CHAPTER %s", chapterData.chapter_number));
                    binding.tvReaderPageCount.setText(String.format(Locale.US, "%d pages", chapterData.page_count));

                    binding.btnReaderPrevChapter.setEnabled(chapterData.prev_chapter_id != null);
                    binding.btnReaderNextChapter.setEnabled(chapterData.next_chapter_id != null);

                    adapter.setPages(chapterData.pages);
                    binding.rvReaderPages.scrollToPosition(0);
                } else {
                    Toast.makeText(ReaderActivity.this, "Error loading chapter pages", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<ChapterPagesResponse> call, @NonNull Throwable t) {
                binding.pbReaderLoading.setVisibility(View.GONE);
                Toast.makeText(ReaderActivity.this, "Failed to connect to reader backend", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (dwellHandler != null && dwellRunnable != null) {
            dwellHandler.removeCallbacks(dwellRunnable);
        }
    }
}

