package com.example.mangareader_android.ui.adapters;

import android.content.Context;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.DiffUtil;
import androidx.recyclerview.widget.RecyclerView;
import com.bumptech.glide.Glide;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.model.MangaModels.MangaItem;
import com.example.mangareader_android.databinding.ItemMangaGridBinding;
import com.example.mangareader_android.databinding.ItemMangaListBinding;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

public class MangaAdapter extends RecyclerView.Adapter<RecyclerView.ViewHolder> {

    public static final int VIEW_TYPE_GRID = 0;
    public static final int VIEW_TYPE_LIST = 1;

    public interface OnMangaClickListener {
        void onMangaClick(MangaItem manga);
    }

    private final List<MangaItem> mangaList = new ArrayList<>();
    private final OnMangaClickListener listener;
    private boolean listMode = false;

    public MangaAdapter(OnMangaClickListener listener) {
        this.listener = listener;
    }

    public void setViewMode(boolean isListMode) {
        if (this.listMode != isListMode) {
            this.listMode = isListMode;
            notifyDataSetChanged();
        }
    }

    public boolean isListMode() {
        return listMode;
    }

    public void setMangaList(List<MangaItem> newList) {
        List<MangaItem> safeNew = newList != null ? newList : new ArrayList<>();
        DiffUtil.DiffResult diffResult = DiffUtil.calculateDiff(new DiffUtil.Callback() {
            @Override
            public int getOldListSize() {
                return mangaList.size();
            }

            @Override
            public int getNewListSize() {
                return safeNew.size();
            }

            @Override
            public boolean areItemsTheSame(int oldPos, int newPos) {
                MangaItem oldItem = mangaList.get(oldPos);
                MangaItem newItem = safeNew.get(newPos);
                return Objects.equals(oldItem.slug, newItem.slug);
            }

            @Override
            public boolean areContentsTheSame(int oldPos, int newPos) {
                MangaItem o = mangaList.get(oldPos);
                MangaItem n = safeNew.get(newPos);
                return Objects.equals(o.title, n.title)
                        && o.chapter_count == n.chapter_count
                        && Double.compare(o.average_rating, n.average_rating) == 0
                        && Objects.equals(o.status, n.status)
                        && Objects.equals(o.cover_url, n.cover_url);
            }
        });

        mangaList.clear();
        mangaList.addAll(safeNew);
        diffResult.dispatchUpdatesTo(this);
    }

    @Override
    public int getItemViewType(int position) {
        return listMode ? VIEW_TYPE_LIST : VIEW_TYPE_GRID;
    }

    @NonNull
    @Override
    public RecyclerView.ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        LayoutInflater inflater = LayoutInflater.from(parent.getContext());
        if (viewType == VIEW_TYPE_LIST) {
            return new ListViewHolder(ItemMangaListBinding.inflate(inflater, parent, false));
        }
        return new GridViewHolder(ItemMangaGridBinding.inflate(inflater, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull RecyclerView.ViewHolder holder, int position) {
        MangaItem item = mangaList.get(position);
        if (holder instanceof ListViewHolder) {
            ((ListViewHolder) holder).bind(item);
        } else if (holder instanceof GridViewHolder) {
            ((GridViewHolder) holder).bind(item);
        }
    }

    @Override
    public int getItemCount() {
        return mangaList.size();
    }

    private void bindCommon(
            View rootView,
            ImageView imgCover,
            TextView tvTitle,
            TextView tvChapterCount,
            TextView tvDemographic,
            TextView tvStatus,
            TextView tvRating,
            @Nullable TextView tvDescription,
            MangaItem item) {
        Context context = rootView.getContext();
        tvTitle.setText(item.title);
        tvChapterCount.setText(String.format(Locale.US, "%d chs", item.chapter_count));
        tvDemographic.setText(
                item.publication_demographic != null
                        ? item.publication_demographic.toUpperCase(Locale.US)
                        : "MANGA");

        if ("completed".equalsIgnoreCase(item.status)) {
            tvStatus.setText("COMPLETED");
            tvStatus.setTextColor(ContextCompat.getColor(context, R.color.accent_emerald));
        } else {
            tvStatus.setText("ONGOING");
            tvStatus.setTextColor(ContextCompat.getColor(context, R.color.accent_amber));
        }

        if (item.average_rating > 0.0) {
            tvRating.setVisibility(View.VISIBLE);
            tvRating.setText(String.format(Locale.US, "★ %.1f", item.average_rating));
        } else {
            tvRating.setVisibility(View.GONE);
        }

        if (tvDescription != null) {
            if (item.description != null && !item.description.trim().isEmpty()) {
                tvDescription.setVisibility(View.VISIBLE);
                tvDescription.setText(item.description.trim());
            } else {
                tvDescription.setVisibility(View.GONE);
            }
        }

        Glide.with(context)
                .load(item.cover_url)
                .placeholder(R.drawable.bg_cover_placeholder)
                .error(R.drawable.bg_cover_placeholder)
                .transition(DrawableTransitionOptions.withCrossFade(180))
                .into(imgCover);

        rootView.setOnClickListener(v -> {
            if (listener != null) {
                listener.onMangaClick(item);
            }
        });
    }

    class GridViewHolder extends RecyclerView.ViewHolder {
        private final ItemMangaGridBinding binding;

        GridViewHolder(ItemMangaGridBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(MangaItem item) {
            bindCommon(
                    itemView,
                    binding.imgCover,
                    binding.tvTitle,
                    binding.tvChapterCount,
                    binding.tvDemographic,
                    binding.tvStatus,
                    binding.tvRating,
                    null,
                    item);
        }
    }

    class ListViewHolder extends RecyclerView.ViewHolder {
        private final ItemMangaListBinding binding;

        ListViewHolder(ItemMangaListBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(MangaItem item) {
            bindCommon(
                    itemView,
                    binding.imgCover,
                    binding.tvTitle,
                    binding.tvChapterCount,
                    binding.tvDemographic,
                    binding.tvStatus,
                    binding.tvRating,
                    binding.tvDescription,
                    item);
        }
    }
}
