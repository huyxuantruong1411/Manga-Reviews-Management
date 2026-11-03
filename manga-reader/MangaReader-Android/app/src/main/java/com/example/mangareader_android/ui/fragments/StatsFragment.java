package com.example.mangareader_android.ui.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ReadingListModels.ReadingAnalyticsResponse;
import com.example.mangareader_android.databinding.FragmentStatsBinding;
import java.util.Locale;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class StatsFragment extends Fragment {

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
        loadStats();
    }

    private void loadStats() {
        String userId = MangaReaderApp.getInstance().getUserId();
        if (userId == null) {
            binding.tvPreferredTags.setText("Please sign in from the Account tab to view habit metrics.");
            return;
        }

        RetrofitClient.getApi().getReadingAnalytics(userId).enqueue(new Callback<ReadingAnalyticsResponse>() {
            @Override
            public void onResponse(@NonNull Call<ReadingAnalyticsResponse> call, @NonNull Response<ReadingAnalyticsResponse> response) {
                if (response.isSuccessful() && response.body() != null) {
                    ReadingAnalyticsResponse stats = response.body();
                    binding.tvStatChaptersRead.setText(String.valueOf(stats.total_chapters_read));
                    binding.tvStatTitlesRead.setText(String.valueOf(stats.total_mangas_read));
                    binding.tvStatDwellMinutes.setText(String.format(Locale.US, "%.1fm", stats.total_dwell_minutes));
                    binding.tvStatStreak.setText(String.format(Locale.US, "%d DAYS", stats.reading_streak_days));

                    if (stats.preferred_tags != null && !stats.preferred_tags.isEmpty()) {
                        StringBuilder sb = new StringBuilder();
                        for (String tag : stats.preferred_tags) {
                            sb.append("#").append(tag.toUpperCase(Locale.US)).append("   ");
                        }
                        binding.tvPreferredTags.setText(sb.toString().trim());
                    }
                }
            }

            @Override
            public void onFailure(@NonNull Call<ReadingAnalyticsResponse> call, @NonNull Throwable t) {
                binding.tvPreferredTags.setText("Failed to load telemetry metrics.");
            }
        });
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}

