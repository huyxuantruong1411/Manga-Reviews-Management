package com.example.mangareader_android.ui.adapters;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.bumptech.glide.Glide;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.model.ReadingListModels.ReadingHistoryItem;
import com.example.mangareader_android.databinding.ItemHistoryBinding;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class HistoryAdapter extends RecyclerView.Adapter<HistoryAdapter.HistoryViewHolder> {

    public interface OnResumeClickListener {
        void onResumeClick(ReadingHistoryItem item);
    }

    private final List<ReadingHistoryItem> historyList = new ArrayList<>();
    private final OnResumeClickListener listener;

    public HistoryAdapter(OnResumeClickListener listener) {
        this.listener = listener;
    }

    public void setHistoryList(List<ReadingHistoryItem> items) {
        historyList.clear();
        if (items != null) {
            historyList.addAll(items);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public HistoryViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemHistoryBinding binding = ItemHistoryBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false
        );
        return new HistoryViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull HistoryViewHolder holder, int position) {
        holder.bind(historyList.get(position));
    }

    @Override
    public int getItemCount() {
        return historyList.size();
    }

    class HistoryViewHolder extends RecyclerView.ViewHolder {
        private final ItemHistoryBinding binding;

        HistoryViewHolder(ItemHistoryBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(ReadingHistoryItem item) {
            binding.tvHistoryMangaTitle.setText(item.manga_title);
            binding.tvHistoryProgress.setText(String.format(Locale.US, "Chapter %s | Page %d", item.chapter_number, item.last_read_page));

            if (item.is_completed) {
                binding.tvHistoryCompletedBadge.setVisibility(View.VISIBLE);
            } else {
                binding.tvHistoryCompletedBadge.setVisibility(View.GONE);
            }

            Glide.with(itemView.getContext())
                    .load(item.cover_url)
                    .placeholder(R.drawable.bg_cover_placeholder)
                    .error(R.drawable.bg_cover_placeholder)
                    .transition(DrawableTransitionOptions.withCrossFade(180))
                    .into(binding.imgHistoryCover);

            binding.btnResumeReading.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onResumeClick(item);
                }
            });

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onResumeClick(item);
                }
            });
        }
    }
}

