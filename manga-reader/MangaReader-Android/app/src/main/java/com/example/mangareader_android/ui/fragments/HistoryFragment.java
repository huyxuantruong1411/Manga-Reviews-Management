package com.example.mangareader_android.ui.fragments;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ReadingListModels.ReadingHistoryItem;
import com.example.mangareader_android.databinding.FragmentHistoryBinding;
import com.example.mangareader_android.ui.activities.ReaderActivity;
import com.example.mangareader_android.ui.adapters.HistoryAdapter;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.List;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class HistoryFragment extends Fragment implements UiMotionUtils.OnTabReselectedListener {

    private FragmentHistoryBinding binding;
    private HistoryAdapter adapter;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentHistoryBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        adapter = new HistoryAdapter(item -> {
            Intent intent = new Intent(requireContext(), ReaderActivity.class);
            intent.putExtra(ReaderActivity.EXTRA_CHAPTER_ID, item.chapter_id);
            startActivity(intent);
            UiMotionUtils.applyActivityOpenTransition(requireActivity());
        });
        binding.rvHistory.setLayoutManager(new LinearLayoutManager(requireContext()));
        binding.rvHistory.setAdapter(adapter);

        binding.swipeRefreshHistory.setOnRefreshListener(this::loadHistory);
        loadHistory();
    }

    @Override
    public void onTabReselected() {
        if (binding != null) {
            binding.rvHistory.smoothScrollToPosition(0);
        }
    }

    private void loadHistory() {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            binding.swipeRefreshHistory.setRefreshing(false);
            UiMotionUtils.transitionLayout(binding.layoutHistoryRoot);
            binding.tvEmptyHistory.setText("Sign in to sync and view your reading progress across all devices.");
            binding.tvEmptyHistory.setVisibility(View.VISIBLE);
            return;
        }

        if (adapter.getItemCount() == 0) {
            binding.pbHistory.setVisibility(View.VISIBLE);
        }
        binding.swipeRefreshHistory.setRefreshing(true);

        RetrofitClient.getApi().getReadingHistory().enqueue(new Callback<List<ReadingHistoryItem>>() {
            @Override
            public void onResponse(@NonNull Call<List<ReadingHistoryItem>> call, @NonNull Response<List<ReadingHistoryItem>> response) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshHistory.setRefreshing(false);
                binding.pbHistory.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    List<ReadingHistoryItem> list = response.body();
                    UiMotionUtils.transitionLayout(binding.layoutHistoryRoot);
                    adapter.setHistoryList(list);
                    binding.tvEmptyHistory.setVisibility(list.isEmpty() ? View.VISIBLE : View.GONE);
                    if (!list.isEmpty()) {
                        UiMotionUtils.replayLayoutAnimation(binding.rvHistory);
                    }
                } else {
                    UiMotionUtils.showError(
                            binding.getRoot(),
                            "Failed to load history (" + response.code() + ")",
                            "RETRY",
                            v -> loadHistory());
                }
            }

            @Override
            public void onFailure(@NonNull Call<List<ReadingHistoryItem>> call, @NonNull Throwable t) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshHistory.setRefreshing(false);
                binding.pbHistory.setVisibility(View.GONE);
                UiMotionUtils.showError(
                        binding.getRoot(),
                        "Error loading history",
                        "RETRY",
                        v -> loadHistory());
            }
        });
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
