package com.example.mangareader_android.ui.activities;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.ArrayAdapter;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.GridLayoutManager;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.api.RetrofitClient;
import com.example.mangareader_android.data.model.MangaModels.*;
import com.example.mangareader_android.databinding.ActivitySearchBinding;
import com.example.mangareader_android.ui.adapters.MangaAdapter;
import java.util.ArrayList;
import java.util.List;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class SearchActivity extends AppCompatActivity {

    private ActivitySearchBinding binding;
    private MangaAdapter adapter;
    private String searchType = "title"; // "title" or "creator"

    private final Handler debounceHandler = new Handler(Looper.getMainLooper());
    private Runnable debounceRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        binding = ActivitySearchBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        setupViews();
        setupListeners();
    }

    private void setupViews() {
        adapter = new MangaAdapter(manga -> {
            Intent intent = new Intent(this, MangaDetailActivity.class);
            intent.putExtra(MangaDetailActivity.EXTRA_SLUG, manga.slug);
            startActivity(intent);
        });
        binding.rvSearchResults.setLayoutManager(new GridLayoutManager(this, 2));
        binding.rvSearchResults.setAdapter(adapter);
    }

    private void setupListeners() {
        binding.btnSearchBack.setOnClickListener(v -> finish());

        binding.btnModeTitle.setOnClickListener(v -> {
            searchType = "title";
            binding.btnModeTitle.setTextColor(ContextCompat.getColor(this, R.color.accent_amber));
            binding.btnModeCreator.setTextColor(ContextCompat.getColor(this, R.color.text_secondary));
            executeSearch();
        });

        binding.btnModeCreator.setOnClickListener(v -> {
            searchType = "creator";
            binding.btnModeCreator.setTextColor(ContextCompat.getColor(this, R.color.accent_amber));
            binding.btnModeTitle.setTextColor(ContextCompat.getColor(this, R.color.text_secondary));
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
                if (response.isSuccessful() && response.body() != null && response.body().items != null && !response.body().items.isEmpty()) {
                    List<String> titles = new ArrayList<>();
                    for (AutocompleteItem item : response.body().items) {
                        titles.add(item.title);
                    }
                    ArrayAdapter<String> autoAdapter = new ArrayAdapter<>(SearchActivity.this,
                            android.R.layout.simple_list_item_1, titles);
                    binding.lvAutocomplete.setAdapter(autoAdapter);
                    binding.lvAutocomplete.setVisibility(View.VISIBLE);

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
                binding.pbSearch.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    List<MangaItem> items = response.body().items;
                    adapter.setMangaList(items);
                    if (items.isEmpty()) {
                        binding.tvSearchEmpty.setText("No manga matched '" + query + "'");
                        binding.tvSearchEmpty.setVisibility(View.VISIBLE);
                    } else {
                        binding.tvSearchEmpty.setVisibility(View.GONE);
                    }
                } else {
                    Toast.makeText(SearchActivity.this, "Search error", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(@NonNull Call<MangaSearchResponse> call, @NonNull Throwable t) {
                binding.pbSearch.setVisibility(View.GONE);
                Toast.makeText(SearchActivity.this, "Network error", Toast.LENGTH_SHORT).show();
            }
        });
    }
}

