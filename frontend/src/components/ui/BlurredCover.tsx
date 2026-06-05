import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface BlurredCoverProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  shouldBlur: boolean;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  onClick?: (e: React.MouseEvent) => void;
}

export const BlurredCover: React.FC<BlurredCoverProps> = ({
  src,
  alt,
  className = "w-full h-full object-cover",
  shouldBlur,
  referrerPolicy = "no-referrer",
  onClick,
}) => {
  const [revealed, setRevealed] = useState(false);

  if (!src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-650 text-xs bg-zinc-100 dark:bg-zinc-900 border border-[var(--border-primary)] rounded">
        <span>No Cover</span>
      </div>
    );
  }

  const isCurrentlyBlurred = shouldBlur && !revealed;

  return (
    <div className="relative w-full h-full overflow-hidden group/blur" onClick={onClick}>
      <img
        src={src}
        alt={alt}
        className={`${className} transition-all duration-300 ${
          isCurrentlyBlurred ? "filter blur-2xl scale-110 brightness-[0.4]" : ""
        }`}
        referrerPolicy={referrerPolicy}
        loading="lazy"
      />
      
      {isCurrentlyBlurred && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-[2px] transition duration-200 z-[2] prevent-nav">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setRevealed(true);
            }}
            className="p-2.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white border border-white/20 shadow-lg transition duration-200 hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center"
            title="Reveal cover art"
          >
            <EyeOff size={16} />
          </button>
          <span className="text-[10px] font-extrabold text-white/95 uppercase tracking-widest mt-2 select-none drop-shadow-md">
            NSFW BLURRED
          </span>
        </div>
      )}

      {shouldBlur && revealed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setRevealed(false);
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-zinc-950/85 hover:bg-zinc-900 text-white border border-white/10 shadow transition opacity-0 group-hover/blur:opacity-100 duration-200 z-[2] cursor-pointer flex items-center justify-center"
          title="Re-blur cover art"
        >
          <Eye size={12} />
        </button>
      )}
    </div>
  );
};

export default BlurredCover;
