package com.example.mangareader_android.ui.fragments;

import android.app.AlertDialog;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.ReadingListModels.*;
import com.example.mangareader_android.databinding.FragmentListsBinding;
import com.example.mangareader_android.ui.adapters.ReadingListAdapter;
import java.util.ArrayList;
import java.util.List;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class ListsFragment extends Fragment {

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
            Toast.makeText(getContext(), list.name + " (" + list.manga_count + " titles)", Toast.LENGTH_SHORT).show();
        });
        binding.rvReadingLists.setLayoutManager(new LinearLayoutManager(requireContext()));
        binding.rvReadingLists.setAdapter(adapter);

        binding.btnCreateList.setOnClickListener(v -> showCreateListDialog());
        binding.btnMergeLists.setOnClickListener(v -> showMergeListsDialog());

        loadLists();
    }

    private void loadLists() {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            binding.tvEmptyLists.setText("Please sign in from the Account tab to view and manage reading lists.");
            binding.tvEmptyLists.setVisibility(View.VISIBLE);
            return;
        }

        binding.pbLists.setVisibility(View.VISIBLE);
        RetrofitClient.getApi().getReadingLists().enqueue(new Callback<ReadingListsResponse>() {
            @Override
            public void onResponse(@NonNull Call<ReadingListsResponse> call, @NonNull Response<ReadingListsResponse> response) {
                binding.pbLists.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    currentLists.clear();
                    currentLists.addAll(response.body().items);
                    adapter.setLists(currentLists);
                    binding.tvEmptyLists.setVisibility(currentLists.isEmpty() ? View.VISIBLE : View.GONE);
                } else {
                    Toast.makeText(getContext(), "Failed to load lists", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<ReadingListsResponse> call, @NonNull Throwable t) {
                binding.pbLists.setVisibility(View.GONE);
                Toast.makeText(getContext(), "Network error", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void showCreateListDialog() {
        if (!MangaReaderApp.getInstance().isAuthenticated()) {
            Toast.makeText(getContext(), "Please sign in first", Toast.LENGTH_SHORT).show();
            return;
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(requireContext());
        builder.setTitle("Create Reading List");

        LinearLayout layout = new LinearLayout(requireContext());
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(40, 20, 40, 20);

        final EditText etName = new EditText(requireContext());
        etName.setHint("List Name");
        layout.addView(etName);

        final EditText etDesc = new EditText(requireContext());
        etDesc.setHint("Description (Optional)");
        layout.addView(etDesc);

        builder.setView(layout);
        builder.setPositiveButton("Create", (dialog, which) -> {
            String name = etName.getText().toString().trim();
            String desc = etDesc.getText().toString().trim();
            if (!name.isEmpty()) {
                RetrofitClient.getApi().createReadingList(new CreateReadingListRequest(name, desc))
                        .enqueue(new Callback<ReadingListDetail>() {
                            @Override
                            public void onResponse(@NonNull Call<ReadingListDetail> call, @NonNull Response<ReadingListDetail> response) {
                                if (response.isSuccessful()) {
                                    Toast.makeText(getContext(), "List created", Toast.LENGTH_SHORT).show();
                                    loadLists();
                                }
                            }

                            @Override
                            public void onFailure(@NonNull Call<ReadingListDetail> call, @NonNull Throwable t) {
                                Toast.makeText(getContext(), "Error creating list", Toast.LENGTH_SHORT).show();
                            }
                        });
            }
        });
        builder.setNegativeButton("Cancel", null);
        builder.show();
    }

    private void showMergeListsDialog() {
        if (currentLists.size() < 2) {
            Toast.makeText(getContext(), "You need at least 2 reading lists to perform a merge.", Toast.LENGTH_SHORT).show();
            return;
        }

        String sourceId = currentLists.get(0).list_id;
        String targetId = currentLists.get(1).list_id;

        new AlertDialog.Builder(requireContext())
                .setTitle("Merge Lists (UC-7.6)")
                .setMessage("Merge '" + currentLists.get(0).name + "' into '" + currentLists.get(1).name + "' with automatic deduplication?")
                .setPositiveButton("Merge & Deduplicate", (dialog, which) -> {
                    RetrofitClient.getApi().mergeReadingLists(new MergeListsRequest(sourceId, targetId, true))
                            .enqueue(new Callback<ReadingListDetail>() {
                                @Override
                                public void onResponse(@NonNull Call<ReadingListDetail> call, @NonNull Response<ReadingListDetail> response) {
                                    if (response.isSuccessful()) {
                                        Toast.makeText(getContext(), "Lists merged successfully", Toast.LENGTH_SHORT).show();
                                        loadLists();
                                    }
                                }

                                @Override
                                public void onFailure(@NonNull Call<ReadingListDetail> call, @NonNull Throwable t) {
                                    Toast.makeText(getContext(), "Merge failed", Toast.LENGTH_SHORT).show();
                                }
                            });
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}

