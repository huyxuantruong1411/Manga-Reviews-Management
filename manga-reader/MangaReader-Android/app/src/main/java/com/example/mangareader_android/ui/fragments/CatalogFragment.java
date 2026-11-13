package com.example.mangareader_android.ui.fragments;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.example.mangareader_android.MangaReaderApp;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.MangaModels.MangaListResponse;
import com.example.mangareader_android.data.model.MangaModels.RecommendationsResponse;
import com.example.mangareader_android.databinding.FragmentCatalogBinding;
import com.example.mangareader_android.ui.activities.MangaDetailActivity;
import com.example.mangareader_android.ui.activities.SearchActivity;
import com.example.mangareader_android.ui.adapters.MangaAdapter;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.Locale;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class CatalogFragment extends Fragment implements UiMotionUtils.OnTabReselectedListener {

    private static final String PREFS_NAME = "manga_reader_ui_prefs";
    private static final String KEY_LIST_MODE = "catalog_list_mode";

    private FragmentCatalogBinding binding;
    private MangaAdapter catalogAdapter;
    private MangaAdapter recommendationsAdapter;

    private int currentPage = 1;
    private String selectedStatus = null;
    private int totalCount = 0;
    private boolean isListMode = false;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentCatalogBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        SharedPreferences prefs = requireContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        isListMode = prefs.getBoolean(KEY_LIST_MODE, false);

        setupRecyclerViews();
        applyCatalogLayoutMode(false);
        updateFilterButtons();
        setupListeners();
        loadCatalogData();
    }

    @Override
    public void onTabReselected() {
        if (binding != null) {
            binding.scrollCatalog.smoothScrollTo(0, 0);
        }
    }

    private void setupRecyclerViews() {
        catalogAdapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(requireContext(), MangaDetailActivity.class);
            intent.putExtra(MangaDetailActivity.EXTRA_SLUG, manga.slug);
            startActivity(intent);
            UiMotionUtils.applyActivityOpenTransition(requireActivity());
        });
        binding.rvCatalogGrid.setAdapter(catalogAdapter);

        recommendationsAdapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(requireContext(), MangaDetailActivity.class);
            intent.putExtra(MangaDetailActivity.EXTRA_SLUG, manga.slug);
            startActivity(intent);
            UiMotionUtils.applyActivityOpenTransition(requireActivity());
        });
        binding.rvRecommendations.setLayoutManager(
                new LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false));
        binding.rvRecommendations.setAdapter(recommendationsAdapter);
    }

    private void applyCatalogLayoutMode(boolean animate) {
        if (binding == null) {
            return;
        }
        if (animate) {
            UiMotionUtils.transitionLayout(binding.layoutCatalogContent);
        }
        if (isListMode) {
            binding.rvCatalogGrid.setLayoutManager(new LinearLayoutManager(requireContext()));
            binding.btnToggleCatalogLayout.setImageResource(R.drawable.ic_view_grid);
            binding.btnToggleCatalogLayout.setContentDescription("Switch to grid view");
        } else {
            binding.rvCatalogGrid.setLayoutManager(new GridLayoutManager(requireContext(), 2));
            binding.btnToggleCatalogLayout.setImageResource(R.drawable.ic_view_list);
            binding.btnToggleCatalogLayout.setContentDescription("Switch to list view");
        }
        catalogAdapter.setViewMode(isListMode);
        if (animate && catalogAdapter.getItemCount() > 0) {
            UiMotionUtils.replayLayoutAnimation(binding.rvCatalogGrid);
        }
    }

    private void setupListeners() {
        binding.swipeRefreshCatalog.setOnRefreshListener(this::loadCatalogData);

        binding.btnOpenSearch.setOnClickListener(v -> {
            Intent intent = new Intent(requireContext(), SearchActivity.class);
            startActivity(intent);
            UiMotionUtils.applyActivityOpenTransition(requireActivity());
        });

        binding.btnToggleCatalogLayout.setOnClickListener(v -> {
            isListMode = !isListMode;
            requireContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_LIST_MODE, isListMode)
                    .apply();
            applyCatalogLayoutMode(true);
        });

        binding.btnFilterAll.setOnClickListener(v -> {
            selectedStatus = null;
            currentPage = 1;
            updateFilterButtons();
            loadCatalogData();
        });

        binding.btnFilterOngoing.setOnClickListener(v -> {
            selectedStatus = "ongoing";
            currentPage = 1;
            updateFilterButtons();
            loadCatalogData();
        });

        binding.btnFilterCompleted.setOnClickListener(v -> {
            selectedStatus = "completed";
            currentPage = 1;
            updateFilterButtons();
            loadCatalogData();
        });

        binding.btnPrevPage.setOnClickListener(v -> {
            if (currentPage > 1) {
                currentPage--;
                binding.scrollCatalog.smoothScrollTo(0, 0);
                loadCatalogData();
            }
        });

        binding.btnNextPage.setOnClickListener(v -> {
            currentPage++;
            binding.scrollCatalog.smoothScrollTo(0, 0);
            loadCatalogData();
        });

        binding.btnRetryCatalog.setOnClickListener(v -> loadCatalogData());

        binding.btnChangeEndpoint.setOnClickListener(v -> showChangeEndpointDialog());
    }

    private void showChangeEndpointDialog() {
        EditText input = new EditText(requireContext());
        input.setText(MangaReaderApp.getInstance().getBaseUrl());
        input.setSingleLine(true);
        input.setTextColor(ContextCompat.getColor(requireContext(), R.color.text_primary));
        input.setPadding(40, 28, 40, 28);

        UiMotionUtils.dialogBuilder(requireContext())
                .setTitle("Configure Manga API Server URL")
                .setMessage("Android Emulator: http://10.0.2.2:18000/\nPhysical Phone: http://<PC_LAN_IP>:18000/")
                .setView(input)
                .setPositiveButton("Save & Connect", (dialog, which) -> {
                    String newUrl = input.getText().toString().trim();
                    if (!newUrl.isEmpty()) {
                        MangaReaderApp.getInstance().setBaseUrl(newUrl);
                        loadCatalogData();
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void updateFilterButtons() {
        UiMotionUtils.transitionLayout(binding.layoutCatalogRoot);
        styleFilterButton(binding.btnFilterAll, selectedStatus == null);
        styleFilterButton(binding.btnFilterOngoing, "ongoing".equals(selectedStatus));
        styleFilterButton(binding.btnFilterCompleted, "completed".equals(selectedStatus));
    }

    private void styleFilterButton(Button button, boolean active) {
        int bgColor = ContextCompat.getColor(
                requireContext(), active ? R.color.surface_elevated : R.color.surface_dark);
        int textColor = ContextCompat.getColor(
                requireContext(), active ? R.color.accent_amber : R.color.text_secondary);
        button.setBackgroundTintList(ColorStateList.valueOf(bgColor));
        button.setTextColor(textColor);
    }

    private void loadCatalogData() {
        boolean hasExistingData = catalogAdapter.getItemCount() > 0;
        if (!hasExistingData) {
            UiMotionUtils.transitionLayout(binding.layoutCatalogRoot);
            binding.layoutCatalogLoading.setVisibility(View.VISIBLE);
            binding.layoutCatalogError.setVisibility(View.GONE);
            binding.layoutCatalogEmpty.setVisibility(View.GONE);
            binding.layoutCatalogContent.setVisibility(View.GONE);
            binding.tvCatalogStats.setText("Connecting to server...");
        }

        binding.swipeRefreshCatalog.setRefreshing(true);

        RetrofitClient.getApi().getMangas(
                currentPage, 24, "latest_update", selectedStatus, null, null, null
        ).enqueue(new Callback<MangaListResponse>() {
            @Override
            public void onResponse(@NonNull Call<MangaListResponse> call, @NonNull Response<MangaListResponse> response) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshCatalog.setRefreshing(false);
                binding.layoutCatalogLoading.setVisibility(View.GONE);

                if (response.isSuccessful() && response.body() != null) {
                    MangaListResponse body = response.body();
                    totalCount = body.total;
                    boolean wasHidden = binding.layoutCatalogContent.getVisibility() != View.VISIBLE;
                    UiMotionUtils.transitionLayout(binding.layoutCatalogRoot);
                    catalogAdapter.setMangaList(body.items);

                    if (body.items == null || body.items.isEmpty()) {
                        binding.layoutCatalogEmpty.setVisibility(View.VISIBLE);
                        binding.layoutCatalogContent.setVisibility(View.GONE);
                        binding.layoutCatalogError.setVisibility(View.GONE);
                        binding.tvCatalogStats.setText("0 titles found");
                    } else {
                        binding.layoutCatalogEmpty.setVisibility(View.GONE);
                        binding.layoutCatalogError.setVisibility(View.GONE);
                        binding.layoutCatalogContent.setVisibility(View.VISIBLE);
                        if (wasHidden) {
                            UiMotionUtils.replayLayoutAnimation(binding.rvCatalogGrid);
                        }

                        binding.tvCatalogStats.setText(String.format(Locale.US, "%d titles indexed | Page %d", totalCount, currentPage));
                        binding.tvPageIndicator.setText(String.format(Locale.US, "Page %d", currentPage));

                        binding.btnPrevPage.setEnabled(currentPage > 1);
                        binding.btnNextPage.setEnabled(body.items.size() == 24);
                    }
                } else {
                    handleFetchError("Server returned code " + response.code());
                }
            }

            @Override
            public void onFailure(@NonNull Call<MangaListResponse> call, @NonNull Throwable t) {
                if (!isAdded() || binding == null) return;
                binding.swipeRefreshCatalog.setRefreshing(false);
                binding.layoutCatalogLoading.setVisibility(View.GONE);
                handleFetchError(t.getMessage());
            }
        });

        RetrofitClient.getApi().getUserRecommendations().enqueue(new Callback<RecommendationsResponse>() {
            @Override
            public void onResponse(@NonNull Call<RecommendationsResponse> call, @NonNull Response<RecommendationsResponse> response) {
                if (!isAdded() || binding == null) return;
                if (response.isSuccessful() && response.body() != null && response.body().items != null && !response.body().items.isEmpty()) {
                    UiMotionUtils.transitionLayout(binding.layoutCatalogRoot);
                    binding.layoutRecommendations.setVisibility(View.VISIBLE);
                    recommendationsAdapter.setMangaList(response.body().items);
                } else {
                    binding.layoutRecommendations.setVisibility(View.GONE);
                }
            }

            @Override
            public void onFailure(@NonNull Call<RecommendationsResponse> call, @NonNull Throwable t) {
                if (!isAdded() || binding == null) return;
                binding.layoutRecommendations.setVisibility(View.GONE);
            }
        });
    }

    private void handleFetchError(String reason) {
        if (binding == null) {
            return;
        }
        if (catalogAdapter.getItemCount() == 0) {
            UiMotionUtils.transitionLayout(binding.layoutCatalogRoot);
            binding.layoutCatalogContent.setVisibility(View.GONE);
            binding.layoutCatalogEmpty.setVisibility(View.GONE);
            binding.layoutCatalogError.setVisibility(View.VISIBLE);
            binding.tvEndpointInfo.setText(String.format("Target: %s", MangaReaderApp.getInstance().getBaseUrl()));
            binding.tvCatalogStats.setText("Offline - Connection failed");
        } else {
            UiMotionUtils.showError(
                    binding.getRoot(),
                    "Sync error: " + (reason != null ? reason : "Network failure"),
                    "RETRY",
                    v -> loadCatalogData());
        }
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
