package com.example.mangareader_android.util;

import android.app.Activity;
import android.content.Context;
import android.transition.AutoTransition;
import android.transition.TransitionManager;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AnimationUtils;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LayoutAnimationController;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.RecyclerView;

import com.example.mangareader_android.R;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.snackbar.Snackbar;

/**
 * Shared UI motion, Snackbar, Material dialog, and staggered list animation helpers.
 */
public final class UiMotionUtils {

    private UiMotionUtils() {
    }

    public interface OnTabReselectedListener {
        void onTabReselected();
    }

    public static int dpToPx(@NonNull Context context, int dp) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, dp, context.getResources().getDisplayMetrics()));
    }

    public static void transitionLayout(@Nullable ViewGroup root) {
        if (root == null || !root.isLaidOut()) {
            return;
        }
        AutoTransition transition = new AutoTransition();
        transition.setDuration(180L);
        transition.setInterpolator(new DecelerateInterpolator());
        TransitionManager.beginDelayedTransition(root, transition);
    }

    public static void replayLayoutAnimation(@Nullable RecyclerView recyclerView) {
        if (recyclerView == null) {
            return;
        }
        LayoutAnimationController controller = AnimationUtils.loadLayoutAnimation(
                recyclerView.getContext(), R.anim.layout_animation_fall_down);
        recyclerView.setLayoutAnimation(controller);
        recyclerView.scheduleLayoutAnimation();
    }

    public static void animateOverlayBar(@Nullable View bar, boolean show, boolean fromTop) {
        if (bar == null) {
            return;
        }
        bar.animate().cancel();
        float offset = bar.getHeight() > 0 ? bar.getHeight() : dpToPx(bar.getContext(), 64);
        float hiddenTranslation = fromTop ? -offset : offset;

        if (show) {
            if (bar.getVisibility() != View.VISIBLE) {
                bar.setAlpha(0f);
                bar.setTranslationY(hiddenTranslation);
                bar.setVisibility(View.VISIBLE);
            }
            bar.animate()
                    .translationY(0f)
                    .alpha(1f)
                    .setDuration(200L)
                    .setInterpolator(new DecelerateInterpolator())
                    .withEndAction(null)
                    .start();
        } else if (bar.getVisibility() == View.VISIBLE) {
            bar.animate()
                    .translationY(hiddenTranslation)
                    .alpha(0f)
                    .setDuration(180L)
                    .setInterpolator(new DecelerateInterpolator())
                    .withEndAction(() -> {
                        bar.setVisibility(View.GONE);
                        bar.setTranslationY(0f);
                        bar.setAlpha(1f);
                    })
                    .start();
        }
    }

    @NonNull
    public static MaterialAlertDialogBuilder dialogBuilder(@NonNull Context context) {
        return new MaterialAlertDialogBuilder(context);
    }

    public static void showSnackbar(
            @Nullable View anchor,
            @NonNull String message,
            @Nullable String actionLabel,
            @Nullable View.OnClickListener actionListener,
            boolean isError) {
        if (anchor == null) {
            return;
        }
        Snackbar snackbar = Snackbar.make(
                anchor,
                message,
                actionListener != null ? Snackbar.LENGTH_LONG : Snackbar.LENGTH_SHORT);
        snackbar.setBackgroundTint(ContextCompat.getColor(
                anchor.getContext(),
                isError ? R.color.surface_elevated : R.color.surface_dark));
        snackbar.setTextColor(ContextCompat.getColor(anchor.getContext(), R.color.text_primary));
        if (actionLabel != null && actionListener != null) {
            snackbar.setActionTextColor(ContextCompat.getColor(
                    anchor.getContext(),
                    isError ? R.color.accent_amber : R.color.accent_emerald));
            snackbar.setAction(actionLabel, actionListener);
        }
        snackbar.show();
    }

    public static void showInfo(@Nullable View anchor, @NonNull String message) {
        showSnackbar(anchor, message, null, null, false);
    }

    public static void showError(
            @Nullable View anchor,
            @NonNull String message,
            @Nullable String retryLabel,
            @Nullable View.OnClickListener retryListener) {
        showSnackbar(anchor, message, retryLabel, retryListener, true);
    }

    @SuppressWarnings("deprecation")
    public static void applyActivityOpenTransition(@NonNull Activity activity) {
        activity.overridePendingTransition(R.anim.slide_in_right, R.anim.slide_out_left);
    }

    @SuppressWarnings("deprecation")
    public static void applyActivityCloseTransition(@NonNull Activity activity) {
        activity.overridePendingTransition(R.anim.slide_in_left, R.anim.slide_out_right);
    }
}
