package com.example.mangareader_android.ui.fragments;

import android.animation.ValueAnimator;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ReadingListModels.ReadingAnalyticsResponse;
import com.example.mangareader_android.data.model.ReadingListModels.TopTagStat;
import com.example.mangareader_android.databinding.FragmentStatsBinding;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.Locale;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class StatsFragment extends Fragment implements UiMotionUtils.OnTabReselectedListener {

    private FragmentStatsBinding binding;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentStatsBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        binding.swipeRefreshStats.setOnRefreshListener(this::loadStats);
        loadStats();
    }

    @Override
    public void onTabReselected() {
        if (binding != null) {
            binding.scrollStats.smoothScrollTo(0, 0);
        }
    }

    private void loadStats() {
        String userId = MangaReaderApp.getInstance().getUserId();
        if (userId == null) {
            binding.swipeRefreshStats.setRefreshing(false);
            binding.tvPreferredTags.setText("Please sign in from the Account tab to view habit metrics.");
            return;
        }

        binding.swipeRefreshStats.setRefreshing(true);
        RetrofitClient.getApi().getReadingAnalytics(userId).enqueue(new Callback<ReadingAnalyticsResponse>() {
            @Override
            public void onResponse(@NonNull Call<ReadingAnalyticsResponse> call, @NonNull Response<ReadingAnalyticsResponse> response) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshStats.setRefreshing(false);
                if (response.isSuccessful() && response.body() != null) {
                    ReadingAnalyticsResponse stats = response.body();
                    UiMotionUtils.transitionLayout(binding.layoutStatsRoot);

                    animateIntMetric(stats.total_chapters_read, val ->
                            binding.tvStatChaptersRead.setText(String.valueOf(val)));
                    animateIntMetric(stats.total_mangas_read, val ->
                            binding.tvStatTitlesRead.setText(String.valueOf(val)));
                    int last7Days = stats.reading_frequency != null ? stats.reading_frequency.last_7_days : 0;
                    animateIntMetric(last7Days, val ->
                            binding.tvStatDwellMinutes.setText(String.format(Locale.US, "%d CH", val)));
                    if (stats.average_score_given != null) {
                        animateFloatMetric(stats.average_score_given.floatValue(), val ->
                                binding.tvStatStreak.setText(String.format(Locale.US, "★ %.1f", val)));
                    } else {
                        binding.tvStatStreak.setText("-");
                    }

                    if (stats.top_tags != null && !stats.top_tags.isEmpty()) {
                        StringBuilder sb = new StringBuilder();
                        for (TopTagStat tag : stats.top_tags) {
                            String label = tag.name != null ? tag.name : tag.slug;
                            sb.append("#").append(label.toUpperCase(Locale.US))
                                    .append(" (").append(tag.manga_count).append(")   ");
                        }
                        binding.tvPreferredTags.setText(sb.toString().trim());
                    } else {
                        binding.tvPreferredTags.setText("Read more chapters to build your genre profile.");
                    }
                } else {
                    UiMotionUtils.showError(
                            binding.getRoot(),
                            "Failed to load telemetry (" + response.code() + ")",
                            "RETRY",
                            v -> loadStats());
                }
            }

            @Override
            public void onFailure(@NonNull Call<ReadingAnalyticsResponse> call, @NonNull Throwable t) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshStats.setRefreshing(false);
                binding.tvPreferredTags.setText("Failed to load telemetry metrics.");
                UiMotionUtils.showError(
                        binding.getRoot(),
                        "Telemetry network failure",
                        "RETRY",
                        v -> loadStats());
            }
        });
    }

    private interface IntConsumer {
        void accept(int value);
    }

    private interface FloatConsumer {
        void accept(float value);
    }

    private void animateIntMetric(int target, IntConsumer updater) {
        ValueAnimator animator = ValueAnimator.ofInt(0, Math.max(0, target));
        animator.setDuration(550L);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(anim -> {
            if (isAdded() && binding != null) {
                updater.accept((Integer) anim.getAnimatedValue());
            }
        });
        animator.start();
    }

    private void animateFloatMetric(float target, FloatConsumer updater) {
        ValueAnimator animator = ValueAnimator.ofFloat(0f, Math.max(0f, target));
        animator.setDuration(550L);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(anim -> {
            if (isAdded() && binding != null) {
                updater.accept((Float) anim.getAnimatedValue());
            }
        });
        animator.start();
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
