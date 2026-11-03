package com.example.mangareader_android;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.fragment.app.Fragment;
import com.example.mangareader_android.databinding.ActivityMainBinding;
import com.example.mangareader_android.ui.fragments.AccountFragment;
import com.example.mangareader_android.ui.fragments.CatalogFragment;
import com.example.mangareader_android.ui.fragments.HistoryFragment;
import com.example.mangareader_android.ui.fragments.ListsFragment;
import com.example.mangareader_android.ui.fragments.StatsFragment;

public class MainActivity extends AppCompatActivity {

    private ActivityMainBinding binding;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        binding = ActivityMainBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        ViewCompat.setOnApplyWindowInsetsListener(binding.main, (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            binding.fragmentContainer.setPadding(systemBars.left, systemBars.top, systemBars.right, 0);
            binding.bottomNav.setPadding(0, 0, 0, systemBars.bottom);
            return insets;
        });

        setupBottomNavigation();

        if (savedInstanceState == null) {
            switchFragment(new CatalogFragment());
        }
    }

    private void setupBottomNavigation() {
        binding.bottomNav.setOnItemSelectedListener(item -> {
            int itemId = item.getItemId();
            if (itemId == R.id.nav_catalog) {
                switchFragment(new CatalogFragment());
                return true;
            } else if (itemId == R.id.nav_lists) {
                switchFragment(new ListsFragment());
                return true;
            } else if (itemId == R.id.nav_history) {
                switchFragment(new HistoryFragment());
                return true;
            } else if (itemId == R.id.nav_stats) {
                switchFragment(new StatsFragment());
                return true;
            } else if (itemId == R.id.nav_account) {
                switchFragment(new AccountFragment());
                return true;
            }
            return false;
        });
    }

    private void switchFragment(Fragment fragment) {
        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.fragmentContainer, fragment)
                .commit();
    }
}
