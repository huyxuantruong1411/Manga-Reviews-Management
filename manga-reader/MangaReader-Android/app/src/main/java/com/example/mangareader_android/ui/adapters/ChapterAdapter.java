package com.example.mangareader_android.ui.adapters;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.example.mangareader_android.data.model.ChapterModels.ChapterItem;
import com.example.mangareader_android.databinding.ItemChapterBinding;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class ChapterAdapter extends RecyclerView.Adapter<ChapterAdapter.ChapterViewHolder> {

    public interface OnChapterClickListener {
        void onChapterClick(ChapterItem chapter);
    }

    private final List<ChapterItem> fullList = new ArrayList<>();
    private final List<ChapterItem> displayedList = new ArrayList<>();
    private final OnChapterClickListener listener;

    public ChapterAdapter(OnChapterClickListener listener) {
        this.listener = listener;
    }

    public void setChapters(List<ChapterItem> list) {
        fullList.clear();
        displayedList.clear();
        if (list != null) {
            fullList.addAll(list);
            displayedList.addAll(list);
        }
        notifyDataSetChanged();
    }

    public void filter(String query) {
        displayedList.clear();
        if (query == null || query.trim().isEmpty()) {
            displayedList.addAll(fullList);
        } else {
            String lower = query.trim().toLowerCase(Locale.US);
            for (ChapterItem ch : fullList) {
                if (ch.chapter_number.toLowerCase(Locale.US).contains(lower) ||
                        (ch.title != null && ch.title.toLowerCase(Locale.US).contains(lower))) {
                    displayedList.add(ch);
                }
            }
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ChapterViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemChapterBinding binding = ItemChapterBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false
        );
        return new ChapterViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull ChapterViewHolder holder, int position) {
        holder.bind(displayedList.get(position));
    }

    @Override
    public int getItemCount() {
        return displayedList.size();
    }

    class ChapterViewHolder extends RecyclerView.ViewHolder {
        private final ItemChapterBinding binding;

        ChapterViewHolder(ItemChapterBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(ChapterItem item) {
            binding.tvChapterNumber.setText(String.format(Locale.US, "CH %s", item.chapter_number));
            binding.tvChapterTitle.setText(item.title != null ? item.title : "");
            binding.tvPageCount.setText(String.format(Locale.US, "%dp", item.page_count));

            if (item.is_read) {
                binding.tvReadBadge.setVisibility(View.VISIBLE);
                binding.tvReadBadge.setText(item.is_completed ? "COMPLETED" : "READ");
            } else {
                binding.tvReadBadge.setVisibility(View.GONE);
            }

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onChapterClick(item);
                }
            });
        }
    }
}

