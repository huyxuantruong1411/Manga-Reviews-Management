import React, { useState } from "react";
import { ImageOff, RefreshCw, BookOpen } from "lucide-react";

interface CoverImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  containerClassName?: string;
  priority?: boolean;
}

export const CoverImage: React.FC<CoverImageProps> = ({
  src,
  alt,
  className = "",
  containerClassName = "",
  priority = false,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (!src) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center bg-zinc-950 text-zinc-600 ${containerClassName}`}
      >
        <BookOpen className="w-7 h-7 opacity-40" />
        <span className="text-[10px] font-mono mt-1.5 text-zinc-600">
          NO COVER
        </span>
      </div>
    );
  }

  if (failed) {
    return (
      <div
        role="alert"
        className={`relative flex flex-col items-center justify-center gap-1.5 bg-zinc-950 text-zinc-400 p-3 text-center ${containerClassName}`}
      >
        <ImageOff className="w-5 h-5 text-rose-400/70" />
        <span className="text-[10px] text-zinc-500">Lỗi tải ảnh</span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFailed(false);
            setLoaded(false);
            setAttempt((prev) => prev + 1);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 hover:border-emerald-500/50 text-[10px] text-zinc-300 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Thử lại</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-zinc-950 ${containerClassName}`}>
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-zinc-900 animate-shimmer motion-reduce:after:hidden"
        />
      )}
      <img
        key={`${src}-${attempt}`}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`${className} transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
};

