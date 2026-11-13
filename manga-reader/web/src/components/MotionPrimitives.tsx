import React, { useEffect } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";

export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

export const MOTION_SPRING = {
  type: "spring" as const,
  stiffness: 430,
  damping: 32,
  mass: 0.78,
};

export const MOTION_PILL_SPRING = {
  type: "spring" as const,
  stiffness: 480,
  damping: 35,
  mass: 0.7,
};

export const PageTransition: React.FC<{
  pageKey: string;
  children: React.ReactNode;
  className?: string;
}> = ({ pageKey, children, className = "" }) => (
  <motion.div
    key={pageKey}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.18, ease: MOTION_EASE }}
    className={className}
  >
    {children}
  </motion.div>
);

export const AnimatedViewSwitcher: React.FC<{
  viewKey: string;
  children: React.ReactNode;
  className?: string;
}> = ({ viewKey, children, className = "" }) => (
  <LayoutGroup id={`reader-view-${viewKey}`}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 8, scale: 0.996 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.996 }}
        transition={{ duration: 0.16, ease: MOTION_EASE }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  </LayoutGroup>
);

export const AnimatedTabPill: React.FC<{
  layoutId: string;
  className?: string;
}> = ({ layoutId, className = "" }) => (
  <motion.span
    layoutId={layoutId}
    transition={MOTION_PILL_SPRING}
    aria-hidden="true"
    className={`pointer-events-none absolute inset-0 ${className}`}
  />
);

export const AnimatedTabPanel: React.FC<{
  tabKey: string;
  children: React.ReactNode;
  className?: string;
}> = ({ tabKey, children, className = "" }) => (
  <AnimatePresence mode="wait" initial={false}>
    <motion.div
      key={tabKey}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: MOTION_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  </AnimatePresence>
);

export const CollapsiblePanel: React.FC<{
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}> = ({ isOpen, children, className = "" }) => (
  <AnimatePresence initial={false}>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, height: 0, y: -4 }}
        animate={{ opacity: 1, height: "auto", y: 0 }}
        exit={{ opacity: 0, height: 0, y: -4 }}
        transition={{ duration: 0.2, ease: MOTION_EASE }}
        className={`overflow-hidden ${className}`}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

export const ModalMotion: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}> = ({
  isOpen,
  onClose,
  ariaLabel,
  maxWidthClass = "max-w-md",
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: MOTION_EASE }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={MOTION_SPRING}
            className={`w-full ${maxWidthClass}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

