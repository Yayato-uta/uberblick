import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconBtn, cx } from "./ui";

/**
 * Full-screen on a phone, a plain centred box on a desktop. No animation, no
 * rounding — it's a form that slides a sheet of paper over the one behind it.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center sm:items-start sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <button
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(10,16,13,0.45)]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={cx(
          "relative flex w-full flex-col border-ink bg-paper outline-none",
          "border-0 sm:border-2",
          width,
          "sm:max-h-[calc(100vh-5rem)]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-paper px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
          <div className="font-mono text-sm uppercase tracking-widest">{title}</div>
          <IconBtn onClick={onClose} tone="ink" aria-label="Close">
            <X size={18} />
          </IconBtn>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer && (
          <div className="border-t border-rule bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
