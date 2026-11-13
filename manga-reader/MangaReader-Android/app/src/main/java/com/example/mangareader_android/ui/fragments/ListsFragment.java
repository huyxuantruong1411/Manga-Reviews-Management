package com.example.mangareader_android.ui.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ReadingListModels.*;
import com.example.mangareader_android.databinding.FragmentListsBinding;
import com.example.mangareader_android.ui.adapters.ReadingListAdapter;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class ListsFragment extends Fragment implements UiMotionUtils.OnTabReselectedListener {

    private FragmentListsBinding binding;
    private ReadingListAdapter adapter;
    private final List<ReadingListDetail> currentLists = new ArrayList<>();

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentListsBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        adapter = new ReadingListAdapter(list -> {
            String desc = (list.description != null && !list.description.trim().isEmpty())
                    ? list.description.trim() + "\n\n"
                    : "";
            UiMotionUtils.dialogBuilder(requireContext())
                    .setTitle(list.name)
                    .setMessage(String.format(
                            Locale.US,
                            "%sTitles: %d\nVisibility: %s",
                            desc,
                            list.manga_count,
                            list.visibility != null ? list.visibility.toUpperCase(Locale.US) : "PRIVATE"))
                    .setPositiveButton("Close", null)
                    .show();
        });
        binding.rvReadingLists.setLayoutManager(new LinearLayoutManager(requireContext()));
        binding.rvReadingLists.setAdapter(adapter);

        binding.swipeRefreshLists.setOnRefreshListener(this::loadLists);
        binding.btnCreateList.setOnClickListener(v -> showCreateListDialog());
        binding.btnMergeLists.setOnClickListener(v -> showMergeListsDialog());

        loadLists();
    }

    @Override
    public void onTabReselected() {
        if (binding != null) {
            binding.rvReadingLists.smoothScrollToPosition(0);
        }
    }

    private void loadLists() {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            binding.swipeRefreshLists.setRefreshing(false);
            UiMotionUtils.transitionLayout(binding.layoutListsRoot);
            binding.tvEmptyLists.setText("Please sign in from the Account tab to view and manage reading lists.");
            binding.tvEmptyLists.setVisibility(View.VISIBLE);
            return;
        }

        if (currentLists.isEmpty()) {
            binding.pbLists.setVisibility(View.VISIBLE);
        }
        binding.swipeRefreshLists.setRefreshing(true);

        RetrofitClient.getApi().getReadingLists().enqueue(new Callback<ReadingListsResponse>() {
            @Override
            public void onResponse(@NonNull Call<ReadingListsResponse> call, @NonNull Response<ReadingListsResponse> response) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshLists.setRefreshing(false);
                binding.pbLists.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    UiMotionUtils.transitionLayout(binding.layoutListsRoot);
                    currentLists.clear();
                    currentLists.addAll(response.body().items);
                    adapter.setLists(currentLists);
                    binding.tvEmptyLists.setVisibility(currentLists.isEmpty() ? View.VISIBLE : View.GONE);
                    if (!currentLists.isEmpty()) {
                        UiMotionUtils.replayLayoutAnimation(binding.rvReadingLists);
                    }
                } else {
                    UiMotionUtils.showError(
                            binding.getRoot(),
                            "Failed to load lists (" + response.code() + ")",
                            "RETRY",
                            v -> loadLists());
                }
            }

            @Override
            public void onFailure(@NonNull Call<ReadingListsResponse> call, @NonNull Throwable t) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshLists.setRefreshing(false);
                binding.pbLists.setVisibility(View.GONE);
                UiMotionUtils.showError(
                        binding.getRoot(),
                        "Network error loading lists",
                        "RETRY",
                        v -> loadLists());
            }
        });
    }

    private void showCreateListDialog() {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            UiMotionUtils.showInfo(binding.getRoot(), "Please sign in first");
            return;
        }

        LinearLayout layout = new LinearLayout(requireContext());
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(44, 24, 44, 20);

        final EditText etName = new EditText(requireContext());
        etName.setHint("List Name");
        etName.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary));
        layout.addView(etName);

        final EditText etDesc = new EditText(requireContext());
        etDesc.setHint("Description (Optional)");
        etDesc.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary));
        layout.addView(etDesc);

        UiMotionUtils.dialogBuilder(requireContext())
                .setTitle("Create Reading List")
                .setView(layout)
                .setPositiveButton("Create", (dialog, which) -> {
                    String name = etName.getText().toString().trim();
                    String desc = etDesc.getText().toString().trim();
                    if (!name.isEmpty()) {
                        RetrofitClient.getApi().createReadingList(new CreateReadingListRequest(name, desc))
                                .enqueue(new Callback<ReadingListDetail>() {
                                    @Override
                                    public void onResponse(@NonNull Call<ReadingListDetail> call, @NonNull Response<ReadingListDetail> response) {
                                        if (!isAdded() || binding == null) return;
                                        if (response.isSuccessful()) {
                                            UiMotionUtils.showInfo(binding.getRoot(), "List created");
                                            loadLists();
                                        } else {
                                            UiMotionUtils.showError(binding.getRoot(), "Could not create list", null, null);
                                        }
                                    }

                                    @Override
                                    public void onFailure(@NonNull Call<ReadingListDetail> call, @NonNull Throwable t) {
                                        if (!isAdded() || binding == null) return;
                                        UiMotionUtils.showError(binding.getRoot(), "Error creating list", null, null);
                                    }
                                });
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showMergeListsDialog() {
        if (currentLists.size() < 2) {
            UiMotionUtils.showInfo(binding.getRoot(), "You need at least 2 reading lists to perform a merge.");
            return;
        }

        String sourceId = currentLists.get(0).list_id;
        String targetId = currentLists.get(1).list_id;

        UiMotionUtils.dialogBuilder(requireContext())
                .setTitle("Merge Lists (UC-7.6)")
                .setMessage("Merge '" + currentLists.get(0).name + "' into '" + currentLists.get(1).name + "' with automatic deduplication?")
                .setPositiveButton("Merge & Deduplicate", (dialog, which) ->
                        RetrofitClient.getApi().mergeReadingLists(new MergeListsRequest(sourceId, targetId, true))
                                .enqueue(new Callback<ReadingListDetail>() {
                                    @Override
                                    public void onResponse(@NonNull Call<ReadingListDetail> call, @NonNull Response<ReadingListDetail> response) {
                                        if (!isAdded() || binding == null) return;
                                        if (response.isSuccessful()) {
                                            UiMotionUtils.showInfo(binding.getRoot(), "Lists merged successfully");
                                            loadLists();
                                        } else {
                                            UiMotionUtils.showError(binding.getRoot(), "Merge failed", null, null);
                                        }
                                    }

                                    @Override
                                    public void onFailure(@NonNull Call<ReadingListDetail> call, @NonNull Throwable t) {
                                        if (!isAdded() || binding == null) return;
                                        UiMotionUtils.showError(binding.getRoot(), "Merge network error", null, null);
                                    }
                                }))
                .setNegativeButton("Cancel", null)
                .show();
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
