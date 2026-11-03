package com.example.mangareader_android.ui.adapters;

import android.view.LayoutInflater;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.bumptech.glide.Glide;
import com.example.mangareader_android.R;
import com.example.mangareader_android.data.model.ChapterModels.ChapterPageItem;
import com.example.mangareader_android.databinding.ItemReaderPageBinding;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class ReaderPageAdapter extends RecyclerView.Adapter<ReaderPageAdapter.PageViewHolder> {

    public interface OnPageClickListener {
        void onPageClick();
    }

    private final List<ChapterPageItem> pages = new ArrayList<>();
    private final OnPageClickListener clickListener;

    public ReaderPageAdapter(OnPageClickListener clickListener) {
        this.clickListener = clickListener;
    }

    public void setPages(List<ChapterPageItem> list) {
        pages.clear();
        if (list != null) {
            pages.addAll(list);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public PageViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemReaderPageBinding binding = ItemReaderPageBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false
        );
        return new PageViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull PageViewHolder holder, int position) {
        holder.bind(pages.get(position));
    }

    @Override
    public int getItemCount() {
        return pages.size();
    }

    class PageViewHolder extends RecyclerView.ViewHolder {
        private final ItemReaderPageBinding binding;

        PageViewHolder(ItemReaderPageBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(ChapterPageItem page) {
            binding.tvPageNumberOverlay.setText(String.format(Locale.US, "Page %d / %d", page.page_number, pages.size()));

            Glide.with(itemView.getContext())
                    .load(page.image_url)
                    .placeholder(R.color.black)
                    .error(R.color.surface_elevated)
                    .into(binding.imgReaderPage);

            itemView.setOnClickListener(v -> {
                if (clickListener != null) {
                    clickListener.onPageClick();
                }
            });
        }
    }
}

