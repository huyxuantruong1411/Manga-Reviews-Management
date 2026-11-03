package com.example.mangareader_android.ui.adapters;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;
import com.example.mangareader_android.data.model.CommentModels.CommentItem;
import com.example.mangareader_android.databinding.ItemCommentBinding;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class CommentAdapter extends RecyclerView.Adapter<CommentAdapter.CommentViewHolder> {

    public interface OnCommentActionListener {
        void onReaction(CommentItem comment, String reaction);
        void onReport(CommentItem comment);
    }

    private final List<CommentItem> comments = new ArrayList<>();
    private final OnCommentActionListener listener;

    public CommentAdapter(OnCommentActionListener listener) {
        this.listener = listener;
    }

    public void setComments(List<CommentItem> list) {
        comments.clear();
        if (list != null) {
            comments.addAll(list);
        }
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public CommentViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        ItemCommentBinding binding = ItemCommentBinding.inflate(
                LayoutInflater.from(parent.getContext()), parent, false
        );
        return new CommentViewHolder(binding);
    }

    @Override
    public void onBindViewHolder(@NonNull CommentViewHolder holder, int position) {
        holder.bind(comments.get(position));
    }

    @Override
    public int getItemCount() {
        return comments.size();
    }

    class CommentViewHolder extends RecyclerView.ViewHolder {
        private final ItemCommentBinding binding;

        CommentViewHolder(ItemCommentBinding binding) {
            super(binding.getRoot());
            this.binding = binding;
        }

        void bind(CommentItem item) {
            binding.tvAuthorName.setText(item.display_name != null ? item.display_name : item.username);
            binding.tvCommentTime.setText(item.created_at != null && item.created_at.length() >= 10 ?
                    item.created_at.substring(0, 10) : "");

            binding.tvCommentContent.setText(item.content);
            binding.btnLike.setText(String.format(Locale.US, "▲ %d", item.like_count));
            binding.btnDislike.setText(String.format(Locale.US, "▼ %d", item.dislike_count));

            if (item.is_spoiler) {
                binding.tvSpoilerBadge.setVisibility(View.VISIBLE);
                if (!item.isRevealed) {
                    binding.layoutSpoilerMask.setVisibility(View.VISIBLE);
                    binding.tvCommentContent.setVisibility(View.GONE);
                } else {
                    binding.layoutSpoilerMask.setVisibility(View.GONE);
                    binding.tvCommentContent.setVisibility(View.VISIBLE);
                }
            } else {
                binding.tvSpoilerBadge.setVisibility(View.GONE);
                binding.layoutSpoilerMask.setVisibility(View.GONE);
                binding.tvCommentContent.setVisibility(View.VISIBLE);
            }

            binding.btnRevealSpoiler.setOnClickListener(v -> {
                item.isRevealed = true;
                notifyItemChanged(getAdapterPosition());
            });

            binding.btnLike.setOnClickListener(v -> {
                if (listener != null) listener.onReaction(item, "like");
            });

            binding.btnDislike.setOnClickListener(v -> {
                if (listener != null) listener.onReaction(item, "dislike");
            });

            binding.btnReportComment.setOnClickListener(v -> {
                if (listener != null) listener.onReport(item);
            });
        }
    }
}

