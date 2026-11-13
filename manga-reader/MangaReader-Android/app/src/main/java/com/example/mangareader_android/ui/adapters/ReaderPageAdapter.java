package com.example.mangareader_android.ui.adapters;

import android.graphics.drawable.Drawable;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.RecyclerView;
import com.bumptech.glide.Glide;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;
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
    private boolean pagedMode = false;

    public ReaderPageAdapter(OnPageClickListener clickListener) {
        this.clickListener = clickListener;
    }

    public void setPagedMode(boolean pagedMode) {
        if (this.pagedMode != pagedMode) {
            this.pagedMode = pagedMode;
            notifyDataSetChanged();
        }
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
                LayoutInflater.from(parent.getContext()), parent, false);
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
            ViewGroup.LayoutParams rootParams = itemView.getLayoutParams();
            if (rootParams != null) {
                rootParams.width = ViewGroup.LayoutParams.MATCH_PARENT;
                rootParams.height = pagedMode
                        ? ViewGroup.LayoutParams.MATCH_PARENT
                        : ViewGroup.LayoutParams.WRAP_CONTENT;
                itemView.setLayoutParams(rootParams);
            }

            ViewGroup.LayoutParams imgParams = binding.imgReaderPage.getLayoutParams();
            if (imgParams != null) {
                imgParams.width = ViewGroup.LayoutParams.MATCH_PARENT;
                imgParams.height = pagedMode
                        ? ViewGroup.LayoutParams.MATCH_PARENT
                        : ViewGroup.LayoutParams.WRAP_CONTENT;
                binding.imgReaderPage.setLayoutParams(imgParams);
            }
            binding.imgReaderPage.setAdjustViewBounds(!pagedMode);

            binding.tvPageNumberOverlay.setText(
                    String.format(Locale.US, "Page %d / %d", page.page_number, pages.size()));

            loadPageImage(page);

            binding.btnRetryPage.setOnClickListener(v -> loadPageImage(page));
            itemView.setOnClickListener(v -> {
                if (clickListener != null) {
                    clickListener.onPageClick();
                }
            });
        }

        private void loadPageImage(ChapterPageItem page) {
            binding.pbPageLoading.setVisibility(View.VISIBLE);
            binding.layoutPageError.setVisibility(View.GONE);
            binding.imgReaderPage.setVisibility(View.VISIBLE);

            Glide.with(itemView.getContext())
                    .load(page.image_url)
                    .placeholder(R.color.black)
                    .transition(DrawableTransitionOptions.withCrossFade(150))
                    .listener(new RequestListener<Drawable>() {
                        @Override
                        public boolean onLoadFailed(
                                @Nullable GlideException e,
                                Object model,
                                Target<Drawable> target,
                                boolean isFirstResource) {
                            binding.pbPageLoading.setVisibility(View.GONE);
                            binding.layoutPageError.setVisibility(View.VISIBLE);
                            binding.tvPageErrorMsg.setText(String.format(
                                    Locale.US, "Page %d failed to load", page.page_number));
                            return false;
                        }

                        @Override
                        public boolean onResourceReady(
                                Drawable resource,
                                Object model,
                                Target<Drawable> target,
                                DataSource dataSource,
                                boolean isFirstResource) {
                            binding.pbPageLoading.setVisibility(View.GONE);
                            binding.layoutPageError.setVisibility(View.GONE);
                            return false;
                        }
                    })
                    .into(binding.imgReaderPage);
        }
    }
}
