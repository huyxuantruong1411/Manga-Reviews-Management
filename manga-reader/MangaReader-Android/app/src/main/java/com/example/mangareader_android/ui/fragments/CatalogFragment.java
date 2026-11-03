package com.example.mangareader_android.ui.fragments;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.Toast;
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
import java.util.Locale;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class CatalogFragment extends Fragment {

    private FragmentCatalogBinding binding;
    private MangaAdapter catalogAdapter;
    private MangaAdapter recommendationsAdapter;

    private int currentPage = 1;
    private String selectedStatus = null;
    private int totalCount = 0;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        binding = FragmentCatalogBinding.inflate(inflater, container, false);
        return binding.getRoot();
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        setupRecyclerViews();
        setupListeners();
        loadCatalogData();
    }

    private void setupRecyclerViews() {
        // Main 2-column catalog grid
        catalogAdapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(requireContext(), MangaDetailActivity.class);
            intent.putExtra(MangaDetailActivity.EXTRA_SLUG, manga.slug);
            startActivity(intent);
        });
        binding.rvCatalogGrid.setLayoutManager(new GridLayoutManager(requireContext(), 2));
        binding.rvCatalogGrid.setAdapter(catalogAdapter);

        // Recommendations horizontal row
        recommendationsAdapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(requireContext(), MangaDetailActivity.class);
            intent.putExtra(MangaDetailActivity.EXTRA_SLUG, manga.slug);
            startActivity(intent);
        });
        binding.rvRecommendations.setLayoutManager(new LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false));
        binding.rvRecommendations.setAdapter(recommendationsAdapter);
    }

    private void setupListeners() {
        binding.swipeRefreshCatalog.setOnRefreshListener(this::loadCatalogData);

        binding.btnOpenSearch.setOnClickListener(v -> {
            Intent intent = new Intent(requireContext(), SearchActivity.class);
            startActivity(intent);
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
                loadCatalogData();
            }
        });

        binding.btnNextPage.setOnClickListener(v -> {
            currentPage++;
            loadCatalogData();
        });

        binding.btnRetryCatalog.setOnClickListener(v -> loadCatalogData());

        binding.btnChangeEndpoint.setOnClickListener(v -> showChangeEndpointDialog());
    }

    private void showChangeEndpointDialog() {
        EditText input = new EditText(requireContext());
        input.setText(MangaReaderApp.getInstance().getBaseUrl());
        input.setSingleLine(true);
        input.setPadding(32, 24, 32, 24);

        new AlertDialog.Builder(requireContext())
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
        int colorAmber = ContextCompat.getColor(requireContext(), R.color.accent_amber);
        int colorSecondary = ContextCompat.getColor(requireContext(), R.color.text_secondary);

        binding.btnFilterAll.setTextColor(selectedStatus == null ? colorAmber : colorSecondary);
        binding.btnFilterOngoing.setTextColor("ongoing".equals(selectedStatus) ? colorAmber : colorSecondary);
        binding.btnFilterCompleted.setTextColor("completed".equals(selectedStatus) ? colorAmber : colorSecondary);
    }

    private void loadCatalogData() {
        boolean hasExistingData = catalogAdapter.getItemCount() > 0;
        if (!hasExistingData) {
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
                if (!isAdded()) return;
                binding.swipeRefreshCatalog.setRefreshing(false);
                binding.layoutCatalogLoading.setVisibility(View.GONE);

                if (response.isSuccessful() && response.body() != null) {
                    MangaListResponse body = response.body();
                    totalCount = body.total;
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

                        binding.tvCatalogStats.setText(String.format(Locale.US, "%d titles indexed • Page %d", totalCount, currentPage));
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
                if (!isAdded()) return;
                binding.swipeRefreshCatalog.setRefreshing(false);
                binding.layoutCatalogLoading.setVisibility(View.GONE);
                handleFetchError(t.getMessage());
            }
        });

        // Load recommendations
        RetrofitClient.getApi().getUserRecommendations().enqueue(new Callback<RecommendationsResponse>() {
            @Override
            public void onResponse(@NonNull Call<RecommendationsResponse> call, @NonNull Response<RecommendationsResponse> response) {
                if (!isAdded()) return;
                if (response.isSuccessful() && response.body() != null && response.body().items != null && !response.body().items.isEmpty()) {
                    binding.layoutRecommendations.setVisibility(View.VISIBLE);
                    recommendationsAdapter.setMangaList(response.body().items);
                } else {
                    binding.layoutRecommendations.setVisibility(View.GONE);
                }
            }

            @Override
            public void onFailure(@NonNull Call<RecommendationsResponse> call, @NonNull Throwable t) {
                if (!isAdded()) return;
                binding.layoutRecommendations.setVisibility(View.GONE);
            }
        });
    }

    private void handleFetchError(String reason) {
        if (catalogAdapter.getItemCount() == 0) {
            binding.layoutCatalogContent.setVisibility(View.GONE);
            binding.layoutCatalogEmpty.setVisibility(View.GONE);
            binding.layoutCatalogError.setVisibility(View.VISIBLE);
            binding.tvEndpointInfo.setText(String.format("Target: %s", MangaReaderApp.getInstance().getBaseUrl()));
            binding.tvCatalogStats.setText("Offline • Connection failed");
        } else {
            Toast.makeText(getContext(), "Sync error: " + reason, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        binding = null;
    }
}
