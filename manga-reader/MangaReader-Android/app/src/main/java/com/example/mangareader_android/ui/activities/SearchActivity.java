package com.example.mangareader_android.ui.activities;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.ArrayAdapter;
import androidx.activity.EdgeToEdge;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.LinearLayoutManager;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.MangaModels.*;
import com.example.mangareader_android.databinding.ActivitySearchBinding;
import com.example.mangareader_android.ui.adapters.MangaAdapter;
import com.example.mangareader_android.util.UiMotionUtils;
import java.util.ArrayList;
import java.util.List;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class SearchActivity extends AppCompatActivity {

    private static final String PREFS_NAME = "manga_reader_ui_prefs";
    private static final String KEY_SEARCH_LIST_MODE = "search_list_mode";

    private ActivitySearchBinding binding;
    private MangaAdapter adapter;
    private String searchType = "title";
    private boolean isListMode = false;

    private final Handler debounceHandler = new Handler(Looper.getMainLooper());
    private Runnable debounceRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        binding = ActivitySearchBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        ViewCompat.setOnApplyWindowInsetsListener(binding.getRoot(), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        isListMode = prefs.getBoolean(KEY_SEARCH_LIST_MODE, false);

        setupViews();
        applyLayoutMode(false);
        updateModeButtons();
        setupListeners();
    }

    private void setupViews() {
        adapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(this, MangaDetailActivity.class);
            intent.putExtra(MangaDetailActivity.EXTRA_SLUG, manga.slug);
            startActivity(intent);
            UiMotionUtils.applyActivityOpenTransition(this);
        });
        binding.rvSearchResults.setAdapter(adapter);
    }

    private void applyLayoutMode(boolean animate) {
        if (animate) {
            UiMotionUtils.transitionLayout(binding.layoutSearchRoot);
        }
        if (isListMode) {
            binding.rvSearchResults.setLayoutManager(new LinearLayoutManager(this));
            binding.btnSearchLayoutToggle.setImageResource(R.drawable.ic_view_grid);
            binding.btnSearchLayoutToggle.setContentDescription("Switch search results to grid");
        } else {
            binding.rvSearchResults.setLayoutManager(new GridLayoutManager(this, 2));
            binding.btnSearchLayoutToggle.setImageResource(R.drawable.ic_view_list);
            binding.btnSearchLayoutToggle.setContentDescription("Switch search results to list");
        }
        adapter.setViewMode(isListMode);
        if (animate && adapter.getItemCount() > 0) {
            UiMotionUtils.replayLayoutAnimation(binding.rvSearchResults);
        }
    }

    private void updateModeButtons() {
        int bgActive = ContextCompat.getColor(this, R.color.surface_elevated);
        int bgInactive = ContextCompat.getColor(this, R.color.surface_dark);
        int textActive = ContextCompat.getColor(this, R.color.accent_amber);
        int textInactive = ContextCompat.getColor(this, R.color.text_secondary);

        boolean isTitle = "title".equals(searchType);
        binding.btnModeTitle.setBackgroundTintList(ColorStateList.valueOf(isTitle ? bgActive : bgInactive));
        binding.btnModeTitle.setTextColor(isTitle ? textActive : textInactive);

        binding.btnModeCreator.setBackgroundTintList(ColorStateList.valueOf(!isTitle ? bgActive : bgInactive));
        binding.btnModeCreator.setTextColor(!isTitle ? textActive : textInactive);
    }

    private void setupListeners() {
        binding.btnSearchBack.setOnClickListener(v -> finish());

        binding.btnSearchLayoutToggle.setOnClickListener(v -> {
            isListMode = !isListMode;
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_SEARCH_LIST_MODE, isListMode)
                    .apply();
            applyLayoutMode(true);
        });

        binding.btnModeTitle.setOnClickListener(v -> {
            searchType = "title";
            updateModeButtons();
            executeSearch();
        });

        binding.btnModeCreator.setOnClickListener(v -> {
            searchType = "creator";
            updateModeButtons();
            executeSearch();
        });

        binding.btnExecuteSearch.setOnClickListener(v -> executeSearch());

        binding.etSearchQuery.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                executeSearch();
                return true;
            }
            return false;
        });

        binding.etSearchQuery.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                if (debounceRunnable != null) {
                    debounceHandler.removeCallbacks(debounceRunnable);
                }
                if (s.length() >= 2) {
                    debounceRunnable = () -> fetchAutocomplete(s.toString().trim());
                    debounceHandler.postDelayed(debounceRunnable, 300);
                } else {
                    binding.lvAutocomplete.setVisibility(View.GONE);
                }
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });
    }

    private void fetchAutocomplete(String query) {
        RetrofitClient.getApi().autocomplete(query).enqueue(new Callback<AutocompleteResponse>() {
            @Override
            public void onResponse(@NonNull Call<AutocompleteResponse> call, @NonNull Response<AutocompleteResponse> response) {
                if (isFinishing() || isDestroyed()) return;
                if (response.isSuccessful() && response.body() != null && response.body().items != null && !response.body().items.isEmpty()) {
                    List<String> titles = new ArrayList<>();
                    for (AutocompleteItem item : response.body().items) {
                        titles.add(item.title);
                    }
                    ArrayAdapter<String> autoAdapter = new ArrayAdapter<>(
                            SearchActivity.this, android.R.layout.simple_list_item_1, titles);
                    binding.lvAutocomplete.setAdapter(autoAdapter);
                    if (binding.lvAutocomplete.getVisibility() != View.VISIBLE) {
                        UiMotionUtils.transitionLayout(binding.layoutSearchRoot);
                        binding.lvAutocomplete.setVisibility(View.VISIBLE);
                    }

                    binding.lvAutocomplete.setOnItemClickListener((parent, view, position, id) -> {
                        String selectedTitle = titles.get(position);
                        binding.etSearchQuery.setText(selectedTitle);
                        binding.lvAutocomplete.setVisibility(View.GONE);
                        executeSearch();
                    });
                } else {
                    binding.lvAutocomplete.setVisibility(View.GONE);
                }
            }

            @Override
            public void onFailure(@NonNull Call<AutocompleteResponse> call, @NonNull Throwable t) {
                if (isFinishing() || isDestroyed()) return;
                binding.lvAutocomplete.setVisibility(View.GONE);
            }
        });
    }

    private void executeSearch() {
        String query = binding.etSearchQuery.getText().toString().trim();
        if (query.isEmpty()) return;

        binding.lvAutocomplete.setVisibility(View.GONE);
        binding.pbSearch.setVisibility(View.VISIBLE);
        binding.tvSearchEmpty.setVisibility(View.GONE);

        RetrofitClient.getApi().searchMangas(query, searchType).enqueue(new Callback<MangaSearchResponse>() {
            @Override
            public void onResponse(@NonNull Call<MangaSearchResponse> call, @NonNull Response<MangaSearchResponse> response) {
                if (isFinishing() || isDestroyed()) return;
                binding.pbSearch.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    List<MangaItem> items = response.body().items;
                    UiMotionUtils.transitionLayout(binding.layoutSearchRoot);
                    adapter.setMangaList(items);
                    if (items.isEmpty()) {
                        binding.tvSearchEmpty.setText("No manga matched '" + query + "'");
                        binding.tvSearchEmpty.setVisibility(View.VISIBLE);
                    } else {
                        binding.tvSearchEmpty.setVisibility(View.GONE);
                        UiMotionUtils.replayLayoutAnimation(binding.rvSearchResults);
                    }
                } else {
                    UiMotionUtils.showError(
                            binding.getRoot(),
                            "Search error (" + response.code() + ")",
                            "RETRY",
                            v -> executeSearch());
                }
            }

            @Override
            public void onFailure(@NonNull Call<MangaSearchResponse> call, @NonNull Throwable t) {
                if (isFinishing() || isDestroyed()) return;
                binding.pbSearch.setVisibility(View.GONE);
                UiMotionUtils.showError(
                        binding.getRoot(),
                        "Network error during search",
                        "RETRY",
                        v -> executeSearch());
            }
        });
    }

    @Override
    public void finish() {
        super.finish();
        UiMotionUtils.applyActivityCloseTransition(this);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        debounceHandler.removeCallbacksAndMessages(null);
    }
}
