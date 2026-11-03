package com.example.mangareader_android.ui.adapters;

import android.view.LayoutInflater;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.example.mangareader_android.data.model.ReadingListModels.ReadingListDetail;
import com.example.mangareader_android.databinding.ItemReadingListBinding;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class ReadingListAdapter extends RecyclerView.Adapter<ReadingListAdapter.ListViewHolder> {

    public interface OnListClickListener {
        void onListClick(ReadingListDetail list);
    }

    private final List<ReadingListDetail> lists = new ArrayList<>();
    private final OnListClickListener listener;

    public ReadingListAdapter(OnListClickListener listener) {
        this.listener = listener;
    }

    public void setLists(List<ReadingListDetail> items) {
        lists.clear();
        if (items != null) {
            lists.addAll(items);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public ListViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemReadingListBinding binding = ItemReadingListBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false
        );
        return new ListViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull ListViewHolder holder, int position) {
        holder.bind(lists.get(position));
    }

    @Override
    public int getItemCount() {
        return lists.size();
    }

    class ListViewHolder extends RecyclerView.ViewHolder {
        private final ItemReadingListBinding binding;

        ListViewHolder(ItemReadingListBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(ReadingListDetail item) {
            binding.tvListName.setText(item.name);
            binding.tvListDescription.setText(item.description != null ? item.description : "");
            binding.tvListMangaCount.setText(String.format(Locale.US, "%d TITLES", item.manga_count));
            binding.tvListVisibility.setText(item.visibility != null ? item.visibility.toUpperCase() : "PRIVATE");

            itemView.setOnClickListener(v -> {
                if (listener != null) {
                    listener.onListClick(item);
                }
            });
        }
    }
}

