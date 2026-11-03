package com.example.mangareader_android.ui.adapters;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;
import com.bumptech.glide.Glide;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.model.MangaModels.MangaItem;
import com.example.mangareader_android.databinding.ItemMangaGridBinding;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MangaAdapter extends RecyclerView.Adapter<MangaAdapter.MangaViewHolder> {

    public interface OnMangaClickListener {
        void onMangaClick(MangaItem manga);
    }

    private final List<MangaItem> mangaList = new ArrayList<>();
    private final OnMangaClickListener listener;

    public MangaAdapter(OnMangaClickListener listener) {
        this.listener = listener;
    }

    public void setMangaList(List<MangaItem> list) {
        mangaList.clear();
        if (list != null) {
            mangaList.addAll(list);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public MangaViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemMangaGridBinding binding = ItemMangaGridBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false
        );
        return new MangaViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull MangaViewHolder holder, int position) {
        holder.bind(mangaList.get(position));
    }

    @Override
    public int getItemCount() {
        return mangaList.size();
    }

    class MangaViewHolder extends RecyclerView.ViewHolder {
        private final ItemMangaGridBinding binding;

        MangaViewHolder(ItemMangaGridBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(MangaItem item) {
            Context context = itemView.getContext();
            binding.tvTitle.setText(item.title);
            binding.tvChapterCount.setText(String.format(Locale.US, "%d chs", item.chapter_count));
            binding.tvDemographic.setText(item.publication_demographic != null ? item.publication_demographic.toUpperCase() : "MANGA");

            // Status styling
            if ("completed".equalsIgnoreCase(item.status)) {
                binding.tvStatus.setText("COMPLETED");
                binding.tvStatus.setTextColor(ContextCompat.getColor(context, R.color.accent_emerald));
            } else {
                binding.tvStatus.setText("ONGOING");
                binding.tvStatus.setTextColor(ContextCompat.getColor(context, R.color.accent_amber));
            }

            // Rating
            if (item.average_rating > 0.0) {
                binding.tvRating.setVisibility(View.VISIBLE);
                binding.tvRating.setText(String.format(Locale.US, "%.1f *", item.average_rating));
            } else {
                binding.tvRating.setVisibility(View.GONE);
            }

            // Cover Image
            Glide.with(context)
                    .load(item.cover_url)
                    .placeholder(R.color.surface_elevated)
                    .error(R.color.surface_elevated)
                    .into(binding.imgCover);

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onMangaClick(item);
                }
            });
        }
    }
}

